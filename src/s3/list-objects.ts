import {config as dotenv_config} from "dotenv";
dotenv_config();
import constants from "../constants";
import {getBuckets, getClient} from "./s3-utils";
import {ListObjectsCommand} from "@aws-sdk/client-s3";
import parseCmd from "command-line-args";
import { cliCheckHelp, cliErrorAndExit } from "../glacier/glacier-utils";

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
    }
];
const options = parseCmd(cmdOpts);
cliCheckHelp(cmdOpts, options, "List objects in a S3 bucket");
if (!options["bucket"]) {
    cliErrorAndExit("Must specify bucket name to list");
}

const main = async (bucketName: string) => {
    let client = getClient();
    const bucket = (await getBuckets(client, true)).filter(b => b.name === bucketName)[0];
    client = getClient(bucket.region);
    const cmd = new ListObjectsCommand({
        Bucket: bucket.name,
    });
    const response = await client.send(cmd);
    response.Contents!.forEach(c => {
        console.log(c.Key);
    })
}
main(options["bucket"]);