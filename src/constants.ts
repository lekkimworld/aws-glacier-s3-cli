import { StorageClass } from "./s3/s3-utils";

export default {
    GLACIER: {
        DEFAULT_VAULT: process.env.GLACIER_DEFAULT_VAULT!
    },
    S3: {
        DEFAULT_BUCKET: process.env.S3_DEFAULT_BUCKET!,
        DEFAULT_STORAGE_CLASS: StorageClass.DeepArchive
    },
    REGION: "eu-central-1",
    ACCOUNT_ID: process.env.AWS_ACCOUNT_ID || "-",
    CREDENTIALS: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
};