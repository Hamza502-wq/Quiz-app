import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'payouts_screen.dart';

/// Wallet: balance (earnings − cash owed), transactions and delivery history.
class EarningsScreen extends StatelessWidget {
  const EarningsScreen({super.key, required this.visible});
  final bool visible;

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Earnings'),
          actions: [
            TextButton.icon(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const PayoutsScreen())),
              icon: const Icon(Icons.account_balance_outlined),
              label: const Text('Payouts'),
            ),
          ],
          bottom: const TabBar(labelColor: DsColors.orange, indicatorColor: DsColors.orange, tabs: [Tab(text: 'Wallet'), Tab(text: 'Deliveries')]),
        ),
        body: TabBarView(
          children: [
            _WalletTab(key: ValueKey('wallet-$visible')),
            _HistoryTab(key: ValueKey('history-$visible')),
          ],
        ),
      ),
    );
  }
}

class _WalletData {
  _WalletData(this.wallet, this.transactions);
  final WalletSummary wallet;
  final List<WalletTransaction> transactions;
}

class _WalletTab extends StatelessWidget {
  const _WalletTab({super.key});

  static const _labels = {
    'DELIVERY_FEE': 'Delivery',
    'TIP': 'Tip',
    'BONUS': 'Bonus',
    'CASH_COLLECTED': 'Cash collected',
    'CASH_REMITTED': 'Cash remitted',
    'PAYOUT': 'Payout',
    'PAYOUT_REVERSAL': 'Payout reversed',
    'ADJUSTMENT': 'Adjustment',
  };

  @override
  Widget build(BuildContext context) {
    final api = context.read<ApiClient>();
    return AsyncView<_WalletData>(
      skeleton: SkeletonLayout.detail,
      load: () async {
        final results = await Future.wait([api.get('/rider/wallet'), api.get('/rider/wallet/transactions', query: {'pageSize': 50})]);
        return _WalletData(
          WalletSummary.fromJson(results[0] as Map<String, dynamic>),
          Paged.fromJson(results[1] as Map<String, dynamic>, WalletTransaction.fromJson).items,
        );
      },
      builder: (context, data, reload) {
        final w = data.wallet;
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(color: DsColors.black, borderRadius: BorderRadius.circular(22)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Wallet balance', style: TextStyle(color: Colors.white70)),
                  Text(formatMoney(w.balanceCents), style: TextStyle(color: w.balanceCents < 0 ? const Color(0xFFFF8A80) : Colors.white, fontSize: 34, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  Text(
                    w.balanceCents < 0
                        ? 'You owe DoorStep ${formatMoney(w.cashOwedCents)} from cash orders. It’s deducted from your next earnings, or remit it at a DoorStep office.'
                        : 'Available for payout: ${formatMoney(w.availableForPayoutCents)}',
                    style: const TextStyle(color: Colors.white70),
                  ),
                  const SizedBox(height: 14),
                  FilledButton.icon(
                    onPressed: w.availableForPayoutCents <= 0
                        ? null
                        : () async {
                            await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const PayoutsScreen(openRequest: true)));
                            await reload();
                          },
                    icon: const Icon(Icons.send_to_mobile_rounded),
                    label: const Text('Request payout'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            SectionCard(
              child: Row(
                children: [
                  const Icon(Icons.payments_outlined, color: DsColors.orange),
                  const SizedBox(width: 12),
                  Expanded(child: Text('Cash limit: ${formatMoney(w.cashOwedCents)} owed of ${formatMoney(w.cashLimitCents)} · ${formatMoney(w.cashLimitRemainingCents)} left')),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Text('Recent activity', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            if (data.transactions.isEmpty)
              const EmptyView(icon: Icons.receipt_long_outlined, title: 'No earnings yet', message: 'Complete deliveries to start earning.')
            else
              Card(
                child: Column(
                  children: [
                    for (final t in data.transactions) ...[
                      ListTile(
                        title: Text(_labels[t.type] ?? t.type, style: const TextStyle(fontWeight: FontWeight.w600)),
                        subtitle: Text('${t.description}\n${formatDateTime(t.createdAt)}'),
                        isThreeLine: true,
                        trailing: Text(
                          '${t.amountCents < 0 ? '−' : '+'}${formatMoney(t.amountCents.abs())}',
                          style: TextStyle(fontWeight: FontWeight.w700, color: t.amountCents < 0 ? DsColors.red : DsColors.green),
                        ),
                      ),
                      if (t != data.transactions.last) const Divider(),
                    ],
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}

class _HistoryTab extends StatelessWidget {
  const _HistoryTab({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<ApiClient>();
    return AsyncView<Paged<Order>>(
      load: () async => Paged.fromJson(await api.get('/rider/orders', query: {'pageSize': 50}) as Map<String, dynamic>, Order.fromJson),
      builder: (context, data, _) {
        if (data.items.isEmpty) {
          return ListView(children: const [SizedBox(height: 100), EmptyView(icon: Icons.delivery_dining_outlined, title: 'No deliveries yet')]);
        }
        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: data.items.length,
          separatorBuilder: (_, _) => const SizedBox(height: 8),
          itemBuilder: (_, i) {
            final o = data.items[i];
            return Card(
              child: ListTile(
                title: Text('${o.code} · ${o.title}', style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text('${formatDateTime(o.deliveredAt ?? o.createdAt)} · ${o.distanceKm.toStringAsFixed(1)} km · ${paymentLabel(o.paymentMethod)}'),
                trailing: o.status == OrderStatus.delivered
                    ? Text(formatMoney((o.amounts.riderEarningCents ?? 0) + o.amounts.tipCents), style: const TextStyle(fontWeight: FontWeight.w700, color: DsColors.green))
                    : StatusChip(status: o.status),
              ),
            );
          },
        );
      },
    );
  }
}
