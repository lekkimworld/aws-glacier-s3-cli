import { GetBucketLocationCommand, ListBucketsCommand, S3Client } from "@aws-sdk/client-s3";
import constants from "../constants";

export const StorageClass = {
    "Standard": "STANDARD",
    "DeepArchive": "DEEP_ARCHIVE"
}

export interface BucketWithRegion {
    name: string;
    date: Date;
    region: string | undefined;
}

export const getClient = (region? : string) : S3Client => {
    const client = new S3Client({
        region: region || constants.REGION,
        credentials: constants.CREDENTIALS 
    });
    return client;
}

export const getBuckets = async (client: S3Client, lookupRegions?: boolean) : Promise<BucketWithRegion[]>  => {
    const cmd = new ListBucketsCommand({});
    const response = await client.send(cmd);
    if (!response.Buckets) {
        return [];
    }

    // map into custom datatype
    let buckets = response.Buckets!.map((b): BucketWithRegion => {
        return { name: b.Name!, date: b.CreationDate!, region: undefined };
    });
    if (buckets && lookupRegions) {
        buckets = await Promise.all(
            buckets.map(async (b): Promise<BucketWithRegion> => {
                const cmd = new GetBucketLocationCommand({
                    Bucket: b.name,
                });
                const response = await client.send(cmd);
                const region =
                    response.LocationConstraint === "EU"
                        ? "eu-west-1"
                        : response.LocationConstraint === "US"
                        ? "us-east-1"
                        : response.LocationConstraint;
                return {
                    name: b.name,
                    date: b.date,
                    region,
                };
            })
        );
    }
    return buckets;
}