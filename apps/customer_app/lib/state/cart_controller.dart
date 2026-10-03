import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class CartLine {
  CartLine({required this.productId, required this.name, required this.priceCents, required this.quantity, this.notes, this.thumbUrl});

  factory CartLine.fromJson(Map<String, dynamic> j) => CartLine(
        productId: j['productId'] as String,
        name: j['name'] as String,
        priceCents: (j['priceCents'] as num).toInt(),
        quantity: (j['quantity'] as num).toInt(),
        notes: j['notes'] as String?,
        thumbUrl: j['thumbUrl'] as String?,
      );

  final String productId;
  final String name;
  final int priceCents;
  int quantity;
  String? notes;
  final String? thumbUrl;

  int get totalCents => priceCents * quantity;

  Map<String, dynamic> toJson() =>
      {'productId': productId, 'name': name, 'priceCents': priceCents, 'quantity': quantity, 'notes': notes, 'thumbUrl': thumbUrl};
}

/// Single-vendor cart, persisted so it survives restarts and dropped connections.
class CartController extends ChangeNotifier {
  static const _key = 'ds_cart';
  static const maxQuantity = 99;

  String? _vendorId;
  String? _vendorName;
  final List<CartLine> _lines = [];

  String? get vendorId => _vendorId;
  String? get vendorName => _vendorName;
  List<CartLine> get lines => List.unmodifiable(_lines);
  bool get isEmpty => _lines.isEmpty;
  int get itemCount => _lines.fold(0, (s, l) => s + l.quantity);
  int get subtotalCents => _lines.fold(0, (s, l) => s + l.totalCents);

  int quantityOf(String productId) => _lines.where((l) => l.productId == productId).fold(0, (s, l) => s + l.quantity);

  bool belongsToOtherVendor(String vendorId) => _vendorId != null && _vendorId != vendorId && _lines.isNotEmpty;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null) return;
    try {
      final j = jsonDecode(raw) as Map<String, dynamic>;
      _vendorId = j['vendorId'] as String?;
      _vendorName = j['vendorName'] as String?;
      _lines
        ..clear()
        ..addAll((j['lines'] as List).map((e) => CartLine.fromJson(e as Map<String, dynamic>)));
      notifyListeners();
    } catch (_) {
      await prefs.remove(_key);
    }
  }

  void add({
    required String vendorId,
    required String vendorName,
    required String productId,
    required String name,
    required int priceCents,
    String? thumbUrl,
    int quantity = 1,
  }) {
    if (belongsToOtherVendor(vendorId)) _lines.clear();
    _vendorId = vendorId;
    _vendorName = vendorName;
    final existing = _lines.where((l) => l.productId == productId && l.notes == null).firstOrNull;
    if (existing != null) {
      existing.quantity = (existing.quantity + quantity).clamp(1, maxQuantity);
    } else {
      _lines.add(CartLine(productId: productId, name: name, priceCents: priceCents, quantity: quantity.clamp(1, maxQuantity), thumbUrl: thumbUrl));
    }
    _changed();
  }

  void setQuantity(String productId, int quantity) {
    final line = _lines.where((l) => l.productId == productId).firstOrNull;
    if (line == null) return;
    if (quantity <= 0) {
      _lines.remove(line);
    } else {
      line.quantity = quantity.clamp(1, maxQuantity);
    }
    if (_lines.isEmpty) {
      _vendorId = null;
      _vendorName = null;
    }
    _changed();
  }

  void setNotes(String productId, String? notes) {
    final line = _lines.where((l) => l.productId == productId).firstOrNull;
    if (line == null) return;
    line.notes = (notes ?? '').trim().isEmpty ? null : notes!.trim();
    _changed();
  }

  Future<void> clear() async {
    _lines.clear();
    _vendorId = null;
    _vendorName = null;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
  }

  List<Map<String, dynamic>> toOrderItems() => _lines
      .map((l) => {'productId': l.productId, 'quantity': l.quantity, if (l.notes != null) 'notes': l.notes})
      .toList();

  void _changed() {
    notifyListeners();
    SharedPreferences.getInstance().then(
      (prefs) => prefs.setString(_key, jsonEncode({'vendorId': _vendorId, 'vendorName': _vendorName, 'lines': _lines.map((l) => l.toJson()).toList()})),
    );
  }
}
