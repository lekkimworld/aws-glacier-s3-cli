# aws-glacier-s3-cli #

Utility commands to work with AWS S3 storage and AWS Glacier for historic reasons. I use these commands when I group media files from my family iPhones into tar-archives and put them into AWS S3 Deep Archive.  Used together with my `archive-grouper` utility (https://github.com/lekkimworld/archive-grouper).

## Running ##
```
npm run install
npx ts-node src/s3/list-objects.ts --help
```

## Examples ##
```
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
