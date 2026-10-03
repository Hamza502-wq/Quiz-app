import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { sqlUtc } from '../../lib/time';

interface DailyRow {
  day: string;
  orders: number;
  gross_cents: number;
  commission_cents: number;
  net_cents: number;
}

/** Daily totals of delivered orders, bucketed by Harare calendar day. */
export async function vendorSalesReport(vendorId: string, from: Date, to: Date) {
  const rows = await prisma.$queryRaw<DailyRow[]>(Prisma.sql`
    SELECT to_char(date_trunc('day', (delivered_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Harare'), 'YYYY-MM-DD') AS day,
           COUNT(*)::int AS orders,
           COALESCE(SUM(subtotal_cents), 0)::int AS gross_cents,
           COALESCE(SUM(commission_cents), 0)::int AS commission_cents,
           COALESCE(SUM(vendor_earning_cents), 0)::int AS net_cents
    FROM orders
    WHERE vendor_id = ${vendorId} AND status = 'DELIVERED' AND delivered_at >= ${sqlUtc(from)} AND delivered_at <= ${sqlUtc(to)}
    GROUP BY 1
    ORDER BY 1`);

  const [statusCounts, topProducts] = await Promise.all([
    prisma.order.groupBy({
      by: ['status'],
      where: { vendorId, createdAt: { gte: from, lte: to }, status: { not: 'PENDING_PAYMENT' } },
      _count: true,
    }),
    prisma.$queryRaw<Array<{ name: string; quantity: number; revenue_cents: number }>>(Prisma.sql`
      SELECT oi.name, SUM(oi.quantity)::int AS quantity, SUM(oi.line_total_cents)::int AS revenue_cents
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.vendor_id = ${vendorId} AND o.status = 'DELIVERED' AND o.delivered_at >= ${sqlUtc(from)} AND o.delivered_at <= ${sqlUtc(to)}
      GROUP BY oi.name ORDER BY quantity DESC LIMIT 10`),
  ]);

  const totals = rows.reduce(
    (t, r) => ({
      orders: t.orders + r.orders,
      grossCents: t.grossCents + r.gross_cents,
      commissionCents: t.commissionCents + r.commission_cents,
      netCents: t.netCents + r.net_cents,
    }),
    { orders: 0, grossCents: 0, commissionCents: 0, netCents: 0 },
  );

  return {
    from,
    to,
    totals: { ...totals, averageOrderCents: totals.orders ? Math.round(totals.grossCents / totals.orders) : 0 },
    daily: rows.map((r) => ({
      day: r.day,
      orders: r.orders,
      grossCents: r.gross_cents,
      commissionCents: r.commission_cents,
      netCents: r.net_cents,
    })),
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
    topProducts: topProducts.map((p) => ({ name: p.name, quantity: p.quantity, revenueCents: p.revenue_cents })),
  };
}

/** Lifetime earnings minus payouts that are not rejected. */
export async function vendorBalance(vendorId: string) {
  const [earned, paidOut, pending] = await Promise.all([
    prisma.order.aggregate({ where: { vendorId, status: 'DELIVERED' }, _sum: { vendorEarningCents: true } }),
    prisma.payout.aggregate({ where: { vendorId, payeeType: 'VENDOR', status: 'PAID' }, _sum: { amountCents: true } }),
    prisma.payout.aggregate({
      where: { vendorId, payeeType: 'VENDOR', status: { in: ['PENDING', 'PROCESSING'] } },
      _sum: { amountCents: true },
    }),
  ]);
  const earnedCents = earned._sum.vendorEarningCents ?? 0;
  const paidCents = paidOut._sum.amountCents ?? 0;
  const pendingCents = pending._sum.amountCents ?? 0;
  return {
    lifetimeEarningsCents: earnedCents,
    paidOutCents: paidCents,
    pendingPayoutCents: pendingCents,
    balanceCents: earnedCents - paidCents - pendingCents,
  };
}

/** Commission statement for a period with per-order lines. */
export async function vendorStatement(vendorId: string, from: Date, to: Date) {
  const [vendor, orders, payouts, balance] = await Promise.all([
    prisma.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { name: true, commissionRateBps: true } }),
    prisma.order.findMany({
      where: { vendorId, status: 'DELIVERED', deliveredAt: { gte: from, lte: to } },
      orderBy: { deliveredAt: 'asc' },
      select: {
        id: true,
        code: true,
        deliveredAt: true,
        paymentMethod: true,
        subtotalCents: true,
        commissionRateBps: true,
        commissionCents: true,
        vendorEarningCents: true,
      },
    }),
    prisma.payout.findMany({
      where: { vendorId, payeeType: 'VENDOR', requestedAt: { gte: from, lte: to } },
      orderBy: { requestedAt: 'asc' },
    }),
    vendorBalance(vendorId),
  ]);
  const summary = orders.reduce(
    (s, o) => ({
      orders: s.orders + 1,
      grossCents: s.grossCents + o.subtotalCents,
      commissionCents: s.commissionCents + o.commissionCents,
      netCents: s.netCents + o.vendorEarningCents,
    }),
    { orders: 0, grossCents: 0, commissionCents: 0, netCents: 0 },
  );
  return {
    vendorName: vendor.name,
    from,
    to,
    summary,
    orders,
    payouts,
    balance,
  };
}
