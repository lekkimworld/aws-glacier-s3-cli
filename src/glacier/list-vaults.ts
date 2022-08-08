import { config as dotenv_config } from "dotenv";
dotenv_config();
import { ListVaultsCommand } from "@aws-sdk/client-glacier";
import constants from "../constants";
import { getGlacierClient } from "./glacier-utils";

const main = async () => {
    const client = getGlacierClient();
    const deleteCmd = new ListVaultsCommand({
        accountId: constants.ACCOUNT_ID,
    });
    const response = await client.send(deleteCmd);
    console.log(response);
};

main();
