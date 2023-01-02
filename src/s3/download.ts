import {config as dotenv_config} from "dotenv";
dotenv_config();
import {getClient} from "./s3-utils";
import {} from "@aws-sdk/client-s3";

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
        name: "id",
        type: String,
        description: "If specified aborts the upload with the specified UploadId only - --abort must also be specified",
    },
];
const options = parseCmd(cmdOpts);
cliCheckHelp(cmdOpts, options, "Downloads an archive from S3");


const main = async () => {
    const client = getClient();
    
}
main(options["bucket"], options["id"]);