import { config as dotenv_config } from "dotenv";
dotenv_config();
import {
    getGlacierClient,
    cliErrorAndExit,
    cliCheckHelp,
    cliGetDefaultOptions,
    glacierJobRetrieve,
    JobRetrieveError,
} from "./glacier-utils";
import constants from "../constants";
import parseCmd from "command-line-args";

const cmdOpts: Array<any> = cliGetDefaultOptions();
cmdOpts.push({
    name: "id",
    type: String,
    description: "ID of job to download data for",
});
cmdOpts.push({
    name: "filename",
    alias: "f",
    type: String,
    description: "The resulting filename"
})
const options = parseCmd(cmdOpts);
cliCheckHelp(cmdOpts, options, "Download data once a job has completed");
if (!options["id"]) {
    cliErrorAndExit("You must specify a job ID");
}
if (!options["filename"]) {
    cliErrorAndExit("You must specify a filename to write to");
}

const main = async (vaultName: string, jobId: string, filename: string) => {
    try {
        const result = await glacierJobRetrieve(vaultName, jobId, filename);
        if (options["json"]) {
            console.log(result);
        } else {
            console.log(`Using jobId <${result.jobId}> to extract from <${result.vaultName}> and writing to <${result.filename}>`);
        }

    } catch (err: any) {
        const ex = err as JobRetrieveError;
        if (options["json"]) {
            console.log({ status: ex.status, code: ex.code, jobId: ex.jobId, vaultName: ex.vaultName });
        } else {
            console.log(`Error initiating download of jobId <${ex.jobId}> due to code <${ex.code}>`);
        }
        process.exit(1);
    }
};
main(options["vault"], options["id"], options["filename"]);
