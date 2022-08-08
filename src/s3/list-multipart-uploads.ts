import { ListMultipartUploadsCommand } from "@aws-sdk/client-s3";
import {config as dotenv_config} from "dotenv";
dotenv_config();
import {getClient} from "./s3-utils";

const main = async (bucket: string) => {
    const client = getClient();
    const cmd = new ListMultipartUploadsCommand({
        Bucket: bucket
    })
    const output = await client.send(cmd);
    console.log(output);
}
main("lekkim-foo");