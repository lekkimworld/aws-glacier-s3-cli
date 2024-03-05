# aws-glacier-s3-cli #

Utility commands to work with AWS S3 storage and AWS Glacier for historic reasons. I use these commands when I group media files from my family iPhones into tar-archives and put them into AWS S3 Deep Archive.  Used together with my `archive-grouper` utility (https://github.com/lekkimworld/archive-grouper).

## Running ##
``` bash
npm run install
npx ts-node src/s3/list-objects.ts --help
```

## S3 Examples ##
``` bash
npx ts-node src/s3/list-objects.ts \
    --bucket my_bucket

npx ts-node src/s3/upload.ts \
    --bucket my_bucket \
    --filepath /tmp/some_dir/some_filename.pdf \
    --storage-class STANDARD

npx ts-node src/s3/upload.ts \
    --bucket my_bucket \
    --filepath /tmp/some_dir/some_archive.tar \
    --storage-class DEEP_ARCHIVE
```

## Glacier Examples ##
``` bash
# list the vaults
npx ts-node src/glacier/list-vaults.ts

# inventory retrieval
npx ts-node src/glacier/job-initiate.ts --inventory-retrieval
Started retrieval - jobId <ndWExsqY0mzVMlsdowl6OMNGk2GwoF-kuLQ-VnWh3BcacHQwpLiMicVDQkoN-ikYPtNbtKDSvMI9Z0KYndlz_eM8ng5P>

# get job status
npx ts-node src/glacier/job-status.ts --id ndWExsqY0mzVMlsdowl6OMNGk2GwoF-kuLQ-VnWh3BcacHQwpLiMicVDQkoN-ikYPtNbtKDSvMI9Z0KYndlz_eM8ng5P
Status: <InProgress> Completed <false>

# retrieve inventory
npx ts-node src/glacier/job-retrieve.ts --id  --filename /tmp/inventory.json

# retrieve specific archive
npx ts-node src/glacier/job-initiate.ts --archive-retrieval --id foo
```
