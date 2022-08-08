import {config as dotenv_config} from "dotenv";
dotenv_config();
import {getBuckets, getClient} from "./s3-utils";
import {ListObjectsCommand} from "@aws-sdk/client-s3";

const main = async (bucketName: string) => {
    let client = getClient();
    const bucket = (await getBuckets(client, true)).filter(b => b.name === bucketName)[0];
    client = getClient(bucket.region);
    const cmd = new ListObjectsCommand({
        Bucket: bucket.name,
    });
    const response = await client.send(cmd);
    console.log(JSON.stringify(response));
}
main("lekkim-photo-backup");