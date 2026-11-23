import { S3Client, HeadBucketCommand, CreateBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

// The S3 SDK talks to SeaweedFS, not AWS. Credentials stay on the API server.
export function createStorage(config) {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    forcePathStyle: true,
    maxAttempts: 2,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    requestHandler: { connectionTimeout: 3000, requestTimeout: 15000 },
  });
  const Bucket = config.bucket;
  let bucketReady;
  const storage = {
    async check() { await client.send(new HeadBucketCommand({ Bucket })); },
    async ensureBucket() {
      if (!bucketReady) {
        bucketReady = (async () => {
          try { await storage.check(); }
          catch (error) {
            if (error.$metadata?.httpStatusCode !== 404) throw error;
            try { await client.send(new CreateBucketCommand({ Bucket })); }
            catch (creationError) {
              if (creationError.name !== 'BucketAlreadyOwnedByYou') throw creationError;
            }
          }
        })().catch((error) => { bucketReady = undefined; throw error; });
      }
      return bucketReady;
    },
    async put(Key, Body, ContentType = 'image/webp') {
      await storage.ensureBucket();
      await client.send(new PutObjectCommand({ Bucket, Key, Body, ContentType }));
    },
    async get(Key) {
      const result = await client.send(new GetObjectCommand({ Bucket, Key }));
      return { body: result.Body, length: result.ContentLength };
    },
    async remove(Key) { await client.send(new DeleteObjectCommand({ Bucket, Key })); },
    async list(prefix = '') {
      const objects = [];
      let ContinuationToken;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken }));
        objects.push(...(page.Contents || []).map(o => ({ key: o.Key, bytes: o.Size })));
        ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (ContinuationToken);
      return objects;
    },
    close() { client.destroy(); },
  };
  return storage;
}
