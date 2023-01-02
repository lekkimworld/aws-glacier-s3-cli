import {
    GetBucketLocationCommand,
    ListBucketsCommand,
    CompleteMultipartUploadCommand,
    CreateMultipartUploadCommand,
    S3Client,
    UploadPartCommand,
} from "@aws-sdk/client-s3";
import { pipeline } from "stream";
import { createReadStream } from "fs";
import constants from "../constants";
import { Task, TaskRunner, ChunkTaskWritableStream } from "../taskrunner/taskrunner"; 
import fs from "fs/promises";

export const StorageClass = {
    "Standard": "STANDARD",
    "DeepArchive": "DEEP_ARCHIVE"
}

export interface BucketWithRegion {
    name: string;
    date: Date;
    region: string | undefined;
}

export const getClient = (region? : string) : S3Client => {
    const client = new S3Client({
        region: region || constants.REGION,
        credentials: constants.CREDENTIALS 
    });
    return client;
}

export const getBuckets = async (client: S3Client, lookupRegions?: boolean) : Promise<BucketWithRegion[]>  => {
    const cmd = new ListBucketsCommand({});
    const response = await client.send(cmd);
    if (!response.Buckets) {
        return [];
    }

    // map into custom datatype
    let buckets = response.Buckets!.map((b): BucketWithRegion => {
        return { name: b.Name!, date: b.CreationDate!, region: undefined };
    });
    if (buckets && lookupRegions) {
        buckets = await Promise.all(
            buckets.map(async (b): Promise<BucketWithRegion> => {
                const cmd = new GetBucketLocationCommand({
                    Bucket: b.name,
                });
                const response = await client.send(cmd);
                const region =
                    response.LocationConstraint === "EU"
                        ? "eu-west-1"
                        : response.LocationConstraint === "US"
                        ? "us-east-1"
                        : response.LocationConstraint;
                return {
                    name: b.name,
                    date: b.date,
                    region,
                };
            })
        );
    }
    return buckets;
}

export class S3UploadTask extends Task {
    readonly archiveId? : string;
    readonly filepath : string;
    readonly bucket: string;
    readonly uploadKey: string;
    storageClass: string = StorageClass.DeepArchive;

    constructor(filepath: string, bucket: string, uploadKey: string, archiveId?: string ) {
        super();
        this.archiveId = archiveId;
        this.bucket = bucket;
        this.filepath = filepath;
        this.uploadKey = uploadKey
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
