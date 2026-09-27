import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { env } from '../../config/env';
import { defineRoute } from '../../lib/route';
import { prisma } from '../../lib/prisma';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { ALLOWED_MIME, resolvePrivateFile, storeImage } from './upload.service';

export const uploadRouter = Router();
const basePath = '/api/v1/uploads';
const tags = ['Uploads'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) cb(null, true);
    else cb(badRequest('Only JPEG, PNG, WebP or HEIC images are allowed'));
  },
});

defineRoute(uploadRouter, {
  method: 'post',
  path: '/',
  basePath,
  tags,
  summary: 'Upload an image (multipart field "file")',
  description:
    'kind=product|vendor|avatar are public; kind=document (ID, licence) and kind=proof (delivery photo) are private. Returns full and thumbnail (low-data) URLs.',
  auth: 'required',
  middleware: [upload.single('file')],
  contentType: 'multipart/form-data',
  query: z.object({ kind: z.enum(['product', 'vendor', 'avatar', 'document', 'proof']) }),
  status: 201,
  handler: async ({ req, query, user }) => {
    if (!req.file) throw badRequest('Attach an image in the "file" field');
    if ((query.kind === 'product' || query.kind === 'vendor') && !user.roles.includes('VENDOR') && !user.roles.includes('ADMIN')) {
      throw forbidden('Only vendors can upload store images');
    }
    return storeImage(req.file.buffer, query.kind, user.id);
  },
});

defineRoute(uploadRouter, {
  method: 'get',
  path: '/private/:ownerId/:file',
  basePath,
  tags,
  summary: 'Download a private file (documents, delivery proof)',
  description: 'Allowed for admins, the uploader, and the customer of an order whose proof photo this is.',
  auth: 'required',
  params: z.object({ ownerId: z.string(), file: z.string() }),
  handler: async ({ params, user, res }) => {
    const filePath = resolvePrivateFile(params.ownerId, params.file);
    if (!filePath) throw notFound('File');

    let allowed = user.roles.includes('ADMIN') || user.id === params.ownerId;
    if (!allowed) {
      const fullName = params.file.replace('-sm.webp', '.webp');
      const suffix = `/api/v1/uploads/private/${params.ownerId}/${fullName}`;
      const order = await prisma.order.findFirst({
        where: { proofPhotoUrl: { endsWith: suffix }, customer: { userId: user.id } },
        select: { id: true },
      });
      allowed = Boolean(order);
    }
    if (!allowed) throw forbidden();

    res.setHeader('Cache-Control', 'private, max-age=3600');
    await new Promise<void>((resolve, reject) => {
      res.sendFile(filePath, (err) => {
        if (!err) return resolve();
        if ((err as NodeJS.ErrnoException).code === 'ENOENT' && !res.headersSent) return reject(notFound('File'));
        return reject(err);
      });
    });
    return undefined;
  },
});
