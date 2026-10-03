import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { apiLimiter } from './middleware/rateLimit';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { buildOpenApiDocument } from './docs/openapi';
import { PUBLIC_DIR, publicFilePath, readStoredFile } from './modules/uploads/upload.service';
import { authRouter } from './modules/auth/auth.routes';
import { notificationRouter } from './modules/notifications/notification.routes';
import { uploadRouter } from './modules/uploads/upload.routes';
import { categoryRouter } from './modules/categories/category.routes';
import { vendorRouter } from './modules/vendors/vendor.routes';
import { vendorPortalRouter } from './modules/vendors/vendor-portal.routes';
import { addressRouter } from './modules/customers/address.routes';
import { orderRouter } from './modules/orders/order.routes';
import { paymentRouter } from './modules/payments/payment.routes';
import { riderRouter } from './modules/riders/rider.routes';
import { adminRouter } from './modules/admin/admin.routes';
import { marketRouter } from './modules/market/market.routes';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(
    helmet({
      // The API serves JSON; CSP is relaxed so Swagger UI can render.
      contentSecurityPolicy: false,
      // Uploaded images are embedded by the dashboards on other origins.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin: (origin, cb) => {
        // Mobile apps and server-to-server calls send no Origin header.
        if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
        cb(null, false);
      },
      credentials: true,
    }),
  );
  if (!env.isTest) {
    app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));
  }

  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', time: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'degraded', db: false });
    }
  });

  if (env.UPLOAD_STORAGE === 'database') {
    app.get('/uploads/public/:kind/:file', async (req, res, next) => {
      try {
        const relative = publicFilePath(req.params.kind, req.params.file);
        const stored = relative ? await readStoredFile(relative) : null;
        if (!stored) {
          res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File not found' } });
          return;
        }
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        res.type(stored.mimeType).send(stored.data);
      } catch (err) {
        next(err);
      }
    });
  } else {
    app.use('/uploads/public', express.static(PUBLIC_DIR, { maxAge: '7d', immutable: true, index: false, fallthrough: false }));
  }

  app.get('/api/docs.json', (_req, res) => {
    res.json(buildOpenApiDocument());
  });
  let docsHandler: express.RequestHandler | null = null;
  app.use('/api/docs', swaggerUi.serve, (req: express.Request, res: express.Response, next: express.NextFunction) => {
    docsHandler ??= swaggerUi.setup(buildOpenApiDocument(), { customSiteTitle: 'DoorStep API docs' });
    docsHandler(req, res, next);
  });

  app.use('/api', apiLimiter);
  // The Paynow result URL needs the raw urlencoded body — it has its own parser.
  app.use('/api/v1/payments', paymentRouter);
  app.use(express.json({ limit: '1mb' }));

  // What the apps need to know about this deployment's integrations.
  app.get('/api/v1/meta', (_req, res) => {
    res.json({
      paymentsSimulated: env.PAYMENTS_MOCK,
      smsSignIn: !(env.isProduction && env.SMS_PROVIDER === 'console'),
    });
  });
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/notifications', notificationRouter);
  app.use('/api/v1/uploads', uploadRouter);
  app.use('/api/v1/categories', categoryRouter);
  app.use('/api/v1/vendors', vendorRouter);
  app.use('/api/v1/vendor', vendorPortalRouter);
  app.use('/api/v1/customer/addresses', addressRouter);
  app.use('/api/v1/orders', orderRouter);
  app.use('/api/v1/rider', riderRouter);
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1/market', marketRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
