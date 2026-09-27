import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../state/rider_controller.dart';
import 'document_picker.dart';

/// Proof of delivery: the customer's 4-digit PIN, or a photo.
class ProofScreen extends StatefulWidget {
  const ProofScreen({super.key, required this.order});
  final Order order;

  @override
  State<ProofScreen> createState() => _ProofScreenState();
}

class _ProofScreenState extends State<ProofScreen> {
  String _mode = 'PIN';
  final _pin = TextEditingController();
  String? _photoUrl;
  bool _busy = false;
  bool _uploading = false;

  @override
  void dispose() {
    _pin.dispose();
    super.dispose();
  }

  Future<void> _takePhoto() async {
    setState(() => _uploading = true);
    try {
      final url = await pickAndUpload(context, kind: 'proof', cameraOnly: true);
      if (url != null && mounted) setState(() => _photoUrl = url);
    } catch (e) {
      if (mounted) showSnack(context, errorMessage(e), error: true);
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _complete() async {
    if (_mode == 'PIN' && _pin.text.length != 4) {
      showSnack(context, 'Enter the 4-digit PIN from the customer', error: true);
      return;
    }
    if (_mode == 'PHOTO' && _photoUrl == null) {
      showSnack(context, 'Take a photo of the delivered order', error: true);
      return;
    }
    setState(() => _busy = true);
    final navigator = Navigator.of(context);
    try {
      await context.read<RiderController>().orderAction(
            widget.order.id,
            'deliver',
            body: _mode == 'PIN' ? {'proofType': 'PIN', 'pin': _pin.text} : {'proofType': 'PHOTO', 'photoUrl': _photoUrl},
          );
      if (!mounted) return;
      showSnack(context, 'Delivered! Great job 🎉');
      navigator.pop(true);
    } catch (e) {
      if (mounted) showSnack(context, errorMessage(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = widget.order;
    return Scaffold(
      appBar: AppBar(title: const Text('Proof of delivery')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          if (o.paymentMethod == 'CASH')
            Container(
              padding: const EdgeInsets.all(14),
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(color: DsColors.redLight, borderRadius: BorderRadius.circular(14)),
              child: Text('Collect ${formatMoney(o.amounts.totalLocalCents, o.amounts.currency)} in cash before completing.',
                  style: const TextStyle(color: DsColors.red, fontWeight: FontWeight.w700)),
            ),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'PIN', label: Text('Customer PIN'), icon: Icon(Icons.pin_outlined)),
              ButtonSegment(value: 'PHOTO', label: Text('Photo'), icon: Icon(Icons.photo_camera_outlined)),
            ],
            selected: {_mode},
            onSelectionChanged: (s) => setState(() => _mode = s.first),
          ),
          const SizedBox(height: 24),
          if (_mode == 'PIN') ...[
            const Text('Ask the customer for the 4-digit PIN shown in their DoorStep app.', textAlign: TextAlign.center),
            const SizedBox(height: 16),
            TextField(
              controller: _pin,
              autofocus: true,
              keyboardType: TextInputType.number,
              textAlign: TextAlign.center,
              maxLength: 4,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              style: const TextStyle(fontSize: 36, letterSpacing: 18, fontWeight: FontWeight.w800),
              decoration: const InputDecoration(counterText: '', hintText: '••••'),
            ),
          ] else ...[
            const Text('Take a clear photo of the order at the door (use this if the customer isn’t available).', textAlign: TextAlign.center),
            const SizedBox(height: 16),
            AspectRatio(
              aspectRatio: 4 / 3,
              child: InkWell(
                onTap: _uploading ? null : _takePhoto,
                borderRadius: BorderRadius.circular(18),
                child: Container(
                  decoration: BoxDecoration(color: DsColors.canvas, borderRadius: BorderRadius.circular(18), border: Border.all(color: DsColors.line)),
                  child: _uploading
                      ? const LoadingView(message: 'Uploading photo…')
                      : _photoUrl != null
                          ? ClipRRect(
                              borderRadius: BorderRadius.circular(18),
                              child: Image.network(_photoUrl!, fit: BoxFit.cover, headers: context.read<ApiClient>().authHeaders),
                            )
                          : const Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [Icon(Icons.photo_camera_rounded, size: 48, color: DsColors.orange), SizedBox(height: 8), Text('Tap to take photo')],
                            ),
                ),
              ),
            ),
          ],
          const SizedBox(height: 28),
          PrimaryButton(label: 'Complete delivery', loading: _busy, onPressed: _complete),
        ],
      ),
    );
  }
}
