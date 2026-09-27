import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { env } from '../../config/env';
import { badRequest } from '../../lib/errors';

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
 * authorised users.
 */
export async function storeImage(buffer: Buffer, kind: UploadKind, userId: string): Promise<StoredImage> {
  const isPrivate = PRIVATE_KINDS.includes(kind);
  const id = crypto.randomBytes(12).toString('hex');
  const dir = isPrivate ? path.join(PRIVATE_DIR, userId) : path.join(PUBLIC_DIR, kind);
  await fs.mkdir(dir, { recursive: true });

  let image: ReturnType<typeof sharp>;
  try {
    image = sharp(buffer, { failOn: 'error' }).rotate();
    await image.metadata();
  } catch {
    throw badRequest('The uploaded file is not a valid image');
  }

  const fullName = `${id}.webp`;
  const thumbName = `${id}-sm.webp`;
  await Promise.all([
    image
      .clone()
      .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(path.join(dir, fullName)),
    image
      .clone()
      .resize({ width: 360, height: 360, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 55 })
      .toFile(path.join(dir, thumbName)),
  ]);

  const base = env.PUBLIC_BASE_URL.replace(/\/+$/, '');
  const prefix = isPrivate ? `${base}/api/v1/uploads/private/${userId}` : `${base}/uploads/public/${kind}`;
  return { url: `${prefix}/${fullName}`, thumbUrl: `${prefix}/${thumbName}`, isPrivate };
}

/** Resolves a private file path, refusing anything that escapes the private directory. */
export function resolvePrivateFile(ownerId: string, file: string): string | null {
  if (!/^[a-z0-9]{8,40}$/i.test(ownerId) || !/^[a-f0-9]{24}(-sm)?\.webp$/.test(file)) return null;
  const full = path.join(PRIVATE_DIR, ownerId, file);
  return full.startsWith(PRIVATE_DIR + path.sep) ? full : null;
}
