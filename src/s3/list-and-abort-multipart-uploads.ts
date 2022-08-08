import { AbortMultipartUploadCommand, ListMultipartUploadsCommand } from "@aws-sdk/client-s3";
import {config as dotenv_config} from "dotenv";
dotenv_config();
import {getClient} from "./s3-utils";
import constants from "../constants";
import parseCmd from "command-line-args";
import { cliCheckHelp } from "../glacier/glacier-utils";

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
        name: "json",
        type: Boolean,
        description: "Outputs result as JSON",
        defaultValue: false,
    },
    {
        name: "abort",
        type: Boolean,
        description: "Aborts outstanding multipart upload jobs - defaults to false",
        defaultValue: false,
    },
    {
        name: "id",
        type: String,
        description: "If specified aborts the upload with the specified UploadId only - --abort must also be specified",
    },
];
const options = parseCmd(cmdOpts);
cliCheckHelp(cmdOpts, options, "Lists all multipart upload jobs and optionally aborts all or requested job");

const main = async (bucket: string) => {
    const client = getClient();
    const cmd = new ListMultipartUploadsCommand({
        Bucket: bucket
    })
    const output = await client.send(cmd);
    if (options["json"]) {
        console.log(output);
    } else {
        output.Uploads?.forEach((u) => {
            console.log(`Key <${u.Key}> UploadId <${u.UploadId}>`);
        })
    }
    if (!options["abort"]) {
        if (!options["json"]) console.log("Not asked to abort jobs so exiting");
        process.exit(0);
    }
    if (options["id"]) {
        if (!options["json"]) console.log(`Asked to only abort job ID <${options["id"]}>`);
    }

    // start to abort selected jobs
    await Promise.all(output.Uploads!.filter(u => options["id"] ? options["id"] === u.UploadId : true).map(async (u) => {
        return new Promise<void>(async (resolve) => {
            const cancelCmd = new AbortMultipartUploadCommand({
                UploadId: u.UploadId,
                Bucket: bucket,
                Key: u.Key
            })
            const cancelOut = await client.send(cancelCmd);
            console.log(cancelOut);
            resolve();
        })
    }))
}
main(options["bucket"]);