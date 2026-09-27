import type { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import type { RoleName } from '@prisma/client';
import { z, type ZodType } from 'zod';
import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { authenticate, optionalAuth, requireRoles, type AuthUser } from '../middleware/auth';

/** Global registry — every route declared through `defineRoute` is documented here. */
export const openApiRegistry = new OpenAPIRegistry();

openApiRegistry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type AuthMode = 'public' | 'optional' | 'required';

type Infer<T> = T extends ZodType ? z.infer<T> : undefined;
type UserFor<A extends AuthMode> = A extends 'required' ? AuthUser : AuthUser | undefined;

export interface RouteContext<B, Q, P, A extends AuthMode> {
  body: B;
  query: Q;
  params: P;
  user: UserFor<A>;
  req: Request;
  res: Response;
}

export interface RouteSpec<
  B extends ZodType | undefined,
  Q extends ZodType | undefined,
  P extends ZodType | undefined,
  A extends AuthMode,
> {
  method: Method;
  /** Express-style path relative to the router's mount point, e.g. "/orders/:id". */
  path: string;
  /** Prefix at which the router is mounted (used for documentation only). */
  basePath: string;
  tags: string[];
  summary: string;
  description?: string;
  auth: A;
  roles?: RoleName[];
  body?: B;
  query?: Q;
  params?: P;
  /** HTTP status for a successful response (default 200). */
  status?: number;
  /** Additional middleware (e.g. file upload, route-specific rate limiters) run before validation. */
  middleware?: RequestHandler[];
  /** Request content type for docs (default application/json). */
  contentType?: string;
  handler: (ctx: RouteContext<Infer<B>, Infer<Q>, Infer<P>, A>) => Promise<unknown> | unknown;
}

function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

/**
 * Declares an Express route with authentication, role checks, zod validation of
 * body/query/params and automatic OpenAPI documentation. The handler's return
 * value is sent as JSON unless the handler already wrote a response.
 */
export function defineRoute<
  B extends ZodType | undefined = undefined,
  Q extends ZodType | undefined = undefined,
  P extends ZodType | undefined = undefined,
  A extends AuthMode = 'required',
>(router: Router, spec: RouteSpec<B, Q, P, A>): void {
  const chain: RequestHandler[] = [];
  if (spec.auth === 'required') chain.push(authenticate as RequestHandler);
  if (spec.auth === 'optional') chain.push(optionalAuth as RequestHandler);
  if (spec.roles?.length) chain.push(requireRoles(...spec.roles));
  if (spec.middleware) chain.push(...spec.middleware);

  const main = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = spec.body ? spec.body.parse(req.body ?? {}) : undefined;
      const query = spec.query ? spec.query.parse(req.query) : undefined;
      const params = spec.params ? spec.params.parse(req.params) : undefined;
      const result = await spec.handler({
        body: body as Infer<B>,
        query: query as Infer<Q>,
        params: params as Infer<P>,
        user: req.user as UserFor<A>,
        req,
        res,
      });
      if (res.headersSent) return;
      if (result === undefined) {
        res.status(204).end();
        return;
      }
      res.status(spec.status ?? 200).json(result);
    } catch (err) {
      next(err);
    }
  };

  router[spec.method](spec.path, ...chain, main);

  const fullPath = toOpenApiPath(`${spec.basePath}${spec.path}`.replace(/\/+$/, '') || '/');
  const roleNote = spec.roles?.length ? `\n\n**Roles:** ${spec.roles.join(', ')}` : '';
  openApiRegistry.registerPath({
    method: spec.method,
    path: fullPath,
    tags: spec.tags,
    summary: spec.summary,
    description: `${spec.description ?? ''}${roleNote}`.trim() || undefined,
    security: spec.auth === 'public' ? [] : [{ bearerAuth: [] }],
    request: {
      ...(spec.params ? { params: spec.params as unknown as z.ZodObject } : {}),
      ...(spec.query ? { query: spec.query as unknown as z.ZodObject } : {}),
      ...(spec.body
        ? {
            body: {
              required: true,
              content: { [spec.contentType ?? 'application/json']: { schema: spec.body } },
            },
          }
        : {}),
    },
    responses: {
      [spec.status ?? 200]: { description: 'Success' },
      400: { description: 'Validation error' },
      ...(spec.auth === 'required' ? { 401: { description: 'Not authenticated' } } : {}),
      ...(spec.roles?.length ? { 403: { description: 'Forbidden' } } : {}),
    },
  });
}

// ─────────────── Shared schema helpers ───────────────

export const idParams = z.object({ id: z.string().min(1).max(64) });

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function paged<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export const latLng = {
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
};

/** Query-string boolean ("true"/"false"/"1"/"0"). */
export const queryBool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');
