import { config as dotenv_config } from "dotenv";
dotenv_config();
import { DeleteArchiveCommand } from "@aws-sdk/client-glacier";
import { getGlacierClient } from "./glacier-utils";
import constants from "../constants";
import parseCmd from "command-line-args";
import commandLineUsage from "command-line-usage";

const cmdOpts: Array<any> = [
    {
        name: "help",
        type: Boolean,
    },
    {
        name: "vault",
        type: String,
        alias: "v",
        defaultValue: constants.GLACIER.DEFAULT_VAULT,
        description: `Vault to connect to - defaults to "${constants.GLACIER.DEFAULT_VAULT}"`,
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
        description: "ID of archive to delete - required",
    },
];
const usage = commandLineUsage([
    {
        header: "Initiate delete of archive",
    },
    {
        header: "Options",
        optionList: cmdOpts,
    },
]);
const options = parseCmd(cmdOpts);
if (options.help) {
    console.log(usage);
    process.exit(0);
}
if (!options["id"]) {
    console.log("ERROR: You must specify an archive ID to delete. Use --help for options.");
    process.exit(1);
}
const vaultName = options["vault"];

const main = async (vaultName: string, archiveId: string) => {
    const client = await getGlacierClient();
    const deleteCmd = new DeleteArchiveCommand({
        accountId: "-",
        archiveId,
        vaultName,
    });
    const response = await client.send(deleteCmd);
    if (options.json) {
        console.log(response);
    } else {
        console.log(`Initiated delete of archiveId <${archiveId}>`);
    }
};

main(vaultName, options["id"]);
