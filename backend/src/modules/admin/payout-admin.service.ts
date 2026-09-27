import type { PayoutStatus } from '@prisma/client';
import { prisma, type Db } from '../../lib/prisma';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { formatMoney } from '../../lib/money';
import { logger } from '../../lib/logger';
import { getSettings } from '../settings/settings.service';
import { postWalletEntry } from '../wallet/wallet.service';
import { notifyAsync } from '../notifications/notification.service';
import { vendorBalance } from '../vendors/vendor-reports.service';

const ALLOWED: Record<PayoutStatus, PayoutStatus[]> = {
  PENDING: ['PROCESSING', 'PAID', 'REJECTED'],
  PROCESSING: ['PAID', 'REJECTED'],
  PAID: [],
  REJECTED: [],
};

export async function processPayout(
  payoutId: string,
  adminId: string,
  input: { status: 'PROCESSING' | 'PAID' | 'REJECTED'; reference?: string; notes?: string },
) {
  const payout = await prisma.payout.findUnique({
    where: { id: payoutId },
    include: { rider: { select: { userId: true } }, vendor: { select: { userId: true } } },
  });
  if (!payout) throw notFound('Payout');
  if (!ALLOWED[payout.status].includes(input.status)) {
    throw conflict(`A ${payout.status.toLowerCase()} payout cannot be marked ${input.status.toLowerCase()}.`);
  }
  if (input.status === 'PAID' && !input.reference) throw badRequest('Enter the transaction reference for a paid payout.');

  await prisma.$transaction(async (tx) => {
    const updated = await tx.payout.updateMany({
      where: { id: payoutId, status: payout.status },
      data: {
        status: input.status,
        reference: input.reference ?? payout.reference,
        notes: input.notes ?? payout.notes,
        processedById: adminId,
        processedAt: input.status === 'PROCESSING' ? null : new Date(),
      },
    });
    if (updated.count === 0) throw conflict('Payout was updated by someone else. Refresh and try again.');
    if (input.status === 'REJECTED' && payout.payeeType === 'RIDER' && payout.riderId) {
      await postWalletEntry(tx, payout.riderId, {
        type: 'PAYOUT_REVERSAL',
        amountCents: payout.amountCents,
        description: `Payout reversed${input.notes ? `: ${input.notes}` : ''}`,
        payoutId,
        createdById: adminId,
      });
    }
  });

  const userId = payout.rider?.userId ?? payout.vendor?.userId;
  if (userId && input.status !== 'PROCESSING') {
    notifyAsync({
      userId,
      type: input.status === 'PAID' ? 'PAYOUT_PAID' : 'PAYOUT_REJECTED',
      title: input.status === 'PAID' ? 'Payout sent 💸' : 'Payout rejected',
      body:
        input.status === 'PAID'
          ? `${formatMoney(payout.amountCents, 'USD')} has been sent to ${payout.accountNumber} (ref ${input.reference}).`
          : `Your payout of ${formatMoney(payout.amountCents, 'USD')} was rejected${input.notes ? `: ${input.notes}` : ''}.${
              payout.payeeType === 'RIDER' ? ' The amount is back in your wallet.' : ''
            }`,
      fallbackToSms: true,
    });
  }
  return prisma.payout.findUniqueOrThrow({ where: { id: payoutId } });
}

/** Creates a payout for a vendor's outstanding balance. */
export async function createVendorPayout(vendorId: string, amountCents?: number) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) throw notFound('Vendor');
  if (!vendor.payoutMethod || !vendor.payoutAccount) throw badRequest(`${vendor.name} has no payout details on file.`);
  const balance = await vendorBalance(vendorId);
  const amount = amountCents ?? balance.balanceCents;
  if (amount <= 0) throw badRequest('Nothing to pay out.');
  if (amount > balance.balanceCents) throw badRequest(`Maximum payable is ${formatMoney(balance.balanceCents, 'USD')}.`);
  const last = await prisma.payout.findFirst({ where: { vendorId, payeeType: 'VENDOR' }, orderBy: { requestedAt: 'desc' } });
  return prisma.payout.create({
    data: {
      payeeType: 'VENDOR',
      vendorId,
      amountCents: amount,
      method: vendor.payoutMethod,
      accountNumber: vendor.payoutAccount,
      accountName: vendor.payoutAccountName,
      bankName: vendor.payoutBankName,
      periodStart: last?.periodEnd ?? vendor.createdAt,
      periodEnd: new Date(),
      isAutomatic: amountCents === undefined,
    },
  });
}

/** Creates payouts for every approved vendor with a balance at or above the minimum. */
export async function generateVendorPayouts(): Promise<{ created: number; skipped: Array<{ vendor: string; reason: string }> }> {
  const settings = await getSettings();
  const vendors = await prisma.vendor.findMany({ where: { status: { in: ['APPROVED', 'SUSPENDED'] } } });
  let created = 0;
  const skipped: Array<{ vendor: string; reason: string }> = [];
  for (const v of vendors) {
    const pending = await prisma.payout.count({ where: { vendorId: v.id, status: { in: ['PENDING', 'PROCESSING'] } } });
    if (pending > 0) {
      skipped.push({ vendor: v.name, reason: 'Payout already in progress' });
      continue;
    }
    const balance = await vendorBalance(v.id);
    if (balance.balanceCents < settings.minPayoutCents) continue;
    if (!v.payoutMethod || !v.payoutAccount) {
      skipped.push({ vendor: v.name, reason: 'No payout details' });
      continue;
    }
    try {
      await createVendorPayout(v.id);
      created++;
    } catch (err) {
      logger.warn({ err, vendorId: v.id }, 'Vendor payout generation failed');
      skipped.push({ vendor: v.name, reason: err instanceof Error ? err.message : 'Error' });
    }
  }
  return { created, skipped };
}

/** Marks a refund as completed and updates the payment's refund status. */
export async function completeRefund(refundId: string, adminId: string, input: { reference: string; method?: string }) {
  const refund = await prisma.refund.findUnique({ where: { id: refundId } });
  if (!refund) throw notFound('Refund');
  if (refund.status === 'COMPLETED') throw conflict('This refund is already completed.');
  await prisma.$transaction(async (tx) => {
    await tx.refund.update({
      where: { id: refundId },
      data: {
        status: 'COMPLETED',
        reference: input.reference,
        method: input.method ?? refund.method,
        processedById: adminId,
        processedAt: new Date(),
      },
    });
    if (refund.paymentId) await syncPaymentRefundStatus(tx, refund.paymentId);
  });
  const order = await prisma.order.findUnique({ where: { id: refund.orderId }, include: { customer: true } });
  if (order) {
    notifyAsync({
      userId: order.customer.userId,
      type: 'REFUND_COMPLETED',
      title: 'Refund processed',
      body: `${formatMoney(refund.amountCents, 'USD')} for order ${order.code} has been refunded (ref ${input.reference}).`,
      data: { orderId: order.id },
      fallbackToSms: true,
    });
  }
  return prisma.refund.findUniqueOrThrow({ where: { id: refundId } });
}

export async function syncPaymentRefundStatus(tx: Db, paymentId: string): Promise<void> {
  const payment = await tx.payment.findUnique({ where: { id: paymentId } });
  if (!payment || (payment.status !== 'PAID' && payment.status !== 'PARTIALLY_REFUNDED')) return;
  const refunded = await tx.refund.aggregate({ where: { paymentId, status: 'COMPLETED' }, _sum: { amountCents: true } });
  const total = refunded._sum.amountCents ?? 0;
  const status = total >= payment.amountUsdCents ? 'REFUNDED' : total > 0 ? 'PARTIALLY_REFUNDED' : payment.status;
  await tx.payment.update({ where: { id: paymentId }, data: { status } });
  if (payment.purpose === 'ORDER') {
    await tx.order.update({ where: { id: payment.orderId }, data: { paymentStatus: status } });
  }
}
