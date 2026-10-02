import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../state/rider_controller.dart';
import 'document_picker.dart';
import 'zone_picker.dart';

/// Rider onboarding: photo, ID, driver's licence and vehicle details. Submitted for admin approval.
class RegistrationScreen extends StatefulWidget {
  const RegistrationScreen({super.key, this.existing});
  final RiderProfile? existing;

  @override
  State<RegistrationScreen> createState() => _RegistrationScreenState();
}

class _RegistrationScreenState extends State<RegistrationScreen> {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.existing?.name ?? context.read<AuthController>().profile?.name);
  final _nationalId = TextEditingController();
  final _licence = TextEditingController();
  late final _plate = TextEditingController(text: widget.existing?.vehiclePlate);
  late final _make = TextEditingController(text: widget.existing?.vehicleMake);
  late final _model = TextEditingController(text: widget.existing?.vehicleModel);
  late final _color = TextEditingController(text: widget.existing?.vehicleColor);
  late String _vehicleType = widget.existing?.vehicleType ?? 'MOTORBIKE';
  DateTime? _licenceExpiry;
  late String? _photoUrl = context.read<AuthController>().profile?.avatarUrl;
  String? _idUrl;
  String? _licenceUrl;
  String? _vehicleUrl;
  // Delivery zone (optional): null means any zone.
  late String? _zoneId = widget.existing?.zoneId;
  late String? _zoneName = widget.existing?.zoneName;
  bool _photoUploading = false;
  bool _submitting = false;

  Future<void> _pickPhoto() async {
    setState(() => _photoUploading = true);
    try {
      final url = await pickAndUpload(context, kind: 'avatar', preferredCamera: CameraDevice.front);
      if (url != null) setState(() => _photoUrl = url);
    } catch (e) {
      if (mounted) showSnack(context, errorMessage(e), error: true);
    } finally {
      if (mounted) setState(() => _photoUploading = false);
    }
  }

  @override
  void dispose() {
    for (final c in [_name, _nationalId, _licence, _plate, _make, _model, _color]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    if (_photoUrl == null) {
      showSnack(context, 'Add a clear photo of your face so customers can recognise you', error: true);
      return;
    }
    if (_idUrl == null || _licenceUrl == null) {
      showSnack(context, 'Upload photos of your ID and licence', error: true);
      return;
    }
    setState(() => _submitting = true);
    final controller = context.read<RiderController>();
    try {
      await context.read<ApiClient>().post('/rider/register', body: {
        'name': _name.text.trim(),
        'nationalId': _nationalId.text.trim(),
        'idDocumentUrl': _idUrl,
        'licenceNumber': _licence.text.trim(),
        'licenceDocumentUrl': _licenceUrl,
        if (_licenceExpiry != null) 'licenceExpiry': _licenceExpiry!.toIso8601String(),
        'vehicleType': _vehicleType,
        if (_make.text.trim().isNotEmpty) 'vehicleMake': _make.text.trim(),
        if (_model.text.trim().isNotEmpty) 'vehicleModel': _model.text.trim(),
        if (_vehicleType != 'BICYCLE') 'vehiclePlate': normalizeZwPlate(_plate.text),
        'photoUrl': _photoUrl,
        if (_color.text.trim().isNotEmpty) 'vehicleColor': _color.text.trim(),
        if (_vehicleUrl != null) 'vehiclePhotoUrl': _vehicleUrl,
        'zoneId': _zoneId,
      });
      await controller.refresh();
      if (mounted && Navigator.of(context).canPop()) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) showSnack(context, errorMessage(e), error: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  String? _required(String? v) => (v ?? '').trim().length < 2 ? 'Required' : null;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const BrandAppBarTitle(title: 'Become a rider'),
        actions: [
          if (widget.existing == null)
            TextButton(onPressed: () => context.read<AuthController>().logout(), child: const Text('Sign out')),
        ],
      ),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Text(
              'Tell us about you and your vehicle. Our team checks every rider — we’ll let you know here once you’re approved.',
              style: TextStyle(color: DsColors.muted),
            ),
            const SizedBox(height: 16),
            SectionCard(
              title: 'About you',
              child: Column(
                children: [
                  Row(
                    children: [
                      UserAvatar(url: _photoUrl, name: _name.text.isEmpty ? null : _name.text, size: 72),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Your photo', style: TextStyle(fontWeight: FontWeight.w600)),
                            const Text(
                              'A clear photo of your face. Customers see it so they know who is at the door.',
                              style: TextStyle(color: DsColors.muted, fontSize: 13),
                            ),
                            const SizedBox(height: 6),
                            OutlinedButton.icon(
                              onPressed: _photoUploading ? null : _pickPhoto,
                              icon: _photoUploading
                                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                                  : const Icon(Icons.photo_camera_outlined),
                              label: Text(_photoUrl == null ? 'Add photo' : 'Change photo'),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  TextFormField(controller: _name, textCapitalization: TextCapitalization.words, validator: _required, decoration: const InputDecoration(labelText: 'Full name (as on ID)')),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _nationalId,
                    textCapitalization: TextCapitalization.characters,
                    validator: (v) => RegExp(r'^[0-9]{2}[- ]?[0-9]{6,7}[- ]?[A-Za-z][- ]?[0-9]{2}$').hasMatch((v ?? '').trim())
                        ? null
                        : 'e.g. 63-1234567 A 12',
                    decoration: const InputDecoration(labelText: 'National ID number', hintText: '63-1234567 A 12'),
                  ),
                  const SizedBox(height: 12),
                  DocumentTile(label: 'Photo of your national ID', url: _idUrl, onUploaded: (u) => setState(() => _idUrl = u)),
                ],
              ),
            ),
            const SizedBox(height: 12),
            SectionCard(
              title: "Driver's licence",
              child: Column(
                children: [
                  TextFormField(controller: _licence, textCapitalization: TextCapitalization.characters, validator: _required, decoration: const InputDecoration(labelText: 'Licence number')),
                  const SizedBox(height: 12),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.event_outlined),
                    title: Text(_licenceExpiry == null ? 'Licence expiry date (optional)' : 'Expires ${formatDate(_licenceExpiry)}'),
                    onTap: () async {
                      final now = DateTime.now();
                      final picked = await showDatePicker(context: context, firstDate: now, lastDate: DateTime(now.year + 15), initialDate: now.add(const Duration(days: 365)));
                      if (picked != null) setState(() => _licenceExpiry = picked);
                    },
                  ),
                  DocumentTile(label: 'Photo of your licence', url: _licenceUrl, onUploaded: (u) => setState(() => _licenceUrl = u)),
                ],
              ),
            ),
            const SizedBox(height: 12),
            SectionCard(
              title: 'Vehicle',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: 8,
                    children: [
                      for (final (code, label, icon) in const [
                        ('MOTORBIKE', 'Motorbike', Icons.two_wheeler_rounded),
                        ('BICYCLE', 'Bicycle', Icons.pedal_bike_rounded),
                        ('CAR', 'Car', Icons.directions_car_rounded),
                      ])
                        ChoiceChip(avatar: Icon(icon, size: 18), label: Text(label), selected: _vehicleType == code, onSelected: (_) => setState(() => _vehicleType = code)),
                    ],
                  ),
                  if (_vehicleType != 'BICYCLE') ...[
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _plate,
                      textCapitalization: TextCapitalization.characters,
                      validator: (v) => normalizeZwPlate(v ?? '') == null ? 'Enter the plate as shown on your bike, e.g. AEZ 1234' : null,
                      decoration: const InputDecoration(
                        labelText: 'Number plate',
                        hintText: 'AEZ 1234',
                        helperText: 'Zimbabwean plate: three letters and four numbers',
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),
                  Row(children: [
                    Expanded(child: TextFormField(controller: _make, decoration: const InputDecoration(labelText: 'Make', hintText: 'Honda'))),
                    const SizedBox(width: 12),
                    Expanded(child: TextFormField(controller: _model, decoration: const InputDecoration(labelText: 'Model', hintText: 'Ace 125'))),
                  ]),
                  const SizedBox(height: 12),
                  TextFormField(controller: _color, decoration: const InputDecoration(labelText: 'Colour')),
                  const SizedBox(height: 12),
                  DocumentTile(label: 'Photo of your vehicle (optional)', url: _vehicleUrl, onUploaded: (u) => setState(() => _vehicleUrl = u)),
                ],
              ),
            ),
            const SizedBox(height: 12),
            SectionCard(
              title: 'Where you deliver',
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.map_outlined, color: DsColors.orange),
                title: Text(_zoneName ?? 'Any zone', style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text(_zoneName == null ? 'Deliveries anywhere near you (you can choose a zone later)' : 'Orders that start or end in $_zoneName'),
                trailing: const Text('Change', style: TextStyle(color: DsColors.orange, fontWeight: FontWeight.w700)),
                onTap: () async {
                  final choice = await pickDeliveryZone(context, load: context.read<RiderController>().zones, currentId: _zoneId);
                  if (choice != null) {
                    setState(() {
                      _zoneId = choice.id;
                      _zoneName = choice.name;
                    });
                  }
                },
              ),
            ),
            const SizedBox(height: 20),
            PrimaryButton(label: 'Submit for approval', loading: _submitting, onPressed: _submit),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}
