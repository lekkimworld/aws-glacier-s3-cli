import {
    DescribeJobCommand,
    GetJobOutputCommand, DescribeVaultOutput,
    GlacierClient,
    ListVaultsCommand,
    InitiateJobCommand,
    GetJobOutputCommandOutput,
} from "@aws-sdk/client-glacier";
import { ReadStream } from "fs";
import constants from "../constants";
import commandLineUsage from "command-line-usage";
import { writeFile } from "fs/promises";

export const getGlacierClient = (region? : string) : GlacierClient => {
    const client = new GlacierClient({
        credentials: constants.CREDENTIALS,
        region: region || constants.REGION,
    });
    
    // return
    return client;
}

export const getGlacierVault = async (client: GlacierClient, vaultName: string): Promise<DescribeVaultOutput> => {
    const listVaultCmd = new ListVaultsCommand({
        accountId: "-",
    });
    let response = await client.send(listVaultCmd);
    const filteredVaults = (response.VaultList || []).filter((v) => v.VaultName === vaultName);
    if (filteredVaults.length !== 1) throw new Error(`Unable to find vault <${vaultName}>`);
    const vault = filteredVaults[0];

    // return
    return vault;
};

export const cliErrorAndExit = (msg: string) => {
    console.log(`ERROR: ${msg}. Use --help for options.`);
    process.exit(1);
}

export const cliCheckHelp = (cmdOpts: Array<any>, options: any, header: string) => {
    if (options.help) {
        const usage = commandLineUsage([
            {
                header,
            },
            {
                header: "Options",
                optionList: cmdOpts,
            },
        ]);

        console.log(usage);
        process.exit(0);
    }
};

export const cliGetDefaultOptions = () => {
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
        defaultValue: false
    }];
    return cmdOpts;
}

export const glacierJobStatus = async (vaultName: string, jobId: string) : Promise<any> => {
    const client = await getGlacierClient();
    const cmd = new DescribeJobCommand({
        accountId: constants.ACCOUNT_ID,
        vaultName,
        jobId,
    });
    const response = await client.send(cmd);
    const status = response.StatusCode;
    const completed = response.Completed;
    const archiveId = response.ArchiveId;

    return { status, completed, jobId, vaultName, archiveId };
}

export class JobRetrieveError extends Error {
    readonly status: string;
    readonly code: string;
    readonly vaultName: string;
    readonly jobId: string;

    constructor(status: string, code: string, vaultName: string, jobId: string) {
        super();
        this.status = status;
        this.code = code;
        this.vaultName = vaultName;
        this.jobId = jobId;
    }
}
export const glacierJobRetrieve = async (vaultName: string, jobId: string, filename: string) : Promise<any> => {
    const client = await getGlacierClient();
    const cmd = new GetJobOutputCommand({
        accountId: constants.ACCOUNT_ID,
        vaultName,
        jobId,
    });

    let response : GetJobOutputCommandOutput | undefined;
    try {
        response = await client.send(cmd);
    } catch (e: any) {
        throw new JobRetrieveError(status, e.code, vaultName, jobId);
    }
    if (response && response.body) {
        await writeFile(filename, response!.body as ReadStream);
        /*
        return new Promise<any>((resolve, reject) => {
            const s = response!.body as ReadStream;

            let buf: Buffer | undefined;
            s.on("data", (data: Buffer) => {
                if (!buf) {
                    buf = data;
                } else {
                    buf = Buffer.concat([buf, data], buf.length + data.length);
                }
            });
            s.on("error", () => {
                reject();
            })
            s.on("end", () => {
                writeFileSync(filename, buf!);
                resolve({ status: "done", filename, vaultName, jobId });
            });
        })
        */
    }
}

export const glacierJobInitiate = async (vaultName: string, archiveId?: string) : Promise<any> => {
    const client = await getGlacierClient();
    const cmd = new InitiateJobCommand({
        accountId: constants.ACCOUNT_ID,
        vaultName,
        jobParameters: {
            Type: !archiveId ? "inventory-retrieval" : "archive-retrieval",
            ArchiveId: archiveId,
        },
    });
    const response = await client.send(cmd);
    return {archiveId, vaultName, "jobId": response.jobId};
};