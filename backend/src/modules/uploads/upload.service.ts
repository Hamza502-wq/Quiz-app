import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { env } from '../../config/env';
import { badRequest } from '../../lib/errors';
import { prisma } from '../../lib/prisma';

export const UPLOAD_ROOT = path.resolve(env.UPLOAD_DIR);
export const PUBLIC_DIR = path.join(UPLOAD_ROOT, 'public');
export const PRIVATE_DIR = path.join(UPLOAD_ROOT, 'private');

export type UploadKind = 'product' | 'vendor' | 'avatar' | 'document' | 'proof';
const PRIVATE_KINDS: UploadKind[] = ['document', 'proof'];

export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export interface StoredImage {
  url: string;
  thumbUrl: string;
  isPrivate: boolean;
}

/**
 * Re-encodes an uploaded image to WebP (strips EXIF/GPS metadata), producing a
 * full-size version (max 1280px) and a low-data thumbnail (max 360px).
 * Documents and delivery proofs are stored privately and served only to
 * authorised users. Files go to UPLOAD_DIR, or into the database when
 * UPLOAD_STORAGE=database (hosts without a persistent disk).
 */
export async function storeImage(buffer: Buffer, kind: UploadKind, userId: string): Promise<StoredImage> {
  const isPrivate = PRIVATE_KINDS.includes(kind);
  const id = crypto.randomBytes(12).toString('hex');
  // Relative location, the same for disk and database storage.
  const folder = isPrivate ? `private/${userId}` : `public/${kind}`;

  let image: ReturnType<typeof sharp>;
  try {
    image = sharp(buffer, { failOn: 'error' }).rotate();
    await image.metadata();
  } catch {
    throw badRequest('The uploaded file is not a valid image');
  }

  const fullName = `${id}.webp`;
  const thumbName = `${id}-sm.webp`;
  const [full, thumb] = await Promise.all([
    image
      .clone()
      .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer(),
    image
      .clone()
      .resize({ width: 360, height: 360, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 55 })
      .toBuffer(),
  ]);

  if (env.UPLOAD_STORAGE === 'database') {
    await prisma.storedFile.createMany({
      data: [
        { path: `${folder}/${fullName}`, mimeType: 'image/webp', data: full },
        { path: `${folder}/${thumbName}`, mimeType: 'image/webp', data: thumb },
      ],
    });
  } else {
    const dir = path.join(UPLOAD_ROOT, folder);
    await fs.mkdir(dir, { recursive: true });
    await Promise.all([fs.writeFile(path.join(dir, fullName), full), fs.writeFile(path.join(dir, thumbName), thumb)]);
  }

  const base = env.PUBLIC_BASE_URL.replace(/\/+$/, '');
  const prefix = isPrivate ? `${base}/api/v1/uploads/private/${userId}` : `${base}/uploads/public/${kind}`;
  return { url: `${prefix}/${fullName}`, thumbUrl: `${prefix}/${thumbName}`, isPrivate };
}

const FILE_NAME = /^[a-f0-9]{24}(-sm)?\.webp$/;
const PUBLIC_KINDS: UploadKind[] = ['product', 'vendor', 'avatar'];

/** Resolves a private file path, refusing anything that escapes the private directory. */
export function resolvePrivateFile(ownerId: string, file: string): string | null {
  if (!/^[a-z0-9]{8,40}$/i.test(ownerId) || !FILE_NAME.test(file)) return null;
  const full = path.join(PRIVATE_DIR, ownerId, file);
  return full.startsWith(PRIVATE_DIR + path.sep) ? full : null;
}

/** Reads a stored image from the database (UPLOAD_STORAGE=database). */
export async function readStoredFile(relativePath: string): Promise<{ mimeType: string; data: Buffer } | null> {
  const row = await prisma.storedFile.findUnique({ where: { path: relativePath }, select: { mimeType: true, data: true } });
  return row ? { mimeType: row.mimeType, data: Buffer.from(row.data) } : null;
}

/** Validates a public image location; returns its relative path or null. */
export function publicFilePath(kind: string, file: string): string | null {
  if (!PUBLIC_KINDS.includes(kind as UploadKind) || !FILE_NAME.test(file)) return null;
  return `public/${kind}/${file}`;
}
