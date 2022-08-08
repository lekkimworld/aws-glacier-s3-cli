import { config as dotenv_config } from "dotenv";
dotenv_config();
import { cliErrorAndExit, cliCheckHelp, cliGetDefaultOptions, glacierJobStatus, glacierJobRetrieve, glacierJobInitiate } from "./glacier/glacier-utils";
import parseCmd from "command-line-args";
import fs from "fs/promises";
import {Task, TaskRunner, PromisifiedSemaphore} from "./taskrunner/taskrunner"

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

const options = parseCmd(cmdOpts);
cliCheckHelp(cmdOpts, options, "Prepare download of archives from inventory without JobId and Filename specified");
if (!options["filename"]) {
    cliErrorAndExit("Must specify filename of inventory JSON file");
}

class InitiateRetrievealTask extends Task {
    readonly vaultName: string;
    readonly archiveId: string;

    constructor(vaultName: string, archiveId: string) {
        super();
        this.vaultName = vaultName;
        this.archiveId = archiveId;
    }
    execute(): Promise<any> {
        return glacierJobInitiate(this.vaultName, this.archiveId);
    }
}

const main = async (vaultName: string, inventoryPath: string, count: number) => {
    // read inventory
    const inventory = JSON.parse((await fs.readFile(inventoryPath)).toString());

    // find the ones without JobId and Filename for and check status
    const eligibleList = inventory.ArchiveList.filter((a: any) => !Object.prototype.hasOwnProperty.call(a, "JobId")).splice(0, count);
    
    // create a task runner
    const sem = new PromisifiedSemaphore(1);
    const runner = new TaskRunner(2);
    runner.on("start", (task : Task) => {
        console.log(`Task <${task.index}> starting for archiveId <${(task as InitiateRetrievealTask).archiveId}>`);
    })
    runner.on("stop", async (err: any, task : Task, result: any) => {
        if (err) {
            console.log(`Task <${task.index}> failed`);
        } else {
            console.log(`Task <${task.index}> completed with result <${result}>`);
            await sem.take();
            const a = inventory.ArchiveList.find((a: any) => a.ArchiveId === (task as InitiateRetrievealTask).archiveId);
            a.JobId = result.jobId;
            a.Filename = `/Users/mheisterberg/glacierdownload/${a.ArchiveDescription}`;
            await fs.writeFile(inventoryPath, JSON.stringify(inventory));
            await sem.leave();
            console.log(`Wrote JobId to ${inventoryPath}`);
        }
    })
    await runner.execute(
        eligibleList.map((a: any): Task => {
            const task = new InitiateRetrievealTask(options["vault"], a.ArchiveId);
            return task;
        })
    );
    console.log("All tasks done");
};

main(options["vault"], options["filename"], options["count"]);
