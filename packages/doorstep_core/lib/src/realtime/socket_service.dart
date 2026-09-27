import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../api/api_client.dart';

/// Authenticated Socket.IO connection to the DoorStep API.
///
/// Re-reads the access token on every reconnect, refreshes it when the server
/// rejects it, and re-joins order rooms after reconnecting.
class SocketService extends ChangeNotifier {
  SocketService(this.api);

  final ApiClient api;
  io.Socket? _socket;
  bool _connected = false;
  final Set<String> _orderRooms = {};
  final Map<String, Set<void Function(dynamic)>> _handlers = {};

  bool get isConnected => _connected;

  void connect() {
    if (_socket != null) return;
    final socket = io.io(
      api.baseUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .enableForceNew()
          .enableReconnection()
          .setReconnectionDelayMax(10000)
          .setAuthFn((cb) => cb({'token': api.tokens.accessToken}))
          .build(),
    );
    socket.onConnect((_) {
      _setConnected(true);
      for (final orderId in _orderRooms) {
        socket.emit('order:subscribe', {'orderId': orderId});
      }
    });
    socket.onDisconnect((_) => _setConnected(false));
    socket.onConnectError((error) async {
      _setConnected(false);
      final message = error is Map ? error['message'] : error?.toString();
      if (message != null && message.toString().contains('unauthorized')) {
        if (await api.refreshSession()) socket.connect();
      }
    });
    for (final entry in _handlers.entries) {
      for (final handler in entry.value) {
        socket.on(entry.key, handler);
      }
    }
    _socket = socket;
    socket.connect();
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
    _orderRooms.clear();
    _setConnected(false);
  }

  /// Listens to a server event; returns a function that removes the listener.
  VoidCallback on(String event, void Function(dynamic data) handler) {
    _handlers.putIfAbsent(event, () => <void Function(dynamic)>{}).add(handler);
    _socket?.on(event, handler);
    return () {
      _handlers[event]?.remove(handler);
      _socket?.off(event, handler);
    };
  }

  void subscribeOrder(String orderId) {
    _orderRooms.add(orderId);
    if (_connected) _socket?.emit('order:subscribe', {'orderId': orderId});
  }

  void unsubscribeOrder(String orderId) {
    _orderRooms.remove(orderId);
    if (_connected) _socket?.emit('order:unsubscribe', {'orderId': orderId});
  }

  /// Emits an event if connected. Returns false when offline so callers can fall back to REST.
  bool emit(String event, Object data) {
    if (!_connected || _socket == null) return false;
    _socket!.emit(event, data);
    return true;
  }

  void _setConnected(bool value) {
    if (_connected == value) return;
    _connected = value;
    notifyListeners();
  }

  @override
  void dispose() {
    disconnect();
    super.dispose();
  }
}
