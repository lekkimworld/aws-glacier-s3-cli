import { config as dotenv_config } from "dotenv";
dotenv_config();
import { cliErrorAndExit, cliCheckHelp, cliGetDefaultOptions } from "./glacier/glacier-utils";
import parseCmd from "command-line-args";
import fs from "fs/promises";
import { Task, TaskRunner, PromisifiedSemaphore } from "./taskrunner/taskrunner";
import { S3UploadTask } from "./s3/s3-utils";
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
            const task = new S3UploadTask(a.Filename, bucket, filenameParts[filenameParts.length - 1], a.ArchiveId);
            return task;
        })
    );
    console.log("All tasks done");
};

main(options["filename"], options["bucket"], options["count"]);
