import type { WalletTxType } from '@prisma/client';
import { prisma, type Db } from '../../lib/prisma';
import { getSettings } from '../settings/settings.service';

export interface WalletEntry {
  type: WalletTxType;
  amountCents: number; // signed
  description: string;
  orderId?: string;
  payoutId?: string;
  createdById?: string;
}

export async function ensureWallet(db: Db, riderId: string) {
  return db.riderWallet.upsert({ where: { riderId }, create: { riderId }, update: {} });
}

/**
 * Appends a ledger entry and atomically updates the running balance, then
 * reconciles outstanding cash collections. Call inside a transaction.
 */
export async function postWalletEntry(db: Db, riderId: string, entry: WalletEntry) {
  await ensureWallet(db, riderId);
  const wallet = await db.riderWallet.update({
    where: { riderId },
    data: { balanceCents: { increment: entry.amountCents } },
  });
  const tx = await db.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: entry.type,
      amountCents: entry.amountCents,
      balanceAfterCents: wallet.balanceCents,
      description: entry.description,
      orderId: entry.orderId,
      payoutId: entry.payoutId,
      createdById: entry.createdById,
    },
  });
  await reconcileCashCollections(db, riderId, wallet.balanceCents);
  return tx;
}

/**
 * Cash a rider collects is owed to the platform and is netted against their
 * earnings. The amount still owed is max(0, -balance); outstanding collections
 * beyond that have effectively been deducted from earnings (or remitted), so
 * they are settled oldest-first.
 */
export async function reconcileCashCollections(db: Db, riderId: string, balanceCents: number): Promise<void> {
  const owed = Math.max(0, -balanceCents);
  const outstanding = await db.cashCollection.findMany({
    where: { riderId, status: 'OUTSTANDING' },
    orderBy: { createdAt: 'asc' },
  });
  const totalOutstanding = outstanding.reduce((sum, c) => sum + (c.amountCents - c.settledCents), 0);
  let excess = totalOutstanding - owed;
  for (const c of outstanding) {
    if (excess <= 0) break;
    const remaining = c.amountCents - c.settledCents;
    const settle = Math.min(remaining, excess);
    excess -= settle;
    const fullySettled = settle === remaining;
    await db.cashCollection.update({
      where: { id: c.id },
      data: {
        settledCents: c.settledCents + settle,
        status: fullySettled ? 'SETTLED' : 'OUTSTANDING',
        settledAt: fullySettled ? new Date() : null,
      },
    });
  }
}

export async function getCashLimitCents(riderId: string, db: Db = prisma): Promise<number> {
  const [rider, settings] = await Promise.all([
    db.rider.findUniqueOrThrow({ where: { id: riderId }, select: { cashLimitCents: true } }),
    getSettings(),
  ]);
  return rider.cashLimitCents ?? settings.defaultCashLimitCents;
}

/** Cash the rider currently owes the platform (USD cents). */
export async function getCashOwedCents(riderId: string, db: Db = prisma): Promise<number> {
  const wallet = await db.riderWallet.findUnique({ where: { riderId }, select: { balanceCents: true } });
  return Math.max(0, -(wallet?.balanceCents ?? 0));
}

/** Whether the rider may take a cash order of `orderTotalCents` without exceeding their cash limit. */
export async function canTakeCashOrder(riderId: string, orderTotalCents: number, db: Db = prisma): Promise<boolean> {
  const [owed, limit] = await Promise.all([getCashOwedCents(riderId, db), getCashLimitCents(riderId, db)]);
  return owed + orderTotalCents <= limit;
}

export async function getWalletSummary(riderId: string) {
  const wallet = await ensureWallet(prisma, riderId);
  const [cashLimitCents, outstanding] = await Promise.all([
    getCashLimitCents(riderId),
    prisma.cashCollection.aggregate({
      where: { riderId, status: 'OUTSTANDING' },
      _sum: { amountCents: true, settledCents: true },
    }),
  ]);
  const cashOwedCents = Math.max(0, -wallet.balanceCents);
  return {
    balanceCents: wallet.balanceCents,
    availableForPayoutCents: Math.max(0, wallet.balanceCents),
    cashOwedCents,
    cashLimitCents,
    cashLimitRemainingCents: Math.max(0, cashLimitCents - cashOwedCents),
    outstandingCashCents: (outstanding._sum.amountCents ?? 0) - (outstanding._sum.settledCents ?? 0),
  };
}
