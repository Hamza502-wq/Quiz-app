import { prisma } from '../../lib/prisma';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';

export interface RatingInput {
  vendorScore?: number;
  vendorComment?: string;
  riderScore?: number;
  riderComment?: string;
}

export async function rateOrder(userId: string, orderId: string, input: RatingInput) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { customer: true, ratings: true } });
  if (!order) throw notFound('Order');
  if (order.customer.userId !== userId) throw forbidden();
  if (order.status !== 'DELIVERED') throw conflict('You can rate an order after it has been delivered.');
  if (input.vendorScore === undefined && input.riderScore === undefined) throw badRequest('Give at least one rating.');

  const has = (t: 'VENDOR' | 'RIDER') => order.ratings.some((r) => r.target === t);
  await prisma.$transaction(async (tx) => {
    if (input.vendorScore !== undefined && order.vendorId && !has('VENDOR')) {
      await tx.rating.create({
        data: { orderId, raterId: userId, target: 'VENDOR', vendorId: order.vendorId, score: input.vendorScore, comment: input.vendorComment },
      });
      const agg = await tx.rating.aggregate({ where: { vendorId: order.vendorId, target: 'VENDOR' }, _avg: { score: true }, _count: true });
      await tx.vendor.update({ where: { id: order.vendorId }, data: { ratingAvg: agg._avg.score ?? 0, ratingCount: agg._count } });
    }
    if (input.riderScore !== undefined && order.riderId && !has('RIDER')) {
      await tx.rating.create({
        data: { orderId, raterId: userId, target: 'RIDER', riderId: order.riderId, score: input.riderScore, comment: input.riderComment },
      });
      const agg = await tx.rating.aggregate({ where: { riderId: order.riderId, target: 'RIDER' }, _avg: { score: true }, _count: true });
      await tx.rider.update({ where: { id: order.riderId }, data: { ratingAvg: agg._avg.score ?? 0, ratingCount: agg._count } });
    }
  });
  return prisma.rating.findMany({ where: { orderId }, select: { target: true, score: true, comment: true } });
}
