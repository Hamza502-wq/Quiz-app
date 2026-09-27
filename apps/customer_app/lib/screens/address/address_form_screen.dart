import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:provider/provider.dart';

import '../../state/address_controller.dart';
import '../../widgets/map_pin_picker.dart';

/// Add/edit an address: drop a pin on the map and describe a landmark riders can find.
class AddressFormScreen extends StatefulWidget {
  const AddressFormScreen({super.key, this.address});
  final Address? address;

  @override
  State<AddressFormScreen> createState() => _AddressFormScreenState();
}

class _AddressFormScreenState extends State<AddressFormScreen> {
  final _form = GlobalKey<FormState>();
  late final _landmark = TextEditingController(text: widget.address?.landmark);
  late final _street = TextEditingController(text: widget.address?.street);
  late final _suburb = TextEditingController(text: widget.address?.suburb);
  late final _city = TextEditingController(text: widget.address?.city ?? 'Harare');
  late String _label = widget.address?.label ?? 'Home';
  late LatLng _position = widget.address != null
      ? LatLng(widget.address!.lat, widget.address!.lng)
      : const LatLng(AppConfig.defaultLat, AppConfig.defaultLng);
  bool _makeDefault = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    if (widget.address == null) _locate();
  }

  Future<void> _locate() async {
    try {
      final p = await currentPosition();
      if (mounted) setState(() => _position = LatLng(p.latitude, p.longitude));
    } catch (_) {
      // Stay on the default position; the user can pan the map.
    }
  }

  @override
  void dispose() {
    _landmark.dispose();
    _street.dispose();
    _suburb.dispose();
    _city.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _saving = true);
    final controller = context.read<AddressController>();
    try {
      await controller.save(id: widget.address?.id, body: {
        'label': _label,
        'lat': _position.latitude,
        'lng': _position.longitude,
        'landmark': _landmark.text.trim(),
        if (_street.text.trim().isNotEmpty) 'street': _street.text.trim(),
        if (_suburb.text.trim().isNotEmpty) 'suburb': _suburb.text.trim(),
        'city': _city.text.trim(),
        if (_makeDefault) 'makeDefault': true,
      });
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) showSnack(context, errorMessage(e), error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.address == null ? 'New address' : 'Edit address')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Text('Move the map so the pin sits on your gate or door.', style: TextStyle(color: DsColors.muted)),
            const SizedBox(height: 10),
            MapPinPicker(
              key: ValueKey('${_position.latitude.toStringAsFixed(4)},${_position.longitude.toStringAsFixed(4)}-${widget.address?.id}'),
              initial: _position,
              onChanged: (p) => _position = p,
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _landmark,
              maxLength: 200,
              minLines: 2,
              maxLines: 3,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                labelText: 'Landmark & directions *',
                hintText: 'e.g. Blue gate opposite Spar, ring twice',
                prefixIcon: Icon(Icons.flag_outlined),
              ),
              validator: (v) => (v ?? '').trim().length < 3 ? 'Describe how a rider finds you' : null,
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                for (final l in const ['Home', 'Work', 'Other'])
                  ChoiceChip(label: Text(l), selected: _label == l, onSelected: (_) => setState(() => _label = l)),
              ],
            ),
            const SizedBox(height: 16),
            TextFormField(controller: _street, maxLength: 120, decoration: const InputDecoration(labelText: 'House number & street (optional)')),
            Row(
              children: [
                Expanded(child: TextFormField(controller: _suburb, maxLength: 80, decoration: const InputDecoration(labelText: 'Suburb'))),
                const SizedBox(width: 12),
                Expanded(
                  child: TextFormField(
                    controller: _city,
                    maxLength: 60,
                    decoration: const InputDecoration(labelText: 'City'),
                    validator: (v) => (v ?? '').trim().length < 2 ? 'Required' : null,
                  ),
                ),
              ],
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _makeDefault,
              onChanged: (v) => setState(() => _makeDefault = v),
              title: const Text('Make this my default address'),
            ),
            const SizedBox(height: 12),
            PrimaryButton(label: 'Save address', loading: _saving, onPressed: _save),
          ],
        ),
      ),
    );
  }
}
