import { config as dotenv_config } from "dotenv";
dotenv_config();
import { getGlacierClient } from "./glacier-utils";
import fs from "fs/promises";
import { UploadArchiveCommand } from "@aws-sdk/client-glacier";
import moment from "moment";
import constants from "../constants";

const main = async (vaultName: string, fileName: string) => {
    const client = await getGlacierClient();
    const buffer = await fs.readFile(fileName);
    const uploadCmd = new UploadArchiveCommand({
        accountId: constants.ACCOUNT_ID,
        body: buffer,
        vaultName: vaultName,
        archiveDescription: fileName,
    });
    const start = moment();
    const response = await client.send(uploadCmd);
    const end = moment();
    const diff = end.diff(start, "seconds");
    console.log(`Upload took <${diff}> secs`);
    console.log(response);
};

main("photo-backup", `/tmp/m/mikkel_iphone_2020_01.tar`);
