import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { sqlUtc, startOfLocalDay } from '../../lib/time';
import { ACTIVE_STATUSES } from '../orders/order.presenter';

/** Headline numbers for the admin dashboard. */
export async function dashboardSummary() {
  const todayStart = startOfLocalDay();
  const dayAgo = new Date(Date.now() - 86_400_000);
  const [
    ordersToday,
    deliveredToday,
    activeOrders,
    unassignedOrders,
    onlineRiders,
    pendingVendors,
    pendingRiders,
    openDisputes,
    pendingPayouts,
    pendingRefunds,
    activeUsers24h,
  ] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: todayStart }, status: { not: 'PENDING_PAYMENT' } } }),
    prisma.order.aggregate({
      where: { deliveredAt: { gte: todayStart }, status: 'DELIVERED' },
      _count: true,
      _sum: { totalCents: true, commissionCents: true, deliveryFeeCents: true, riderEarningCents: true },
    }),
    prisma.order.count({ where: { status: { in: ACTIVE_STATUSES } } }),
    prisma.order.count({
      where: {
        riderId: null,
        OR: [
          { type: 'PARCEL', status: 'PLACED' },
          { type: 'DELIVERY', status: { in: ['ACCEPTED', 'READY_FOR_PICKUP'] } },
        ],
      },
    }),
    prisma.rider.count({ where: { isOnline: true, status: 'APPROVED' } }),
    prisma.vendor.count({ where: { status: 'PENDING' } }),
    prisma.rider.count({ where: { status: 'PENDING' } }),
    prisma.dispute.count({ where: { status: 'OPEN' } }),
    prisma.payout.aggregate({ where: { status: { in: ['PENDING', 'PROCESSING'] } }, _count: true, _sum: { amountCents: true } }),
    prisma.refund.count({ where: { status: 'PENDING' } }),
    prisma.user.count({ where: { lastSeenAt: { gte: dayAgo } } }),
  ]);
  const s = deliveredToday._sum;
  return {
    ordersToday,
    deliveredToday: deliveredToday._count,
    gmvTodayCents: s.totalCents ?? 0,
    platformRevenueTodayCents:
      (s.commissionCents ?? 0) + (s.deliveryFeeCents ?? 0) - (s.riderEarningCents ?? 0),
    activeOrders,
    unassignedOrders,
    onlineRiders,
    pendingVendors,
    pendingRiders,
    openDisputes,
    pendingPayouts: { count: pendingPayouts._count, amountCents: pendingPayouts._sum.amountCents ?? 0 },
    pendingRefunds,
    activeUsers24h,
  };
}

interface SeriesRow {
  day: string;
  orders: number;
  delivered: number;
  cancelled: number;
  gmv_cents: number;
  commission_cents: number;
  delivery_fee_cents: number;
  rider_pay_cents: number;
}

/** Daily orders & revenue series plus user and rider performance for a range. */
export async function analytics(from: Date, to: Date) {
  const series = await prisma.$queryRaw<SeriesRow[]>(Prisma.sql`
    SELECT to_char(date_trunc('day', (created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Harare'), 'YYYY-MM-DD') AS day,
           COUNT(*)::int AS orders,
           COUNT(*) FILTER (WHERE status = 'DELIVERED')::int AS delivered,
           COUNT(*) FILTER (WHERE status IN ('CANCELLED', 'REJECTED'))::int AS cancelled,
           COALESCE(SUM(total_cents) FILTER (WHERE status = 'DELIVERED'), 0)::int AS gmv_cents,
           COALESCE(SUM(commission_cents) FILTER (WHERE status = 'DELIVERED'), 0)::int AS commission_cents,
           COALESCE(SUM(delivery_fee_cents) FILTER (WHERE status = 'DELIVERED'), 0)::int AS delivery_fee_cents,
           COALESCE(SUM(rider_earning_cents) FILTER (WHERE status = 'DELIVERED'), 0)::int AS rider_pay_cents
    FROM orders
    WHERE created_at >= ${sqlUtc(from)} AND created_at <= ${sqlUtc(to)} AND status <> 'PENDING_PAYMENT'
    GROUP BY 1 ORDER BY 1`);

  const [activeCustomers, newCustomers, activeUsers, paymentMix, topVendors, riderPerformance] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: from, lte: to }, status: 'DELIVERED' },
      distinct: ['customerId'],
      select: { customerId: true },
    }),
    prisma.customer.count({ where: { createdAt: { gte: from, lte: to } } }),
    prisma.user.count({ where: { lastSeenAt: { gte: from, lte: to } } }),
    prisma.order.groupBy({
      by: ['paymentMethod'],
      where: { createdAt: { gte: from, lte: to }, status: 'DELIVERED' },
      _count: true,
      _sum: { totalCents: true },
    }),
    prisma.$queryRaw<Array<{ id: string; name: string; orders: number; gmv_cents: number; commission_cents: number }>>(Prisma.sql`
      SELECT v.id, v.name, COUNT(o.id)::int AS orders,
             COALESCE(SUM(o.subtotal_cents), 0)::int AS gmv_cents, COALESCE(SUM(o.commission_cents), 0)::int AS commission_cents
      FROM orders o JOIN vendors v ON v.id = o.vendor_id
      WHERE o.status = 'DELIVERED' AND o.delivered_at >= ${sqlUtc(from)} AND o.delivered_at <= ${sqlUtc(to)}
      GROUP BY v.id, v.name ORDER BY gmv_cents DESC LIMIT 10`),
    riderPerformanceReport(from, to),
  ]);

  const totals = series.reduce(
    (t, r) => ({
      orders: t.orders + r.orders,
      delivered: t.delivered + r.delivered,
      cancelled: t.cancelled + r.cancelled,
      gmvCents: t.gmvCents + r.gmv_cents,
      commissionCents: t.commissionCents + r.commission_cents,
      deliveryFeeCents: t.deliveryFeeCents + r.delivery_fee_cents,
      riderPayCents: t.riderPayCents + r.rider_pay_cents,
    }),
    { orders: 0, delivered: 0, cancelled: 0, gmvCents: 0, commissionCents: 0, deliveryFeeCents: 0, riderPayCents: 0 },
  );

  return {
    from,
    to,
    totals: {
      ...totals,
      platformRevenueCents: totals.commissionCents + totals.deliveryFeeCents - totals.riderPayCents,
      completionRate: totals.orders ? Math.round((totals.delivered / totals.orders) * 1000) / 10 : 0,
    },
    series: series.map((r) => ({
      day: r.day,
      orders: r.orders,
      delivered: r.delivered,
      cancelled: r.cancelled,
      gmvCents: r.gmv_cents,
      commissionCents: r.commission_cents,
      platformRevenueCents: r.commission_cents + r.delivery_fee_cents - r.rider_pay_cents,
    })),
    users: { activeCustomers: activeCustomers.length, newCustomers, activeUsers },
    paymentMix: paymentMix.map((p) => ({ method: p.paymentMethod, orders: p._count, totalCents: p._sum.totalCents ?? 0 })),
    topVendors: topVendors.map((v) => ({
      id: v.id,
      name: v.name,
      orders: v.orders,
      gmvCents: v.gmv_cents,
      commissionCents: v.commission_cents,
    })),
    riderPerformance,
  };
}

interface RiderPerfRow {
  id: string;
  name: string | null;
  phone: string;
  rating_avg: number;
  deliveries: number;
  avg_delivery_minutes: number | null;
  offers: number;
  accepted: number;
  earnings_cents: number;
}

export async function riderPerformanceReport(from: Date, to: Date) {
  const rows = await prisma.$queryRaw<RiderPerfRow[]>(Prisma.sql`
    SELECT r.id, u.name, u.phone, r.rating_avg,
           COALESCE(d.deliveries, 0)::int AS deliveries,
           d.avg_minutes AS avg_delivery_minutes,
           COALESCE(f.offers, 0)::int AS offers,
           COALESCE(f.accepted, 0)::int AS accepted,
           COALESCE(d.earnings, 0)::int AS earnings_cents
    FROM riders r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN (
      SELECT rider_id, COUNT(*) AS deliveries,
             AVG(EXTRACT(EPOCH FROM (delivered_at - COALESCE(assigned_at, picked_up_at))) / 60)::float AS avg_minutes,
             SUM(rider_earning_cents + tip_cents) AS earnings
      FROM orders
      WHERE status = 'DELIVERED' AND delivered_at >= ${sqlUtc(from)} AND delivered_at <= ${sqlUtc(to)}
      GROUP BY rider_id
    ) d ON d.rider_id = r.id
    LEFT JOIN (
      SELECT rider_id, COUNT(*) AS offers, COUNT(*) FILTER (WHERE status = 'ACCEPTED') AS accepted
      FROM dispatch_offers
      WHERE is_manual = false AND created_at >= ${sqlUtc(from)} AND created_at <= ${sqlUtc(to)}
      GROUP BY rider_id
    ) f ON f.rider_id = r.id
    WHERE r.status = 'APPROVED'
    ORDER BY deliveries DESC, r.rating_avg DESC
    LIMIT 50`);
  return rows.map((r) => ({
    riderId: r.id,
    name: r.name,
    phone: r.phone,
    ratingAvg: Math.round(r.rating_avg * 10) / 10,
    deliveries: r.deliveries,
    avgDeliveryMinutes: r.avg_delivery_minutes === null ? null : Math.round(r.avg_delivery_minutes),
    acceptanceRate: r.offers ? Math.round((r.accepted / r.offers) * 1000) / 10 : null,
    earningsCents: r.earnings_cents,
  }));
}
