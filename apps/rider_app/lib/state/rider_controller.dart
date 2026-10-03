import 'dart:async';

import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/foundation.dart';

import 'location_tracker.dart';

/// Rider session state: registration/approval, online status, the current
/// delivery request and the active delivery. Kept live via Socket.IO, or by
/// polling the API while there is no live connection.
class RiderController extends ChangeNotifier {
  RiderController({required this.api, required this.socket, required this.tracker}) {
    socket.on('dispatch:offer', (data) {
      if (data is Map) {
        _offer = DispatchOffer.fromJson(Map<String, dynamic>.from(data));
        notifyListeners();
      }
    });
    socket.on('dispatch:offer_cancelled', (data) {
      if (data is Map && data['offerId'] == _offer?.offerId) {
        _offer = null;
        notifyListeners();
      }
    });
    socket.on('order:updated', (data) {
      if (data is! Map) return;
      if (data['unassigned'] == true || (data['items'] == null && data['status'] == 'CANCELLED')) {
        refresh();
        return;
      }
      if (data['items'] != null) {
        final order = Order.fromJson(Map<String, dynamic>.from(data));
        if (order.status.isActive) {
          _activeOrder = order;
        } else if (_activeOrder?.id == order.id) {
          _activeOrder = null;
          refresh();
        }
        notifyListeners();
      }
    });
    // A message from the customer or store: refresh so the unread count shows.
    socket.on('chat:message', (data) {
      if (data is Map && data['mine'] != true && data['orderId'] == _activeOrder?.id) refresh();
    });
  }

  final ApiClient api;
  final SocketService socket;
  final LocationTracker tracker;

  RiderDashboard? _dashboard;
  DispatchOffer? _offer;
  Order? _activeOrder;
  bool _loading = false;
  Object? _error;
  bool _toggling = false;

  RiderDashboard? get dashboard => _dashboard;
  RiderProfile? get rider => _dashboard?.rider;
  DispatchOffer? get offer => _offer != null && _offer!.expiresAt.isAfter(DateTime.now()) ? _offer : null;
  Order? get activeOrder => _activeOrder;
  bool get loading => _loading;
  Object? get error => _error;
  bool get isOnline => rider?.isOnline ?? false;
  bool get toggling => _toggling;

  Future<void> refresh() async {
    _loading = _dashboard == null;
    _error = null;
    notifyListeners();
    try {
      final data = await api.get('/rider/me');
      _dashboard = RiderDashboard.fromJson(data as Map<String, dynamic>);
      _activeOrder = _dashboard!.activeOrder;
      _offer = _dashboard!.pendingOffer;
      // Resume location sharing if the rider was left online (e.g. app restarted).
      if (isOnline && !tracker.isTracking) {
        try {
          await tracker.start();
        } catch (_) {}
      }
    } catch (e) {
      _error = e;
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> setOnline(bool online) async {
    _toggling = true;
    notifyListeners();
    try {
      if (online) {
        final position = await tracker.currentPosition();
        await api.post('/rider/status', body: {'online': true, 'lat': position.latitude, 'lng': position.longitude});
        await tracker.start();
      } else {
        await api.post('/rider/status', body: {'online': false});
        await tracker.stop();
        _offer = null;
      }
      await refresh();
    } finally {
      _toggling = false;
      notifyListeners();
    }
  }

  /// Best-effort offline on sign-out.
  Future<void> goOfflineQuietly() async {
    await tracker.stop();
    if (isOnline && _activeOrder == null) {
      try {
        await api.post('/rider/status', body: {'online': false});
      } catch (_) {}
    }
  }

  Future<Order> acceptOffer(DispatchOffer offer) async {
    try {
      final data = await api.post('/rider/offers/${offer.offerId}/accept');
      final order = Order.fromJson(data as Map<String, dynamic>);
      _offer = null;
      _activeOrder = order;
      notifyListeners();
      return order;
    } catch (e) {
      _offer = null;
      notifyListeners();
      rethrow;
    }
  }

  Future<void> declineOffer(DispatchOffer offer) async {
    _offer = null;
    notifyListeners();
    try {
      await api.post('/rider/offers/${offer.offerId}/decline');
    } catch (_) {
      // Offer will simply expire.
    }
  }

  void dismissExpiredOffer() {
    if (_offer != null && !_offer!.expiresAt.isAfter(DateTime.now())) {
      _offer = null;
      notifyListeners();
    }
  }

  /// Runs a delivery status action and updates the active order.
  Future<Order> orderAction(String orderId, String action, {Map<String, dynamic>? body}) async {
    final data = await api.post('/rider/orders/$orderId/$action', body: body);
    final order = Order.fromJson(data as Map<String, dynamic>);
    _activeOrder = order.status.isActive ? order : null;
    notifyListeners();
    if (!order.status.isActive) await refresh();
    return order;
  }

  /// Delivery zones the rider can choose to work in.
  Future<List<DeliveryZone>> zones() async {
    final data = await api.get('/rider/zones') as List;
    return data.map((e) => DeliveryZone.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Sets the zone the rider takes deliveries in; null means any zone.
  Future<void> setZone(String? zoneId) async {
    final data = await api.patch('/rider/me', body: {'zoneId': zoneId});
    _dashboard = RiderDashboard.fromJson(data as Map<String, dynamic>);
    _activeOrder = _dashboard!.activeOrder;
    _offer = _dashboard!.pendingOffer;
    notifyListeners();
  }

  /// Hands an assigned delivery back before pickup (it is re-dispatched).
  Future<void> releaseOrder(String orderId, String? reason) async {
    await api.post('/rider/orders/$orderId/decline', body: {if (reason != null && reason.isNotEmpty) 'reason': reason});
    _activeOrder = null;
    await refresh();
  }

  Timer? _poll;

  /// While signed in, refreshes every few seconds whenever the live connection
  /// is down (or realtime is off), so new delivery requests still appear.
  void startPolling({Duration every = const Duration(seconds: 5)}) {
    _poll?.cancel();
    _poll = Timer.periodic(every, (_) {
      if (!socket.isConnected && !_loading && !_toggling) refresh();
    });
  }

  void stopPolling() {
    _poll?.cancel();
    _poll = null;
  }

  @override
  void dispose() {
    stopPolling();
    super.dispose();
  }

  void reset() {
    _dashboard = null;
    _offer = null;
    _activeOrder = null;
    _error = null;
    notifyListeners();
  }
}
