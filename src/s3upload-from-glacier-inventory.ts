import { config as dotenv_config } from "dotenv";
dotenv_config();
import { cliErrorAndExit, cliCheckHelp, cliGetDefaultOptions } from "./glacier/glacier-utils";
import parseCmd from "command-line-args";
import { pipeline } from "stream";
import fs from "fs/promises";
import { createReadStream } from "fs";
import { Task, TaskRunner, PromisifiedSemaphore, ChunkTaskWritableStream, TaskResult } from "./taskrunner/taskrunner";
import {
    CompleteMultipartUploadCommand,
    CreateMultipartUploadCommand,
    S3Client,
    UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getClient, StorageClass } from "./s3/s3-utils";
import constants from "./constants";

const cmdOpts: Array<any> = cliGetDefaultOptions();
cmdOpts.push({
    name: "filename",
    alias: "f",
    type: String,
    description: "Path to inventory file",
});
cmdOpts.push({
    name: "count",
    alias: "c",
    type: Number,
    description: "Number of archives to initiate download for - defaults to 20",
    defaultValue: 20
});
cmdOpts.push({
    name: "bucket",
    alias: "b",
    type: String,
    description: `The S3 bucket to upload to - defaults to ${constants.S3.DEFAULT_BUCKET}`,
    defaultValue: constants.S3.DEFAULT_BUCKET,
});

const options = parseCmd(cmdOpts);
cliCheckHelp(cmdOpts, options, "Uploads archives from local disk to S3 deep archive from inventory if they are marked as Downloaded and marks as Uploaded");
if (!options["filename"]) {
    cliErrorAndExit("Must specify filename of inventory JSON file");
}

class S3UploadTask extends Task {
    readonly archiveId : string;
    readonly filepath : string;
    readonly bucket: string;
    readonly uploadKey: string;
    storageClass: string = StorageClass.DeepArchive;

    constructor(archiveId: string, filepath: string, bucket: string, uploadKey: string) {
        super();
        this.archiveId = archiveId;
        this.bucket = bucket;
        this.filepath = filepath;
        this.uploadKey = uploadKey;
    }

    async execute(): Promise<any> {
        const s = await fs.stat(this.filepath);
        const size = s.size;
        const length = 1024 * 1024 * 25;
        const chunks = Math.ceil(size / length);
        console.log(`File <${this.filepath}> is <${size}> bytes resulting in <${chunks}> chunks`);

        // get client
        const s3client = getClient();

        // create upload
        const createUploadCmd = new CreateMultipartUploadCommand({
            Bucket: this.bucket,
            Key: this.uploadKey,
            StorageClass: this.storageClass,
        });

        try {
            const createUploadOutput = await s3client.send(createUploadCmd);
            var uploadId = createUploadOutput.UploadId;
            if (!uploadId) throw new Error("No uploadId found");
        } catch (err) {
            console.log("Unable to initialize upload", err);
            return process.exit(1);
        }

        // return promise
        return new Promise<void>((resolve, reject) => {
            // create task runner for part upload
            const runner = new TaskRunner(5);
            runner.setErrorCallback((task, err) => {
                console.log(`Task ${task} failed - aborting`, err);
                return false;
            });
            runner.on("begin", (task, idx) => {
                console.log("TaskRunner - begin");
            });
            runner.on("end", async () => {
                const results = await runner.results();
                const completeUploadCmd = new CompleteMultipartUploadCommand({
                    UploadId: uploadId,
                    Key: this.uploadKey,
                    Bucket: this.bucket,
                    MultipartUpload: {
                        Parts: results
                            .sort((a, b) => {
                                const rc = a.task.index! - b.task.index!;
                                return rc;
                            })
                            .map((result) => {
                                return {
                                    ETag: result.result,
                                    PartNumber: result.task.index,
                                };
                            }),
                    },
                });
                const completeUploadOutput = await s3client.send(completeUploadCmd);
                console.log("Uploaded file...");

                // resolve task promise
                resolve();
            });
            runner.on("done", (err: any | undefined, task: Task) => {
                console.log(`Done <${task.index}>`);
            });

            // stream file and once we have a buffer enqueue a task
            pipeline(
                createReadStream(this.filepath, {
                    highWaterMark: length,
                }),
                new ChunkTaskWritableStream(runner, (chunk: Buffer) => {
                    return new S3MultipartUploadTask(s3client, this.bucket, uploadId!, this.uploadKey, chunk);
                }),
                (err) => {
                    if (err) {
                        console.log("pipeline error", err);
                    } else {
                        console.log("Read all file parts - waiting for remaining upload tasks");
                        runner.end();
                    }
                }
            );
            runner.execute();
        });
    }
}

class S3MultipartUploadTask extends Task {
    _s3client: S3Client;
    _bucket: string;
    _buf: Buffer;
    _uploadId: string;
    _uploadKey: string;

    constructor(s3client: S3Client, bucket: string, uploadId: string, uploadKey: string, chunk: Buffer) {
        super();
        this._s3client = s3client;
        this._bucket = bucket;
        this._buf = chunk;
        this._uploadId = uploadId;
        this._uploadKey = uploadKey;
    }
    async execute(): Promise<any | undefined> {
        const uploadCmd = new UploadPartCommand({
            Bucket: this._bucket,
            PartNumber: this.index,
            UploadId: this._uploadId,
            Key: this._uploadKey,
            Body: this._buf,
        });
        const uploadOutput = await this._s3client.send(uploadCmd);
        console.log(`Uploaded part with index <${this.index}> and got ETag <${uploadOutput.ETag}>`);
        return uploadOutput.ETag;
    }
}

const main = async (inventoryPath: string, bucket:string, count: number) => {
    // read inventory
    const inventory = JSON.parse((await fs.readFile(inventoryPath)).toString());

    // find the ones marked as downloaded
    const eligibleListInitial = inventory.ArchiveList.filter(
        (a: any) =>
            a.Filename &&
            Object.prototype.hasOwnProperty.call(a, "Downloaded") &&
            !Object.prototype.hasOwnProperty.call(a, "Uploaded")
    );
    if (!eligibleListInitial.length) {
        console.log("No archives eligible - exiting");
        process.exit(0);
    }
    const eligibleList = eligibleListInitial.slice(0, count);
    console.log(`Reduced eligible list from <${eligibleListInitial.length}> to <${eligibleList.length}>`);
    
    // create a task runner
    const sem = new PromisifiedSemaphore(1);
    const runner = new TaskRunner(1);
    runner.on("start", (task : Task) => {
        console.log(`Task <${task.index}> starting for archiveId <${(task as S3UploadTask).archiveId}>`);
    })
    runner.on("stop", async (err: any, task : Task, result: any) => {
        if (err) {
            console.log(`Task <${task.index}> failed`);
        } else {
            console.log(`Task <${task.index}> completed with result <${result}>`);
            await sem.take();
            const a = inventory.ArchiveList.find((a: any) => a.ArchiveId === (task as S3UploadTask).archiveId);
            a.Uploaded = true;
            await fs.writeFile(inventoryPath, JSON.stringify(inventory));
            await sem.leave();
            console.log(`Wrote Uploaded to ${inventoryPath}`);
        }
    })
    await runner.execute(
        eligibleList.map((a: any): Task => {
            const filenameParts = a.Filename.split("/");
            const task = new S3UploadTask(a.ArchiveId, a.Filename, bucket, filenameParts[filenameParts.length-1]);
            return task;
        })
    );
    console.log("All tasks done");
};

main(options["filename"], options["bucket"], options["count"]);
