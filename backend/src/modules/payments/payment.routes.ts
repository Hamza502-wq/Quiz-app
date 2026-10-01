import express, { Router } from 'express';
import { z } from 'zod';
import { defineRoute, idParams } from '../../lib/route';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { getPaymentForUser, handlePaynowResult } from './payment.service';

export const paymentRouter = Router();
const basePath = '/api/v1/payments';
const tags = ['Payments'];

defineRoute(paymentRouter, {
  method: 'post',
  path: '/paynow/result',
  basePath,
  tags,
  summary: 'Paynow result URL (server-to-server status update)',
  description: 'Called by Paynow with an x-www-form-urlencoded, SHA512-hashed status message.',
  auth: 'public',
  contentType: 'application/x-www-form-urlencoded',
  middleware: [express.text({ type: 'application/x-www-form-urlencoded', limit: '16kb' })],
  handler: async ({ req, res }) => {
    const raw = typeof req.body === 'string' ? req.body : '';
    try {
      await handlePaynowResult(raw);
    } catch (err) {
      logger.warn({ err }, 'Rejected Paynow status update');
      res.status(400).type('text/plain').send('Rejected');
      return undefined;
    }
    res.status(200).type('text/plain').send('OK');
    return undefined;
  },
});

defineRoute(paymentRouter, {
  method: 'get',
  path: '/return',
  basePath,
  tags,
  summary: 'Browser return page after a Paynow web checkout',
  auth: 'public',
  query: z.object({ ref: z.string().max(64).optional() }),
  handler: async ({ query, res }) => {
    const payment = query.ref ? await prisma.payment.findUnique({ where: { reference: query.ref } }) : null;
    const paid = payment?.status === 'PAID';
    const title = paid ? 'Payment received' : 'Payment submitted';
    const message = paid
      ? 'Thank you! Your payment was successful. You can close this page and go back to DoorStep.'
      : 'We are confirming your payment with Paynow. Go back to DoorStep — your order will update automatically.';
    res
      .status(200)
      .type('html')
      .send(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · DoorStep</title>
<style>body{margin:0;font-family:Poppins,system-ui,sans-serif;background:#fff;color:#1A1A1A;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
.card{max-width:420px;text-align:center;border-radius:20px;padding:32px 24px;box-shadow:0 8px 30px rgba(0,0,0,.08)}
h1{color:#FF7A00;margin:0 0 12px;font-size:24px}p{line-height:1.5;margin:0}.flag{height:4px;margin:20px auto 0;width:120px;background:linear-gradient(#319B42 33%,#FFD200 33% 66%,#E01E1E 66%);border-radius:2px}</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p><div class="flag"></div></div></body></html>`,
      );
    return undefined;
  },
});

defineRoute(paymentRouter, {
  method: 'get',
  path: '/:id',
  basePath,
  tags,
  summary: 'Payment status (polls Paynow while pending)',
  auth: 'required',
  params: idParams,
  handler: ({ params, user }) => getPaymentForUser(user, params.id),
});
