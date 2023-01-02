import {config as dotenv_config} from "dotenv";
dotenv_config();
import constants from "../constants";
import {S3UploadTask, StorageClass } from "./s3-utils";
import { TaskRunner } from "../taskrunner/taskrunner";
import parseCmd from "command-line-args";
import { cliCheckHelp, cliErrorAndExit } from "../glacier/glacier-utils";
import { stat } from "fs/promises";

const cmdOpts: Array<any> = [
    {
        name: "help",
        type: Boolean,
    },
    {
        name: "bucket",
        type: String,
        alias: "b",
        defaultValue: constants.S3.DEFAULT_BUCKET,
        description: `Bucket to connect to - defaults to "${constants.S3.DEFAULT_BUCKET}"`,
    },
    {
        name: "filepath",
        type: String,
        alias: "f",
        description: `Full path of file to upload"`,
    },
    {
        name: "storage-class",
        type: String,
        alias: "s",
        defaultValue: constants.S3.DEFAULT_STORAGE_CLASS,
        description: `Storage class to use (one of ${StorageClass.Standard} or ${StorageClass.DeepArchive}) - defaults to ${constants.S3.DEFAULT_STORAGE_CLASS}"`,
    },
    {
        name: "json",
        type: Boolean,
        description: "Outputs result as JSON",
        defaultValue: false,
    },
];
const options = parseCmd(cmdOpts);
cliCheckHelp(cmdOpts, options, "Uploads an object to a S3 bucket");
if (!options["bucket"]) {
    cliErrorAndExit("Must specify bucket name to upload to");
}
if (!options["filepath"]) {
    cliErrorAndExit("Must specify full path to file to upload");
}
if (![StorageClass.DeepArchive, StorageClass.Standard].includes(options["storage-class"])) {
    cliErrorAndExit("Must specify a valid storage class");
}

const main = async (bucketName: string, filepath: string, storageClass: string) => {
    try {
        // ensure we have file
        await stat(filepath);
    } catch (err) {
        console.error(`There is no file at ${filepath}`);
        return;
    }

    // get filename
    const filenameParts = filepath.split("/");
    const filename = filenameParts[filenameParts.length - 1];

    // create a task runner
    const runner = new TaskRunner(1);
    await runner.execute([new S3UploadTask(filepath, bucketName, filename)]);
    console.log("All tasks done");
};

main(options["bucket"], options["filepath"], options["storage-class"]);
