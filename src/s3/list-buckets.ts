import {config as dotenv_config} from "dotenv";
dotenv_config();
import {getClient, getBuckets} from "./s3-utils";

const main = async (getRegion? : boolean) => {
    const client = getClient();
    const buckets = await getBuckets(client, true);
    console.log(buckets);
}
main(true);