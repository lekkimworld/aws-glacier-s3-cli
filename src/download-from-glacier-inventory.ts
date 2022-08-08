import { config as dotenv_config } from "dotenv";
dotenv_config();
import { cliErrorAndExit, cliCheckHelp, cliGetDefaultOptions, glacierJobStatus, glacierJobRetrieve } from "./glacier/glacier-utils";
import parseCmd from "command-line-args";
import fs from "fs/promises";
import {Task, TaskRunner, PromisifiedSemaphore} from "./taskrunner/taskrunner"
import byteSize from "byte-size";

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
    description: "Maximum number of archives to download - defaults to 10",
    defaultValue: 10
});
cmdOpts.push({
    name: "size-only",
    alias: "s",
    type: Boolean,
    description: "Show size of archives to be downloaded and then exit",
    defaultValue: false,
});
cmdOpts.push({
    name: "status-only",
    type: Boolean,
    description: "Only check status of preparation but do not start actual downloads",
    defaultValue: false,
});
cmdOpts.push({
    name: "process-ready",
    type: Boolean,
    description: "Start processing the ready archives",
    defaultValue: false,
});

const options = parseCmd(cmdOpts);
cliCheckHelp(cmdOpts, options, "Initiate download of all archives in inventory with JobId and Filename specified");
if (!options["filename"]) {
    cliErrorAndExit("Must specify filename of inventory JSON file");
}

class DownloadArchiveTask extends Task {
    readonly vaultName: string;
    readonly jobId: string;
    readonly filename: string;

    constructor(vaultName: string, jobId: string, filename: string) {
        super();
        this.vaultName = vaultName;
        this.jobId = jobId;
        this.filename = filename;
    }
    execute(): Promise<any> {
        return glacierJobRetrieve(this.vaultName, this.jobId, this.filename);
    }
}

const main = async (vaultName: string, inventoryPath: string, count: number) => {
    // read inventory
    const inventory = JSON.parse((await fs.readFile(inventoryPath)).toString());

    // find the ones we have JobId and Filename for and check status
    const eligibleListInitial = inventory
        .ArchiveList
        .filter((a: any) => a.JobId && a.Filename && !Object.prototype.hasOwnProperty.call(a, "Downloaded"));
    if (!eligibleListInitial.length) {
        console.log("No archives eligible - exiting");
        process.exit(0);
    }
    let eligibleList : Array<any> = eligibleListInitial.slice(0, count);
    console.log(`Reduced eligible list from <${eligibleListInitial.length}> to <${eligibleList.length}>`);
    const statusList = await Promise.all(eligibleList.map((a: any) => glacierJobStatus(vaultName, a.JobId)));
    const readyList = statusList.filter((s: any) => s.status === "Succeeded");
    if (options["process-ready"]) {
        eligibleList = eligibleList.filter((a:any) => {
            const s = readyList.find((s: any) => s.archiveId === a.ArchiveId);
            return s !== undefined;
        })
    } else {
        console.log(`Eligible <${eligibleList.length}> Ready <${readyList.length}>`);
        if (eligibleList.length !== readyList.length) {
            console.log("Not all are ready - exiting");
            process.exit(0);
        }
        console.log("All archives are ready for download");
    }
    if (options["status-only"]) {
        console.log("Asked to exit as --status-only supplied");
        process.exit(0);
    }
    if (options["size-only"]) {
        const size = eligibleList.reduce((prev: number, a: any) => {
            return a.Size + prev;
        }, 0);
        const bs = byteSize(size);
        console.log(`Size is <${bs.value}> ${bs.unit}`);
        process.exit(0);
    }

    // create a task runner
    const sem = new PromisifiedSemaphore(1);
    const runner = new TaskRunner(2);
    runner.on("start", (task : Task) => {
        console.log(`Task <${task.index}> starting for jobId <${(task as DownloadArchiveTask).jobId}> filename <${(task as DownloadArchiveTask).filename}>`);
    })
    runner.on("stop", async (err: any, task : Task, result: any) => {
        if (err) {
            console.log(`Task <${task.index}> failed`);
        } else {
            console.log(`Task <${task.index}> completed with result <${result}>`);
            await sem.take();
            const a = inventory.ArchiveList.find((a: any) => a.JobId === (task as DownloadArchiveTask).jobId);
            a.Downloaded = true;
            await fs.writeFile(inventoryPath, JSON.stringify(inventory));
            await sem.leave();
            console.log(`Wrote Downloaded=true to ${inventoryPath}`);
        }
    })
    await runner.execute(
        eligibleList.map((a: any): Task => {
            const task = new DownloadArchiveTask(options["vault"], a.JobId, a.Filename);
            return task;
        })
    );
    console.log("All tasks done");
};

main(options["vault"], options["filename"], options["count"]);
