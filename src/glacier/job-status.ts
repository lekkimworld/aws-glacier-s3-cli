import { config as dotenv_config } from "dotenv";
dotenv_config();
import { getGlacierClient, cliErrorAndExit, cliCheckHelp, cliGetDefaultOptions, glacierJobStatus } from "./glacier-utils";
import constants from "../constants";
import parseCmd from "command-line-args";

const cmdOpts: Array<any> = cliGetDefaultOptions();
cmdOpts.push({
        name: "id",
        type: String,
        description: "ID of job to query status for",
    },
);
const options = parseCmd(cmdOpts);
cliCheckHelp(cmdOpts, options, "Check status of job");
if (!options["id"]) {
    cliErrorAndExit("You must specify a job ID");
}

const main = async (vaultName: string, jobId: string) => {
    const result = await(glacierJobStatus(vaultName, jobId));
    if (options["json"]) {
        console.log(result);
    } else {
        console.log(`Status: <${result.status}> Completed <${result.completed}>`);
    }
};

main(options["vault"], options["id"]);
