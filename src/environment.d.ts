declare global {
    namespace NodeJS {
        interface ProcessEnv {
            // heroku
            PORT?: string;

            AWS_ACCESS_KEY_ID: string;
            AWS_SECRET_ACCESS_KEY: string;
            AWS_ACCOUNT_ID: string;

            GLACIER_DEFAULT_VAULT: string;
            S3_DEFAULT_BUCKET: string;
        }
    }
}

// If this file has no import/export statements (i.e. is a script)
// convert it into a module by adding an empty export statement.
export {};
