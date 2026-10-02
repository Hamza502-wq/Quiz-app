import 'dart:async';

import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/location_tracker.dart';
import '../state/rider_controller.dart';
import 'delivery_screen.dart';

class RiderHomeScreen extends StatefulWidget {
  const RiderHomeScreen({super.key});

  @override
  State<RiderHomeScreen> createState() => _RiderHomeScreenState();
}

class _RiderHomeScreenState extends State<RiderHomeScreen> {
  String? _shownOfferId;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final offer = Provider.of<RiderController>(context).offer;
    if (offer != null && offer.offerId != _shownOfferId) {
      _shownOfferId = offer.offerId;
      WidgetsBinding.instance.addPostFrameCallback((_) => _showOffer(offer));
    }
  }

  Future<void> _showOffer(DispatchOffer offer) async {
    if (!mounted) return;
    final controller = context.read<RiderController>();
    final navigator = Navigator.of(context);
    final accepted = await showModalBottomSheet<bool>(
      context: context,
      isDismissible: false,
      enableDrag: false,
      isScrollControlled: true,
      builder: (_) => OfferSheet(offer: offer),
    );
    if (!mounted) return;
    if (accepted == true) {
      try {
        final order = await controller.acceptOffer(offer);
        if (!mounted) return;
        navigator.push(MaterialPageRoute<void>(builder: (_) => DeliveryScreen(orderId: order.id)));
      } catch (e) {
        if (mounted) showSnack(context, errorMessage(e), error: true);
      }
    } else if (accepted == false) {
      await controller.declineOffer(offer);
    } else {
      controller.dismissExpiredOffer();
    }
  }

  Future<void> _toggle(bool online) async {
    try {
      await context.read<RiderController>().setOnline(online);
      if (mounted) showSnack(context, online ? "You're online — we'll send you nearby deliveries." : "You're offline.");
    } on LocationPermissionException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    } catch (e) {
      if (mounted) showSnack(context, errorMessage(e), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<RiderController>();
    final socketConnected = context.watch<SocketService>().isConnected;
    final d = controller.dashboard;
    final rider = controller.rider;
    final active = controller.activeOrder;
    final online = controller.isOnline;

    return Scaffold(
      appBar: AppBar(
        title: const BrandAppBarTitle(title: 'DoorStep Rider'),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_none_rounded),
            tooltip: 'Notifications',
            onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const NotificationsScreen())),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: controller.refresh,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (online && AppConfig.realtime && !socketConnected)
              const Padding(
                padding: EdgeInsets.only(bottom: 12),
                child: OfflineBanner(visible: true, message: 'Weak connection — requests may be delayed. Location still sent when possible.'),
              ),
            _OnlineCard(online: online, busy: controller.toggling, canGoOffline: active == null, onChanged: _toggle),
            const SizedBox(height: 16),
            if (active != null) ...[
              _ActiveDeliveryCard(order: active, unreadMessages: d?.unreadMessages ?? 0),
              const SizedBox(height: 16),
            ] else if (online) ...[
              const _WaitingCard(),
              const SizedBox(height: 16),
            ],
            if (d?.wallet != null) ...[
              Row(
                children: [
                  Expanded(child: _StatTile(label: 'Today', value: formatMoney(d!.today!.earningsCents), hint: '${d.today!.deliveries} deliveries')),
                  const SizedBox(width: 12),
                  Expanded(child: _StatTile(label: 'This week', value: formatMoney(d.week!.earningsCents), hint: '${d.week!.deliveries} deliveries')),
                ],
              ),
              const SizedBox(height: 12),
              _CashCard(wallet: d.wallet!),
            ],
            if (rider != null) ...[
              const SizedBox(height: 12),
              Text(
                ['★ ${rider.ratingAvg.toStringAsFixed(1)} rating', '${rider.ratingCount} reviews', if (rider.vehiclePlate != null) rider.vehiclePlate!].join(' · '),
                textAlign: TextAlign.center,
                style: const TextStyle(color: DsColors.muted),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _OnlineCard extends StatelessWidget {
  const _OnlineCard({required this.online, required this.busy, required this.canGoOffline, required this.onChanged});
  final bool online;
  final bool busy;
  final bool canGoOffline;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 250),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: online ? DsColors.orange : DsColors.black, borderRadius: BorderRadius.circular(22)),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(online ? "You're online" : "You're offline", style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                Text(
                  online ? 'Keep the app open to receive requests.' : 'Go online to start receiving delivery requests.',
                  style: const TextStyle(color: Colors.white70),
                ),
              ],
            ),
          ),
          busy
              ? const SizedBox(width: 32, height: 32, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 3))
              : Transform.scale(
                  scale: 1.3,
                  child: Switch(
                    value: online,
                    onChanged: online && !canGoOffline
                        ? (_) => showSnack(context, 'Finish your current delivery before going offline.', error: true)
                        : onChanged,
                    thumbColor: const WidgetStatePropertyAll(Colors.white),
                    trackColor: WidgetStatePropertyAll(online ? DsColors.black.withValues(alpha: 0.3) : Colors.white24),
                  ),
                ),
        ],
      ),
    );
  }
}

class _WaitingCard extends StatelessWidget {
  const _WaitingCard();

  @override
  Widget build(BuildContext context) {
    return const SectionCard(
      child: Row(
        children: [
          SizedBox(width: 28, height: 28, child: CircularProgressIndicator(strokeWidth: 3, color: DsColors.orange)),
          SizedBox(width: 16),
          Expanded(child: Text('Looking for deliveries near you…', style: TextStyle(fontWeight: FontWeight.w600))),
        ],
      ),
    );
  }
}

class _ActiveDeliveryCard extends StatelessWidget {
  const _ActiveDeliveryCard({required this.order, required this.unreadMessages});
  final Order order;
  final int unreadMessages;

  @override
  Widget build(BuildContext context) {
    final toPickup = order.status == OrderStatus.placed || order.status == OrderStatus.accepted || order.status == OrderStatus.readyForPickup;
    return Card(
      color: DsColors.orangeLight,
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => DeliveryScreen(orderId: order.id))),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Text('Current delivery', style: TextStyle(fontWeight: FontWeight.w700)),
                  const Spacer(),
                  StatusChip(status: order.status),
                ],
              ),
              const SizedBox(height: 8),
              Text(toPickup ? 'Pick up at ${order.pickup.contactName ?? order.title}' : 'Deliver to ${order.customerName ?? order.dropoff.contactName ?? 'customer'}',
                  style: Theme.of(context).textTheme.titleMedium),
              Text(toPickup ? (order.pickup.landmark ?? order.pickup.address) : order.dropoff.landmark ?? order.dropoff.address,
                  style: const TextStyle(color: DsColors.inkSoft)),
              if (unreadMessages > 0) ...[
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: DsColors.orange, borderRadius: BorderRadius.circular(20)),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.chat_bubble_rounded, size: 14, color: Colors.white),
                      const SizedBox(width: 6),
                      Text('$unreadMessages new message${unreadMessages == 1 ? '' : 's'}',
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12)),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 12),
              const Row(
                children: [
                  Text('Open delivery', style: TextStyle(color: DsColors.orange, fontWeight: FontWeight.w700)),
                  Icon(Icons.chevron_right_rounded, color: DsColors.orange),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.label, required this.value, required this.hint});
  final String label;
  final String value;
  final String hint;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(color: DsColors.muted)),
          const SizedBox(height: 4),
          Text(value, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          Text(hint, style: const TextStyle(color: DsColors.muted, fontSize: 12)),
        ],
      ),
    );
  }
}

class _CashCard extends StatelessWidget {
  const _CashCard({required this.wallet});
  final WalletSummary wallet;

  @override
  Widget build(BuildContext context) {
    final ratio = wallet.cashLimitCents == 0 ? 0.0 : (wallet.cashOwedCents / wallet.cashLimitCents).clamp(0.0, 1.0);
    final nearLimit = ratio >= 0.8;
    return SectionCard(
      title: 'Cash on hand owed to DoorStep',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('${formatMoney(wallet.cashOwedCents)} of ${formatMoney(wallet.cashLimitCents)} limit',
              style: TextStyle(fontWeight: FontWeight.w700, color: nearLimit ? DsColors.red : DsColors.black)),
          const SizedBox(height: 8),
          LinearProgressIndicator(
            value: ratio,
            minHeight: 8,
            borderRadius: BorderRadius.circular(8),
            color: nearLimit ? DsColors.red : DsColors.orange,
            backgroundColor: DsColors.line,
          ),
          const SizedBox(height: 8),
          Text(
            nearLimit
                ? 'You’re close to your cash limit. Remit cash to keep receiving cash orders.'
                : 'Cash you collect is deducted from your earnings. Card and mobile-money orders are unaffected.',
            style: const TextStyle(color: DsColors.muted, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

/// Incoming delivery request with a countdown. Pops true (accept), false (decline) or null (expired).
class OfferSheet extends StatefulWidget {
  const OfferSheet({super.key, required this.offer});
  final DispatchOffer offer;

  @override
  State<OfferSheet> createState() => _OfferSheetState();
}

class _OfferSheetState extends State<OfferSheet> {
  late Timer _timer;
  late int _secondsLeft;
  late final int _total;
  late final RiderController _controller;
  bool _closed = false;

  @override
  void initState() {
    super.initState();
    _secondsLeft = widget.offer.expiresAt.difference(DateTime.now()).inSeconds.clamp(0, 600);
    _total = _secondsLeft == 0 ? 1 : _secondsLeft;
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _secondsLeft = widget.offer.expiresAt.difference(DateTime.now()).inSeconds.clamp(0, 600));
      if (_secondsLeft <= 0) _close(null);
    });
    // Close automatically if the offer is withdrawn (taken by someone else, order cancelled).
    _controller = context.read<RiderController>();
    _controller.addListener(_onControllerChange);
  }

  void _onControllerChange() {
    if (_controller.offer?.offerId != widget.offer.offerId) _close(null);
  }

  /// Pops this sheet exactly once, and only while it is the current route.
  void _close(bool? result) {
    if (_closed || !mounted) return;
    if (!(ModalRoute.of(context)?.isCurrent ?? false)) return;
    _closed = true;
    _timer.cancel();
    Navigator.of(context).pop(result);
  }

  @override
  void dispose() {
    _timer.cancel();
    _controller.removeListener(_onControllerChange);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final o = widget.offer;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Text('New delivery request', style: Theme.of(context).textTheme.titleLarge),
                const Spacer(),
                SizedBox(
                  width: 44,
                  height: 44,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      CircularProgressIndicator(value: _secondsLeft / _total, color: DsColors.orange, backgroundColor: DsColors.line),
                      Text('$_secondsLeft', style: const TextStyle(fontWeight: FontWeight.w800)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: DsColors.orangeLight, borderRadius: BorderRadius.circular(18)),
              child: Column(
                children: [
                  const Text('You earn', style: TextStyle(color: DsColors.inkSoft)),
                  Text(formatMoney(o.riderEarningCents + o.tipCents), style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w800, color: DsColors.orange)),
                  if (o.tipCents > 0) Text('includes ${formatMoney(o.tipCents)} tip', style: const TextStyle(color: DsColors.inkSoft, fontSize: 12)),
                ],
              ),
            ),
            const SizedBox(height: 12),
            _Leg(
              icon: Icons.storefront_rounded,
              color: DsColors.orange,
              title: o.vendorName ?? 'Parcel pickup',
              subtitle: [o.pickup.landmark, o.pickup.address].whereType<String>().join(' · '),
              trailing: o.distanceToPickupKm != null ? '${o.distanceToPickupKm!.toStringAsFixed(1)} km away' : null,
            ),
            _Leg(
              icon: Icons.location_on_rounded,
              color: DsColors.red,
              title: 'Drop-off',
              subtitle: [o.dropoff.landmark, o.dropoff.address].whereType<String>().join(' · '),
              trailing: '${o.distanceKm.toStringAsFixed(1)} km trip',
            ),
            if (o.cashToCollectCents > 0)
              Container(
                margin: const EdgeInsets.only(top: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: DsColors.redLight, borderRadius: BorderRadius.circular(12)),
                child: Row(
                  children: [
                    const Icon(Icons.payments_outlined, color: DsColors.red),
                    const SizedBox(width: 8),
                    Expanded(child: Text('Collect ${formatMoney(o.cashToCollectCents)} cash from the customer', style: const TextStyle(color: DsColors.red, fontWeight: FontWeight.w600))),
                  ],
                ),
              ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(child: OutlinedButton(onPressed: () => _close(false), child: const Text('Decline'))),
                const SizedBox(width: 12),
                Expanded(flex: 2, child: FilledButton(onPressed: () => _close(true), child: const Text('Accept'))),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Leg extends StatelessWidget {
  const _Leg({required this.icon, required this.color, required this.title, required this.subtitle, this.trailing});
  final IconData icon;
  final Color color;
  final String title;
  final String subtitle;
  final String? trailing;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon, color: color),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: Text(subtitle, maxLines: 2, overflow: TextOverflow.ellipsis),
      trailing: trailing == null ? null : Text(trailing!, style: const TextStyle(color: DsColors.muted, fontSize: 12)),
    );
  }
}
