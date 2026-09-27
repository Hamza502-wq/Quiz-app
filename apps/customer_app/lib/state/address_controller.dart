import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Saved delivery addresses and the one currently selected for browsing/checkout.
class AddressController extends ChangeNotifier {
  AddressController(this.api);

  final ApiClient api;
  static const _selectedKey = 'ds_selected_address';

  List<Address> _addresses = [];
  String? _selectedId;
  bool _loading = false;
  Object? _error;

  List<Address> get addresses => _addresses;
  bool get loading => _loading;
  Object? get error => _error;

  Address? get selected {
    if (_addresses.isEmpty) return null;
    return _addresses.where((a) => a.id == _selectedId).firstOrNull ??
        _addresses.where((a) => a.isDefault).firstOrNull ??
        _addresses.first;
  }

  Future<void> load() async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      _selectedId ??= prefs.getString(_selectedKey);
      final data = await api.get('/customer/addresses') as List;
      _addresses = data.map((e) => Address.fromJson(e as Map<String, dynamic>)).toList();
    } catch (e) {
      _error = e;
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> select(Address address) async {
    _selectedId = address.id;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_selectedKey, address.id);
  }

  Future<Address> save({String? id, required Map<String, dynamic> body}) async {
    final data = id == null ? await api.post('/customer/addresses', body: body) : await api.patch('/customer/addresses/$id', body: body);
    final address = Address.fromJson(data as Map<String, dynamic>);
    await load();
    if (id == null) await select(address);
    return address;
  }

  Future<void> remove(String id) async {
    await api.delete('/customer/addresses/$id');
    if (_selectedId == id) _selectedId = null;
    await load();
  }

  void reset() {
    _addresses = [];
    _selectedId = null;
    notifyListeners();
  }
}
