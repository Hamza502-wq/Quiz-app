import 'dart:async';

import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:provider/provider.dart';

import '../checkout/payment_screen.dart';
import 'rate_order_screen.dart';

/// Order details with live tracking: rider on the map, ETA, status timeline,
/// delivery PIN, call/chat, cancel, pay, rate, tip and dispute actions.
class OrderDetailScreen extends StatefulWidget {
  const OrderDetailScreen({super.key, required this.orderId});
  final String orderId;

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  Order? _order;
  Object? _error;
  GeoPoint? _riderLocation;
  int? _etaMinutes;
  GoogleMapController? _map;
  Timer? _poll;
  final List<VoidCallback> _unsubscribers = [];
  late final SocketService _socket = context.read<SocketService>();

  @override
  void initState() {
    super.initState();
    _load();
    _socket.subscribeOrder(widget.orderId);
    _unsubscribers.add(_socket.on('order:updated', (data) {
      if (data is Map && data['id'] == widget.orderId && data['items'] != null && mounted) {
        final order = Order.fromJson(Map<String, dynamic>.from(data));
        setState(() => _order = order);
        _riderLocation = order.rider?.location ?? _riderLocation;
      }
    }));
    _unsubscribers.add(_socket.on('order:rider_location', (data) {
      if (data is Map && data['orderId'] == widget.orderId && mounted) {
        setState(() {
          _riderLocation = GeoPoint((data['lat'] as num).toDouble(), (data['lng'] as num).toDouble());
          _etaMinutes = (data['etaMinutes'] as num?)?.toInt();
        });
        final loc = _riderLocation!;
        _map?.animateCamera(CameraUpdate.newLatLng(LatLng(loc.lat, loc.lng)));
      }
    }));
    // Low-data fallback: poll the lightweight tracking endpoint while the socket is down.
    _poll = Timer.periodic(context.read<AppSettings>().pollInterval, (_) {
      if (!_socket.isConnected && (_order?.status.isActive ?? false)) _refreshTracking();
    });
  }

  @override
  void dispose() {
    for (final u in _unsubscribers) {
      u();
    }
    _socket.unsubscribeOrder(widget.orderId);
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final data = await context.read<ApiClient>().get('/orders/${widget.orderId}');
      final order = Order.fromJson(data as Map<String, dynamic>);
      if (!mounted) return;
      setState(() {
        _order = order;
        _error = null;
        _riderLocation = order.rider?.location;
      });
      if (order.status.isActive) _refreshTracking();
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _refreshTracking() async {
    try {
      final data = await context.read<ApiClient>().get('/orders/${widget.orderId}/tracking');
      final t = TrackingSnapshot.fromJson(data as Map<String, dynamic>);
      if (!mounted) return;
      setState(() {
        _riderLocation = t.riderLocation ?? _riderLocation;
        _etaMinutes = t.etaMinutes;
      });
      if (_order != null && t.status != _order!.status) _load();
    } catch (_) {}
  }

  Future<void> _cancel() async {
    final reason = await showDialog<String>(context: context, builder: (_) => const _CancelDialog());
    if (reason == null || !mounted) return;
    final data = await runWithFeedback(
      context,
      () => context.read<ApiClient>().post('/orders/${widget.orderId}/cancel', body: {if (reason.isNotEmpty) 'reason': reason}),
      success: 'Order cancelled',
    );
    if (data != null && mounted) setState(() => _order = Order.fromJson(data as Map<String, dynamic>));
  }

  @override
  Widget build(BuildContext context) {
    final order = _order;
    if (order == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Order')),
        body: _error != null ? ErrorView(error: _error!, onRetry: _load) : const LoadingView(message: 'Loading your order…', layout: SkeletonLayout.detail),
      );
    }
    final lowData = context.watch<AppSettings>().lowDataMode;
    final connected = context.watch<SocketService>().isConnected;
    return Scaffold(
      appBar: AppBar(title: Text(order.code)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            OfflineBanner(visible: order.status.isActive && !connected),
            if (order.status.isActive || order.status == OrderStatus.pendingPayment) _TrackingMap(order: order, rider: _riderLocation, lowData: lowData, onCreated: (c) => _map = c),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _StatusHeader(order: order, etaMinutes: _etaMinutes),
                  const SizedBox(height: 12),
                  if (order.status.isActive && order.deliveryPin != null) _PinCard(pin: order.deliveryPin!),
                  if (order.status == OrderStatus.pendingPayment) ...[
                    const SizedBox(height: 12),
                    PrimaryButton(
                      label: 'Complete payment',
                      icon: Icons.payments_outlined,
                      onPressed: () async {
                        await Navigator.of(context).push(MaterialPageRoute<void>(
                          builder: (_) => PaymentScreen(orderId: order.id, method: order.paymentMethod == 'CASH' ? 'ECOCASH' : order.paymentMethod, initialError: 'Your payment has not been completed yet.'),
                        ));
                        _load();
                      },
                    ),
                  ],
                  if (order.rider != null && order.status.isActive) ...[const SizedBox(height: 12), _RiderCard(order: order)],
                  const SizedBox(height: 12),
                  _Timeline(order: order),
                  const SizedBox(height: 12),
                  _ItemsCard(order: order),
                  const SizedBox(height: 12),
                  _AddressesCard(order: order),
                  const SizedBox(height: 16),
                  if (order.canRate)
                    PrimaryButton(
                      label: 'Rate & tip',
                      icon: Icons.star_rounded,
                      onPressed: () async {
                        await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => RateOrderScreen(order: order)));
                        _load();
                      },
                    ),
                  if (order.status == OrderStatus.delivered && !order.canRate && order.rider != null)
                    OutlinedButton.icon(
                      onPressed: () async {
                        await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => RateOrderScreen(order: order, tipOnly: true)));
                        _load();
                      },
                      icon: const Icon(Icons.volunteer_activism_outlined),
                      label: const Text('Tip your rider'),
                    ),
                  if (order.status == OrderStatus.placed || order.status == OrderStatus.pendingPayment)
                    TextButton(onPressed: _cancel, child: const Text('Cancel order', style: TextStyle(color: DsColors.red))),
                  if (order.status != OrderStatus.pendingPayment && !order.hasDispute)
                    TextButton.icon(
                      onPressed: () => _showDisputeSheet(context, order, _load),
                      icon: const Icon(Icons.report_problem_outlined),
                      label: const Text('Report a problem'),
                    ),
                  if (order.hasDispute)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text('Problem reported — status: ${order.disputeStatus?.toLowerCase()}',
                          textAlign: TextAlign.center, style: const TextStyle(color: DsColors.muted)),
                    ),
                  const SizedBox(height: 24),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TrackingMap extends StatelessWidget {
  const _TrackingMap({required this.order, required this.rider, required this.lowData, required this.onCreated});
  final Order order;
  final GeoPoint? rider;
  final bool lowData;
  final ValueChanged<GoogleMapController> onCreated;

  @override
  Widget build(BuildContext context) {
    final pickup = LatLng(order.pickup.lat, order.pickup.lng);
    final dropoff = LatLng(order.dropoff.lat, order.dropoff.lng);
    final markers = <Marker>{
      Marker(
        markerId: const MarkerId('pickup'),
        position: pickup,
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueOrange),
        infoWindow: InfoWindow(title: order.vendorName ?? 'Pickup'),
      ),
      Marker(
        markerId: const MarkerId('dropoff'),
        position: dropoff,
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
        infoWindow: InfoWindow(title: 'You', snippet: order.dropoff.landmark),
      ),
      if (rider != null)
        Marker(
          markerId: const MarkerId('rider'),
          position: LatLng(rider!.lat, rider!.lng),
          icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueAzure),
          infoWindow: InfoWindow(title: order.rider?.name ?? 'Your rider'),
          zIndexInt: 2,
        ),
    };
    final center = rider != null
        ? LatLng(rider!.lat, rider!.lng)
        : LatLng((pickup.latitude + dropoff.latitude) / 2, (pickup.longitude + dropoff.longitude) / 2);
    return SizedBox(
      height: 240,
      child: GoogleMap(
        initialCameraPosition: CameraPosition(target: center, zoom: 13.5),
        markers: markers,
        polylines: {
          Polyline(polylineId: const PolylineId('route'), points: [pickup, dropoff], color: DsColors.orange, width: 4, patterns: [PatternItem.dash(20), PatternItem.gap(10)]),
        },
        liteModeEnabled: lowData,
        onMapCreated: onCreated,
        myLocationButtonEnabled: false,
        zoomControlsEnabled: false,
        mapToolbarEnabled: false,
      ),
    );
  }
}

class _StatusHeader extends StatelessWidget {
  const _StatusHeader({required this.order, required this.etaMinutes});
  final Order order;
  final int? etaMinutes;

  String get _headline => switch (order.status) {
        OrderStatus.pendingPayment => 'Waiting for your payment',
        OrderStatus.placed => order.isParcel ? 'Finding a rider for your parcel' : 'Waiting for ${order.vendorName ?? 'the store'} to accept',
        OrderStatus.accepted => order.prepMinutes != null ? 'Preparing your order (~${order.prepMinutes} min)' : 'Preparing your order',
        OrderStatus.readyForPickup => 'Ready — rider collecting soon',
        OrderStatus.pickedUp => 'Your rider has your order',
        OrderStatus.onTheWay => 'On the way to you 🛵',
        OrderStatus.delivered => 'Delivered. Enjoy!',
        OrderStatus.rejected => 'The store could not take this order',
        OrderStatus.cancelled => 'Order cancelled',
      };

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                StatusChip(status: order.status),
                const SizedBox(height: 8),
                Text(_headline, style: Theme.of(context).textTheme.titleLarge),
                if (order.rejectReason != null) Text(order.rejectReason!, style: const TextStyle(color: DsColors.red)),
                if (order.cancelReason != null && order.status == OrderStatus.cancelled) Text(order.cancelReason!, style: const TextStyle(color: DsColors.muted)),
                if ((order.status == OrderStatus.rejected || order.status == OrderStatus.cancelled) && order.paymentStatus == 'PAID' && order.paymentMethod != 'CASH')
                  const Padding(
                    padding: EdgeInsets.only(top: 4),
                    child: Text('Your refund is being processed.', style: TextStyle(color: DsColors.inkSoft)),
                  ),
              ],
            ),
          ),
          if (etaMinutes != null && order.status.isActive)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: DsColors.orangeLight, borderRadius: BorderRadius.circular(16)),
              child: Column(
                children: [
                  Text('$etaMinutes', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: DsColors.orange)),
                  const Text('min', style: TextStyle(color: DsColors.orange, fontWeight: FontWeight.w600)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _PinCard extends StatelessWidget {
  const _PinCard({required this.pin});
  final String pin;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: DsColors.black, borderRadius: BorderRadius.circular(18)),
      child: Row(
        children: [
          const Icon(Icons.lock_outline_rounded, color: DsColors.orange),
          const SizedBox(width: 12),
          const Expanded(
            child: Text('Give this PIN to your rider only when you receive your order', style: TextStyle(color: Colors.white)),
          ),
          Text(pin, style: const TextStyle(color: DsColors.orange, fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: 6)),
        ],
      ),
    );
  }
}

class _RiderCard extends StatelessWidget {
  const _RiderCard({required this.order});
  final Order order;

  @override
  Widget build(BuildContext context) {
    final r = order.rider!;
    return SectionCard(
      child: Row(
        children: [
          UserAvatar(url: r.photoUrl, name: r.name ?? 'Rider', size: 52),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(r.name ?? 'Your rider', style: const TextStyle(fontWeight: FontWeight.w700)),
                Text(r.vehicleDescription.isEmpty ? vehicleLabel(r.vehicleType) : r.vehicleDescription, style: const TextStyle(color: DsColors.muted, fontSize: 13)),
                if (r.vehiclePlate != null) Padding(padding: const EdgeInsets.symmetric(vertical: 3), child: PlateChip(plate: r.vehiclePlate!)),
                if (r.ratingAvg > 0) Text('★ ${r.ratingAvg.toStringAsFixed(1)}', style: const TextStyle(color: DsColors.orange, fontWeight: FontWeight.w600)),
              ],
            ),
          ),
          if (r.phone != null)
            IconButton.filledTonal(onPressed: () => callPhone(r.phone!), icon: const Icon(Icons.call_rounded), tooltip: 'Call rider'),
          const SizedBox(width: 4),
          IconButton.filledTonal(
            onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(
              builder: (_) => ChatScreen(orderId: order.id, title: r.name ?? 'Your rider', phone: r.phone),
            )),
            icon: const Icon(Icons.chat_bubble_outline_rounded),
            tooltip: 'Chat with rider',
          ),
        ],
      ),
    );
  }
}

class _Timeline extends StatelessWidget {
  const _Timeline({required this.order});
  final Order order;

  @override
  Widget build(BuildContext context) {
    final steps = order.isParcel
        ? [OrderStatus.placed, OrderStatus.pickedUp, OrderStatus.onTheWay, OrderStatus.delivered]
        : [OrderStatus.placed, OrderStatus.accepted, OrderStatus.readyForPickup, OrderStatus.pickedUp, OrderStatus.onTheWay, OrderStatus.delivered];
    final labels = {
      OrderStatus.placed: 'Order placed',
      OrderStatus.accepted: 'Store accepted',
      OrderStatus.readyForPickup: 'Ready for pickup',
      OrderStatus.pickedUp: 'Picked up',
      OrderStatus.onTheWay: 'On the way',
      OrderStatus.delivered: 'Delivered',
    };
    final reachedAt = <OrderStatus, DateTime>{};
    for (final e in order.events) {
      if (e.status != null) reachedAt[e.status!] = e.createdAt;
    }
    final currentIndex = steps.indexOf(order.status);
    if (order.status == OrderStatus.cancelled || order.status == OrderStatus.rejected || order.status == OrderStatus.pendingPayment) {
      return const SizedBox.shrink();
    }
    return SectionCard(
      title: 'Progress',
      child: Column(
        children: [
          for (var i = 0; i < steps.length; i++)
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Column(
                  children: [
                    Icon(
                      i <= currentIndex ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
                      color: i <= currentIndex ? DsColors.orange : DsColors.line,
                      size: 22,
                    ),
                    if (i < steps.length - 1) Container(width: 2, height: 22, color: i < currentIndex ? DsColors.orange : DsColors.line),
                  ],
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 1),
                    child: Text(labels[steps[i]]!, style: TextStyle(fontWeight: i == currentIndex ? FontWeight.w700 : FontWeight.w500, color: i <= currentIndex ? DsColors.black : DsColors.muted)),
                  ),
                ),
                if (reachedAt[steps[i]] != null) Text(formatTime(reachedAt[steps[i]]), style: const TextStyle(color: DsColors.muted, fontSize: 12)),
              ],
            ),
        ],
      ),
    );
  }
}

class _ItemsCard extends StatelessWidget {
  const _ItemsCard({required this.order});
  final Order order;

  @override
  Widget build(BuildContext context) {
    final a = order.amounts;
    String fmt(int usd) => formatInCurrency(usd, a.currency, a.exchangeRate);
    return SectionCard(
      title: order.isParcel ? 'Parcel' : 'Items from ${order.vendorName ?? ''}',
      child: Column(
        children: [
          if (order.isParcel)
            KeyValueRow(label: '${order.parcelSize?.toLowerCase() ?? ''} parcel', value: order.parcelDescription ?? '')
          else
            for (final i in order.items) KeyValueRow(label: '${i.quantity}× ${i.name}', value: fmt(i.lineTotalCents)),
          const Divider(height: 20),
          if (!order.isParcel) KeyValueRow(label: 'Subtotal', value: fmt(a.subtotalCents)),
          KeyValueRow(label: 'Delivery', value: fmt(a.deliveryFeeCents)),
          if (a.tipCents > 0) KeyValueRow(label: 'Tip', value: fmt(a.tipCents)),
          KeyValueRow(label: 'Total', value: formatMoney(a.totalLocalCents, a.currency), bold: true, valueColor: DsColors.orange),
          const SizedBox(height: 6),
          Row(
            children: [
              const Icon(Icons.payments_outlined, size: 18, color: DsColors.muted),
              const SizedBox(width: 6),
              Text('${paymentLabel(order.paymentMethod)} · ${order.paymentStatus.toLowerCase()}', style: const TextStyle(color: DsColors.muted)),
            ],
          ),
        ],
      ),
    );
  }
}

class _AddressesCard extends StatelessWidget {
  const _AddressesCard({required this.order});
  final Order order;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      title: 'Route',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.storefront_rounded, color: DsColors.orange),
            title: Text(order.isParcel ? 'Pickup' : (order.vendorName ?? 'Store')),
            subtitle: Text([order.pickup.address, order.pickup.landmark].whereType<String>().join(' · ')),
            trailing: order.vendorPhone != null
                ? IconButton(onPressed: () => callPhone(order.vendorPhone!), icon: const Icon(Icons.call_outlined), tooltip: 'Call store')
                : null,
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.location_on_rounded, color: DsColors.red),
            title: Text(order.isParcel ? 'Drop-off · ${order.dropoff.contactName ?? ''}' : 'Deliver to'),
            subtitle: Text([order.dropoff.address, order.dropoff.landmark].whereType<String>().join(' · ')),
          ),
          if (order.notes != null) Text('Note: ${order.notes}', style: const TextStyle(color: DsColors.muted)),
        ],
      ),
    );
  }
}

class _CancelDialog extends StatefulWidget {
  const _CancelDialog();

  @override
  State<_CancelDialog> createState() => _CancelDialogState();
}

class _CancelDialogState extends State<_CancelDialog> {
  final _reason = TextEditingController();

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Cancel order?'),
      content: TextField(controller: _reason, maxLength: 200, decoration: const InputDecoration(hintText: 'Reason (optional)')),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Keep order')),
        TextButton(onPressed: () => Navigator.pop(context, _reason.text.trim()), child: const Text('Cancel order', style: TextStyle(color: DsColors.red))),
      ],
    );
  }
}

void _showDisputeSheet(BuildContext context, Order order, Future<void> Function() onDone) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (_) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: _DisputeForm(order: order, onDone: onDone),
    ),
  );
}

class _DisputeForm extends StatefulWidget {
  const _DisputeForm({required this.order, required this.onDone});
  final Order order;
  final Future<void> Function() onDone;

  @override
  State<_DisputeForm> createState() => _DisputeFormState();
}

class _DisputeFormState extends State<_DisputeForm> {
  static const _reasons = {
    'MISSING_ITEMS': 'Missing items',
    'WRONG_ORDER': 'Wrong order',
    'DAMAGED': 'Damaged / spilled',
    'LATE': 'Very late',
    'NOT_DELIVERED': 'Not delivered',
    'OVERCHARGED': 'Charged incorrectly',
    'RIDER_CONDUCT': 'Rider behaviour',
    'OTHER': 'Something else',
  };
  String _reason = 'MISSING_ITEMS';
  final _description = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _description.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Report a problem', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final e in _reasons.entries)
                  ChoiceChip(label: Text(e.value), selected: _reason == e.key, onSelected: (_) => setState(() => _reason = e.key)),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _description,
              maxLength: 1000,
              minLines: 3,
              maxLines: 5,
              decoration: const InputDecoration(hintText: 'Tell us what happened'),
            ),
            const SizedBox(height: 8),
            PrimaryButton(
              label: 'Send to DoorStep support',
              loading: _sending,
              onPressed: () async {
                if (_description.text.trim().isEmpty) {
                  showSnack(context, 'Please describe the problem', error: true);
                  return;
                }
                setState(() => _sending = true);
                final ok = await runWithFeedback(
                  context,
                  () => context.read<ApiClient>().post('/orders/${widget.order.id}/dispute', body: {'reason': _reason, 'description': _description.text.trim()}),
                  success: "Thanks — we'll get back to you shortly.",
                );
                if (!context.mounted) return;
                setState(() => _sending = false);
                if (ok != null) {
                  Navigator.pop(context);
                  await widget.onDone();
                }
              },
            ),
          ],
        ),
      ),
    );
  }
}
