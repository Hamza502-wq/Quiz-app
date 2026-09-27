import type { Currency, Payment, PaymentMethod, PaymentPurpose } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { convertFromUsd, formatMoney } from '../../lib/money';
import { toLocalZwMsisdn } from '../../lib/phone';
import { paymentReference } from '../../lib/random';
import type { AuthUser } from '../../middleware/auth';
import { getSettings } from '../settings/settings.service';
import { postWalletEntry } from '../wallet/wallet.service';
import { notifyAsync } from '../notifications/notification.service';
import { publishOrderUpdate } from '../orders/order.events';
import { transitionOrder } from '../orders/order.service';
import {
  credentialsFor,
  initiateTransaction,
  parseFields,
  fieldsToObject,
  parseStatusMessage,
  pollTransaction,
  type MappedStatus,
} from './paynow.client';

const POLL_MIN_INTERVAL_MS = 5_000;
const MOCK_CONFIRM_AFTER_MS = 5_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type OnlineMethod = Exclude<PaymentMethod, 'CASH'>;

/** Throws when online payments can't be taken in `currency`. */
export function assertOnlinePaymentsAvailable(currency: Currency): void {
  if (env.PAYMENTS_MOCK) return;
  if (!credentialsFor(currency)) {
    throw badRequest(`Online payments in ${currency === 'USD' ? 'USD' : 'ZiG'} are unavailable right now. Choose cash on delivery or another currency.`);
  }
  if (!env.PAYNOW_AUTH_EMAIL) throw badRequest('Online payments are not configured. Please choose cash on delivery.');
}

function resultUrl(): string {
  return `${env.PUBLIC_BASE_URL.replace(/\/+$/, '')}/api/v1/payments/paynow/result`;
}

function returnUrl(reference: string): string {
  const base = env.PAYNOW_RETURN_URL ?? `${env.PUBLIC_BASE_URL.replace(/\/+$/, '')}/api/v1/payments/return`;
  return `${base}${base.includes('?') ? '&' : '?'}ref=${encodeURIComponent(reference)}`;
}

function presentPayment(p: Payment) {
  return {
    id: p.id,
    orderId: p.orderId,
    purpose: p.purpose,
    method: p.method,
    status: p.status,
    currency: p.currency,
    amountCents: p.amountCents,
    amountUsdCents: p.amountUsdCents,
    reference: p.reference,
    redirectUrl: p.redirectUrl,
    instructions: p.instructions,
    paidAt: p.paidAt,
    createdAt: p.createdAt,
  };
}

interface StartPaymentInput {
  orderId: string;
  orderCode: string;
  purpose: PaymentPurpose;
  method: OnlineMethod;
  currency: Currency;
  exchangeRate: number;
  amountUsdCents: number;
  payerPhone: string;
  payerEmail: string | null;
  description: string;
}

async function startPayment(input: StartPaymentInput) {
  assertOnlinePaymentsAvailable(input.currency);
  const amountCents = convertFromUsd(input.amountUsdCents, input.currency, input.exchangeRate);
  const reference = paymentReference();

  // Only one live attempt per order & purpose.
  await prisma.payment.updateMany({
    where: { orderId: input.orderId, purpose: input.purpose, status: 'PENDING', method: { not: 'CASH' } },
    data: { status: 'CANCELLED' },
  });

  const payment = await prisma.payment.create({
    data: {
      orderId: input.orderId,
      purpose: input.purpose,
      method: input.method,
      currency: input.currency,
      amountCents,
      amountUsdCents: input.amountUsdCents,
      reference,
      phone: input.method === 'CARD' ? null : input.payerPhone,
    },
  });

  if (env.PAYMENTS_MOCK) {
    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        pollUrl: `mock://${reference}`,
        instructions:
          input.method === 'CARD'
            ? 'Test mode: card payment will be approved automatically in a few seconds.'
            : `Test mode: ${input.method === 'ECOCASH' ? 'EcoCash' : 'OneMoney'} prompt simulated — it will be approved in a few seconds.`,
        redirectUrl: input.method === 'CARD' ? returnUrl(reference) : null,
      },
    });
    return presentPayment(updated);
  }

  const authEmail = input.payerEmail && EMAIL_RE.test(input.payerEmail) ? input.payerEmail : env.PAYNOW_AUTH_EMAIL!;
  const result = await initiateTransaction({
    currency: input.currency,
    reference,
    amountCents,
    additionalInfo: input.description,
    authEmail,
    resultUrl: resultUrl(),
    returnUrl: returnUrl(reference),
    mobile:
      input.method === 'CARD'
        ? undefined
        : { method: input.method === 'ECOCASH' ? 'ecocash' : 'onemoney', phone: toLocalZwMsisdn(input.payerPhone) },
  });

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: result.ok
      ? {
          pollUrl: result.pollUrl,
          redirectUrl: result.redirectUrl,
          instructions:
            result.instructions ??
            (input.method === 'CARD'
              ? 'Complete your card payment on the Paynow page.'
              : `Check your phone and enter your ${input.method === 'ECOCASH' ? 'EcoCash' : 'OneMoney'} PIN to approve ${formatMoney(amountCents, input.currency)}.`),
          paynowReference: result.paynowReference,
        }
      : { status: 'FAILED', rawStatus: result.error?.slice(0, 250) },
  });
  if (!result.ok) throw badRequest(result.error ?? 'Payment could not be started. Please try again.');
  return presentPayment(updated);
}

/** Starts (or retries) the online payment for an order awaiting payment. */
export async function payForOrder(user: AuthUser, orderId: string, method: OnlineMethod, phone?: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { customer: { include: { user: true } } } });
  if (!order || order.customer.userId !== user.id) throw notFound('Order');
  if (order.status !== 'PENDING_PAYMENT') throw conflict('This order does not need payment.');
  if (order.paymentMethod !== method) {
    await prisma.order.update({ where: { id: order.id }, data: { paymentMethod: method } });
  }
  return startPayment({
    orderId: order.id,
    orderCode: order.code,
    purpose: 'ORDER',
    method,
    currency: order.currency,
    exchangeRate: order.exchangeRate,
    amountUsdCents: order.totalCents,
    payerPhone: phone ?? order.customer.user.phone,
    payerEmail: order.customer.user.email,
    description: `DoorStep order ${order.code}`,
  });
}

/** Online tip after delivery; credited to the rider once paid. */
export async function tipRider(user: AuthUser, orderId: string, amountCents: number, method: OnlineMethod, phone?: string) {
  const settings = await getSettings();
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { customer: { include: { user: true } } } });
  if (!order || order.customer.userId !== user.id) throw notFound('Order');
  if (order.status !== 'DELIVERED' || !order.riderId) throw conflict('You can tip once your order has been delivered.');
  if (amountCents < 50) throw badRequest('Minimum tip is US$0.50');
  if (order.tipCents + amountCents > settings.maxTipCents) {
    throw badRequest(`Tips are limited to ${formatMoney(settings.maxTipCents, 'USD')} per order.`);
  }
  return startPayment({
    orderId: order.id,
    orderCode: order.code,
    purpose: 'TIP',
    method,
    currency: order.currency,
    exchangeRate: order.exchangeRate,
    amountUsdCents: amountCents,
    payerPhone: phone ?? order.customer.user.phone,
    payerEmail: order.customer.user.email,
    description: `Tip for DoorStep order ${order.code}`,
  });
}

/**
 * Applies a provider status to a pending payment. Idempotent: only the first
 * transition out of PENDING has effect.
 */
export async function applyPaymentStatus(paymentId: string, mapped: MappedStatus, raw: string, paynowReference?: string) {
  if (mapped === 'PENDING') {
    await prisma.payment.update({ where: { id: paymentId }, data: { rawStatus: raw, lastPolledAt: new Date() } });
    return;
  }
  if (mapped === 'REFUNDED') {
    await prisma.payment.updateMany({ where: { id: paymentId, status: 'PAID' }, data: { status: 'REFUNDED', rawStatus: raw } });
    return;
  }

  const claimed = await prisma.payment.updateMany({
    where: { id: paymentId, status: 'PENDING' },
    data: {
      status: mapped,
      rawStatus: raw,
      paynowReference,
      lastPolledAt: new Date(),
      ...(mapped === 'PAID' ? { paidAt: new Date() } : {}),
    },
  });
  if (claimed.count === 0) return;

  const payment = await prisma.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { order: { include: { customer: true, rider: true } } },
  });
  const order = payment.order;

  if (mapped !== 'PAID') {
    notifyAsync({
      userId: order.customer.userId,
      type: 'PAYMENT_FAILED',
      title: 'Payment not completed',
      body: `Your ${payment.purpose === 'TIP' ? 'tip' : 'payment'} for order ${order.code} was ${mapped.toLowerCase()}. You can try again from the app.`,
      data: { orderId: order.id, paymentId },
    });
    await publishOrderUpdate(order.id);
    return;
  }

  if (payment.purpose === 'ORDER') {
    await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID', paymentMethod: payment.method } });
    if (order.status === 'PENDING_PAYMENT') {
      try {
        await transitionOrder(order.id, 'PLACED', { from: ['PENDING_PAYMENT'], message: `Paid via ${payment.method}` });
      } catch (err) {
        logger.error({ err, orderId: order.id }, 'Paid order could not be placed');
      }
    } else if (order.status === 'CANCELLED') {
      // Payment arrived after the order expired — refund it.
      await prisma.refund.create({
        data: {
          orderId: order.id,
          paymentId: payment.id,
          amountCents: payment.amountUsdCents,
          method: payment.method,
          notes: 'Payment received after the order was cancelled',
        },
      });
    }
    return;
  }

  // TIP
  if (order.riderId && order.rider) {
    const riderId = order.riderId;
    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { tipCents: { increment: payment.amountUsdCents } } });
      await postWalletEntry(tx, riderId, {
        type: 'TIP',
        amountCents: payment.amountUsdCents,
        description: `Tip on ${order.code}`,
        orderId: order.id,
      });
    });
    notifyAsync({
      userId: order.rider.userId,
      type: 'TIP_RECEIVED',
      title: 'You got a tip! 💛',
      body: `A customer tipped you ${formatMoney(payment.amountUsdCents, 'USD')} for order ${order.code}.`,
      data: { orderId: order.id },
    });
  }
}

/** Refreshes a pending payment from the provider (rate-limited). */
async function refreshPayment(payment: Payment): Promise<void> {
  if (payment.status !== 'PENDING' || !payment.pollUrl || payment.method === 'CASH') return;
  if (payment.lastPolledAt && Date.now() - payment.lastPolledAt.getTime() < POLL_MIN_INTERVAL_MS) return;
  await prisma.payment.update({ where: { id: payment.id }, data: { lastPolledAt: new Date() } });

  if (payment.pollUrl.startsWith('mock://')) {
    if (Date.now() - payment.createdAt.getTime() >= MOCK_CONFIRM_AFTER_MS) {
      await applyPaymentStatus(payment.id, 'PAID', 'Paid (mock)', `MOCK-${payment.reference}`);
    }
    return;
  }
  try {
    const status = await pollTransaction(payment.pollUrl, payment.currency);
    if (status.reference && status.reference !== payment.reference) {
      logger.error({ paymentId: payment.id }, 'Paynow poll reference mismatch');
      return;
    }
    await applyPaymentStatus(payment.id, status.mapped, status.status, status.paynowReference);
  } catch (err) {
    logger.warn({ err, paymentId: payment.id }, 'Paynow poll failed');
  }
}

export async function getPaymentForUser(user: AuthUser, paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { order: { select: { customer: { select: { userId: true } } } } },
  });
  if (!payment) throw notFound('Payment');
  if (payment.order.customer.userId !== user.id && !user.roles.includes('ADMIN')) throw forbidden();
  await refreshPayment(payment);
  const fresh = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  return presentPayment(fresh);
}

/** Result-URL callback from Paynow (x-www-form-urlencoded). */
export async function handlePaynowResult(rawBody: string): Promise<void> {
  const data = fieldsToObject(parseFields(rawBody));
  if (!data.reference) throw badRequest('Missing reference');
  const payment = await prisma.payment.findUnique({ where: { reference: data.reference } });
  if (!payment) throw notFound('Payment');
  const status = parseStatusMessage(rawBody, payment.currency); // throws on bad hash
  await applyPaymentStatus(payment.id, status.mapped, status.status, status.paynowReference);
}

/** Periodic job: polls pending online payments in case a callback was missed. */
export async function pollPendingPayments(): Promise<void> {
  const pending = await prisma.payment.findMany({
    where: {
      status: 'PENDING',
      method: { not: 'CASH' },
      pollUrl: { not: null },
      createdAt: { gte: new Date(Date.now() - 2 * 60 * 60_000) },
    },
    take: 50,
    orderBy: { createdAt: 'asc' },
  });
  for (const p of pending) await refreshPayment(p);
}
