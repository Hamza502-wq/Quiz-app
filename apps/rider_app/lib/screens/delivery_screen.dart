import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:provider/provider.dart';

import '../state/location_tracker.dart';
import '../state/rider_controller.dart';
import 'proof_screen.dart';

/// Active delivery: navigate to the store/sender, then to the customer.
class DeliveryScreen extends StatefulWidget {
  const DeliveryScreen({super.key, required this.orderId});
  final String orderId;

  @override
  State<DeliveryScreen> createState() => _DeliveryScreenState();
}

class _DeliveryScreenState extends State<DeliveryScreen> {
  bool _busy = false;
  Order? _loaded;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await context.read<ApiClient>().get('/orders/${widget.orderId}');
      if (mounted) setState(() => _loaded = Order.fromJson(data as Map<String, dynamic>));
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _action(String action, String success) async {
    setState(() => _busy = true);
    try {
      final order = await context.read<RiderController>().orderAction(widget.orderId, action);
      if (!mounted) return;
      setState(() => _loaded = order);
      showSnack(context, success);
    } catch (e) {
      if (mounted) showSnack(context, errorMessage(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _release() async {
    final reason = await showDialog<String>(context: context, builder: (_) => const _ReasonDialog());
    if (reason == null || !mounted) return;
    final navigator = Navigator.of(context);
    final controller = context.read<RiderController>();
    final released = await runWithFeedback<bool>(
      context,
      () async {
        await controller.releaseOrder(widget.orderId, reason);
        return true;
      },
      success: 'Delivery handed back',
    );
    if (released == true && mounted) navigator.pop();
  }

  @override
  Widget build(BuildContext context) {
    final live = context.watch<RiderController>().activeOrder;
    final order = live?.id == widget.orderId ? live : _loaded;
    final lowData = context.watch<AppSettings>().lowDataMode;
    final tracker = context.watch<LocationTracker>();

    if (order == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Delivery')),
        body: _error != null ? ErrorView(error: _error!, onRetry: _load) : const LoadingView(),
      );
    }

    final atPickupStage = order.status == OrderStatus.placed || order.status == OrderStatus.accepted || order.status == OrderStatus.readyForPickup;
    final target = atPickupStage ? order.pickup : order.dropoff;
    final contactPhone = atPickupStage ? (order.vendorPhone ?? order.pickup.contactPhone) : (order.dropoff.contactPhone ?? order.customerPhone);
    final me = tracker.last;

    return Scaffold(
      appBar: AppBar(
        title: Text(order.code),
        actions: [
          if (atPickupStage) TextButton(onPressed: _busy ? null : _release, child: const Text('Hand back')),
        ],
      ),
      body: order.status.isTerminal
          ? _Finished(order: order)
          : ListView(
              padding: EdgeInsets.zero,
              children: [
                SizedBox(
                  height: 250,
                  child: GoogleMap(
                    initialCameraPosition: CameraPosition(target: LatLng(target.lat, target.lng), zoom: 14),
                    liteModeEnabled: lowData,
                    myLocationEnabled: true,
                    myLocationButtonEnabled: false,
                    zoomControlsEnabled: false,
                    mapToolbarEnabled: false,
                    markers: {
                      Marker(markerId: const MarkerId('pickup'), position: LatLng(order.pickup.lat, order.pickup.lng), icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueOrange), infoWindow: InfoWindow(title: order.pickup.contactName ?? 'Pickup')),
                      Marker(markerId: const MarkerId('dropoff'), position: LatLng(order.dropoff.lat, order.dropoff.lng), icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed), infoWindow: InfoWindow(title: 'Customer', snippet: order.dropoff.landmark)),
                      if (me != null) Marker(markerId: const MarkerId('me'), position: LatLng(me.latitude, me.longitude), icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueAzure)),
                    },
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(children: [
                        StatusChip(status: order.status),
                        const Spacer(),
                        Text('Earn ${formatMoney((order.amounts.riderEarningCents ?? 0) + order.amounts.tipCents)}',
                            style: const TextStyle(fontWeight: FontWeight.w800, color: DsColors.orange)),
                      ]),
                      const SizedBox(height: 12),
                      SectionCard(
                        title: atPickupStage ? '1. Pick up' : '2. Deliver',
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(atPickupStage ? (order.pickup.contactName ?? order.title) : (order.dropoff.contactName ?? order.customerName ?? 'Customer'),
                                style: Theme.of(context).textTheme.titleMedium),
                            if (target.landmark != null)
                              Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  const Icon(Icons.flag_rounded, color: DsColors.red, size: 18),
                                  const SizedBox(width: 6),
                                  Expanded(child: Text(target.landmark!, style: const TextStyle(fontWeight: FontWeight.w600))),
                                ]),
                              ),
                            Text(target.address, style: const TextStyle(color: DsColors.muted)),
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                Expanded(
                                  child: FilledButton.icon(
                                    onPressed: () => openNavigation(target.lat, target.lng),
                                    icon: const Icon(Icons.navigation_rounded),
                                    label: const Text('Navigate'),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                if (contactPhone != null)
                                  IconButton.filledTonal(onPressed: () => callPhone(contactPhone), icon: const Icon(Icons.call_rounded), tooltip: 'Call'),
                                if (!atPickupStage) ...[
                                  const SizedBox(width: 4),
                                  IconButton.filledTonal(
                                    onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(
                                      builder: (_) => ChatScreen(orderId: order.id, title: order.customerName ?? 'Customer', phone: contactPhone),
                                    )),
                                    icon: const Icon(Icons.chat_bubble_outline_rounded),
                                    tooltip: 'Chat with customer',
                                  ),
                                ],
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      SectionCard(
                        title: order.isParcel ? 'Parcel' : 'Order items',
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (order.isParcel)
                              Text('${order.parcelSize?.toLowerCase() ?? ''} · ${order.parcelDescription ?? ''}')
                            else
                              for (final i in order.items) Text('${i.quantity}× ${i.name}'),
                            if (order.notes != null) ...[const SizedBox(height: 6), Text('Note: ${order.notes}', style: const TextStyle(color: DsColors.muted))],
                            const Divider(height: 20),
                            if (order.paymentMethod == 'CASH')
                              Container(
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(color: DsColors.redLight, borderRadius: BorderRadius.circular(10)),
                                child: Text('Collect cash: ${formatMoney(order.amounts.totalLocalCents, order.amounts.currency)}',
                                    style: const TextStyle(color: DsColors.red, fontWeight: FontWeight.w800, fontSize: 16)),
                              )
                            else
                              Text('Paid by ${paymentLabel(order.paymentMethod)} — do not collect cash', style: const TextStyle(color: DsColors.green, fontWeight: FontWeight.w600)),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      if (atPickupStage) ...[
                        if (order.status == OrderStatus.accepted && order.estimatedReadyAt != null)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: Text('Store expects it ready at ${formatTime(order.estimatedReadyAt)}', textAlign: TextAlign.center, style: const TextStyle(color: DsColors.muted)),
                          ),
                        if (order.status == OrderStatus.placed && !order.isParcel)
                          const Text('Waiting for the store to accept the order…', textAlign: TextAlign.center, style: TextStyle(color: DsColors.muted))
                        else
                          PrimaryButton(label: 'Picked up', icon: Icons.inventory_2_rounded, loading: _busy, onPressed: () => _action('picked-up', 'Marked as picked up')),
                      ],
                      if (order.status == OrderStatus.pickedUp)
                        PrimaryButton(label: 'Start trip to customer', icon: Icons.delivery_dining_rounded, loading: _busy, onPressed: () => _action('on-the-way', 'Customer notified you’re on the way')),
                      if (order.status == OrderStatus.pickedUp || order.status == OrderStatus.onTheWay) ...[
                        const SizedBox(height: 8),
                        PrimaryButton(
                          label: 'Complete delivery',
                          icon: Icons.check_circle_rounded,
                          color: DsColors.black,
                          onPressed: _busy
                              ? null
                              : () async {
                                  final done = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => ProofScreen(order: order)));
                                  if (done == true && mounted) await _load();
                                },
                        ),
                      ],
                      const SizedBox(height: 24),
                    ],
                  ),
                ),
              ],
            ),
    );
  }
}

class _ReasonDialog extends StatefulWidget {
  const _ReasonDialog();

  @override
  State<_ReasonDialog> createState() => _ReasonDialogState();
}

class _ReasonDialogState extends State<_ReasonDialog> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Hand back this delivery?'),
      content: TextField(controller: _controller, maxLength: 200, decoration: const InputDecoration(hintText: 'Reason (e.g. puncture)')),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Keep it')),
        TextButton(
          onPressed: () => Navigator.pop(context, _controller.text.trim()),
          child: const Text('Hand back', style: TextStyle(color: DsColors.red)),
        ),
      ],
    );
  }
}

class _Finished extends StatelessWidget {
  const _Finished({required this.order});
  final Order order;

  @override
  Widget build(BuildContext context) {
    final delivered = order.status == OrderStatus.delivered;
    return EmptyView(
      icon: delivered ? Icons.celebration_rounded : Icons.cancel_outlined,
      title: delivered ? 'Delivery complete!' : 'This delivery was ${order.status.label.toLowerCase()}',
      message: delivered ? 'You earned ${formatMoney((order.amounts.riderEarningCents ?? 0) + order.amounts.tipCents)}.' : null,
      action: FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Back to home')),
    );
  }
}
