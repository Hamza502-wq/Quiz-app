import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { dayKey, isoWeekKey, startOfLocalDay, startOfLocalWeek } from '../../lib/time';
import { formatMoney } from '../../lib/money';
import { postWalletEntry } from './wallet.service';
import { notifyAsync } from '../notifications/notification.service';

/**
 * Awards any delivery-count bonuses the rider has just qualified for.
 * Idempotent thanks to the (rule, rider, period) unique key.
 */
export async function checkAndAwardBonuses(riderId: string): Promise<void> {
  try {
    const rules = await prisma.bonusRule.findMany({ where: { isActive: true } });
    if (rules.length === 0) return;
    const now = new Date();
    const rider = await prisma.rider.findUnique({ where: { id: riderId }, select: { userId: true } });
    if (!rider) return;

    for (const rule of rules) {
      const since = rule.period === 'DAILY' ? startOfLocalDay(now) : startOfLocalWeek(now);
      const periodKey = rule.period === 'DAILY' ? dayKey(now) : isoWeekKey(now);
      const deliveries = await prisma.order.count({
        where: { riderId, status: 'DELIVERED', deliveredAt: { gte: since } },
      });
      if (deliveries < rule.deliveriesTarget) continue;

      try {
        await prisma.$transaction(async (tx) => {
          await tx.bonusAward.create({ data: { ruleId: rule.id, riderId, periodKey, amountCents: rule.amountCents } });
          await postWalletEntry(tx, riderId, {
            type: 'BONUS',
            amountCents: rule.amountCents,
            description: `Bonus: ${rule.name} (${periodKey})`,
          });
        });
        notifyAsync({
          userId: rider.userId,
          type: 'BONUS_AWARDED',
          title: 'Bonus earned! 🎉',
          body: `You earned ${formatMoney(rule.amountCents, 'USD')} for "${rule.name}".`,
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue; // already awarded
        throw err;
      }
    }
  } catch (err) {
    logger.error({ err, riderId }, 'Bonus evaluation failed');
  }
}
