import { config as dotenv_config } from "dotenv";
dotenv_config();
import { getGlacierClient, cliErrorAndExit, cliCheckHelp, cliGetDefaultOptions } from "./glacier-utils";
import { InitiateJobCommand } from "@aws-sdk/client-glacier";
import constants from "../constants";
import parseCmd from "command-line-args";

const cmdOpts: Array<any> = cliGetDefaultOptions();
cmdOpts.push({
    name: "archive-retrieval",
    type: Boolean,
    alias: "a",
})
cmdOpts.push({
    name: "inventory-retrieval",
    type: Boolean,
    alias: "i",
})
cmdOpts.push({
    name: "id",
    type: String,
    description: "ID of archive to retrieve - required when using --archive-retrieval",
});

const options = parseCmd(cmdOpts);
cliCheckHelp(cmdOpts, options, "Initiate download of archive or inventory");
if (!options["inventory-retrieval"] && !options["archive-retrieval"]) {
    cliErrorAndExit("Must specify either --inventory-retrieval or --archive-retrieval")
}
if (options["archive-retrieval"] && !options["id"]) {
    cliErrorAndExit("When using --archive-retrieval you must specify an archive ID");
}

const main = async (vaultName: string, archiveId?: string) => {
    const client = await getGlacierClient();
    const cmd = new InitiateJobCommand({
        accountId: constants.ACCOUNT_ID,
        vaultName,
        jobParameters: {
            Type: !archiveId ? "inventory-retrieval" : "archive-retrieval",
            ArchiveId: archiveId
        },
    });
    const response = await client.send(cmd);
    if (options["json"]) {
        console.log(response);
    } else {
        console.log(`Started retrieval - jobId <${response.jobId}>`);
    }
    
};

main(options["vault"], options["id"]);
