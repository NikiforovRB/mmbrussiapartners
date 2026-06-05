import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const endpoint = process.env.S3_ENDPOINT ?? "https://s3.twcstorage.ru";
const region = process.env.S3_REGION ?? "ru-1";
const accessKeyId = process.env.S3_ACCESS_KEY ?? "";
const secretAccessKey = process.env.S3_SECRET_KEY ?? "";

export const S3_BUCKET = process.env.S3_BUCKET ?? "mmbrussia-baket";
export const S3_PREFIX = process.env.S3_PREFIX ?? "partners-portal/";

export const s3 = new S3Client({
  endpoint,
  region,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: true,
});

export const S3_FOLDERS = {
  deviceIds: `${S3_PREFIX}device-ids/`,
  licenses: `${S3_PREFIX}licenses/`,
  avatars: `${S3_PREFIX}avatars/`,
  exports: `${S3_PREFIX}exports/`,
  publicSnapshots: `${S3_PREFIX}public/`,
} as const;

export type S3Folder = keyof typeof S3_FOLDERS;

export async function uploadObject(
  folder: S3Folder,
  filename: string,
  body: Buffer | Uint8Array | string,
  contentType?: string,
): Promise<{ key: string }> {
  const key = `${S3_FOLDERS[folder]}${Date.now()}-${sanitizeFilename(filename)}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return { key };
}

export async function getDownloadUrl(key: string, expiresInSec = 60 * 5): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }),
    { expiresIn: expiresInSec },
  );
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}
