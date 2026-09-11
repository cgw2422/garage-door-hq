import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { PresignedUpload, StorageDriver } from './types'
import { StorageError } from './types'

/**
 * Cloudflare R2 via its S3-compatible API.
 *
 * The bucket must NOT have public access enabled and must NOT be attached to a
 * public r2.dev domain. Every read is brokered by the application.
 */
export interface R2Config {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  /** Override for a custom endpoint; derived from the account id otherwise. */
  endpoint?: string
}

export function readR2ConfigFromEnv(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null
  return { accountId, accessKeyId, secretAccessKey, bucket, endpoint: process.env.R2_ENDPOINT }
}

export function createR2Driver(config: R2Config): StorageDriver {
  const client = new S3Client({
    // R2 ignores the region but the SDK requires one.
    region: 'auto',
    endpoint: config.endpoint ?? `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  })

  return {
    name: 'r2',

    async presignUpload({ key, contentType, byteSize, expiresInSeconds = 300 }): Promise<PresignedUpload> {
      // ContentLength is signed, so the presigned URL cannot be reused to push
      // an object of a different size than the one that was authorized.
      const command = new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: byteSize,
      })

      const url = await getSignedUrl(client, command, {
        expiresIn: expiresInSeconds,
        signableHeaders: new Set(['content-type', 'content-length']),
      })

      return {
        url,
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        expiresInSeconds,
      }
    },

    async presignDownload({ key, expiresInSeconds = 120, filename }) {
      const command = new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
        ...(filename
          ? { ResponseContentDisposition: `inline; filename="${filename.replace(/"/g, '')}"` }
          : {}),
      })
      return getSignedUrl(client, command, { expiresIn: expiresInSeconds })
    },

    async put({ key, body, contentType }) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ContentLength: body.byteLength,
        }),
      )
    },

    async head(key) {
      try {
        const result = await client.send(
          new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
        )
        return {
          byteSize: Number(result.ContentLength ?? 0),
          contentType: result.ContentType ?? null,
        }
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode
        if (status === 404 || status === 403) return null
        throw new StorageError(`R2 head failed for ${key}: ${(error as Error).message}`)
      }
    },

    async readHead(key, byteCount) {
      try {
        const result = await client.send(
          new GetObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Range: `bytes=0-${Math.max(byteCount - 1, 0)}`,
          }),
        )
        const body = await result.Body?.transformToByteArray()
        return body ?? null
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode
        if (status === 404 || status === 403) return null
        throw new StorageError(`R2 range read failed for ${key}: ${(error as Error).message}`)
      }
    },

    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }))
    },
  }
}
