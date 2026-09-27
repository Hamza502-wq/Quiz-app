import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../api/api_exception.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../widgets/brand.dart';
import '../widgets/feedback.dart';
import 'auth_controller.dart';

/// Phone number + SMS code sign-in, shared by the customer and rider apps.
/// On success the [AuthController] switches to signed-in and the app's
/// auth gate shows the home screen.
class PhoneLoginScreen extends StatefulWidget {
  const PhoneLoginScreen({super.key, required this.title, required this.subtitle, this.askName = true});

  final String title;
  final String subtitle;

  /// Ask for the user's name alongside the code (used for new accounts).
  final bool askName;

  @override
  State<PhoneLoginScreen> createState() => _PhoneLoginScreenState();
}

class _PhoneLoginScreenState extends State<PhoneLoginScreen> {
  final _phone = TextEditingController();
  final _code = TextEditingController();
  final _name = TextEditingController();
  bool _codeSent = false;
  bool _busy = false;
  String? _error;
  String? _devCode;
  int _resendIn = 0;
  Timer? _timer;

  @override
  void dispose() {
    _timer?.cancel();
    _phone.dispose();
    _code.dispose();
    _name.dispose();
    super.dispose();
  }

  void _startCountdown() {
    _timer?.cancel();
    setState(() => _resendIn = 30);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return t.cancel();
      setState(() => _resendIn = _resendIn > 0 ? _resendIn - 1 : 0);
      if (_resendIn == 0) t.cancel();
    });
  }

  Future<void> _sendCode() async {
    if (!looksLikePhone(_phone.text)) {
      setState(() => _error = 'Enter a valid phone number, e.g. 0771 234 567');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final res = await context.read<AuthController>().requestOtp(_phone.text.trim());
      if (!mounted) return;
      setState(() {
        _codeSent = true;
        _devCode = res.devCode;
      });
      _startCountdown();
    } catch (e) {
      setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    if (_code.text.trim().length < 4) {
      setState(() => _error = 'Enter the code from the SMS');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.read<AuthController>().verifyOtp(_phone.text.trim(), _code.text.trim(), name: _name.text.trim());
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      backgroundColor: DsColors.white,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Center(child: BrandLogo(height: 150)),
                  const SizedBox(height: 16),
                  Text(widget.title, textAlign: TextAlign.center, style: theme.textTheme.headlineSmall),
                  const SizedBox(height: 6),
                  Text(widget.subtitle, textAlign: TextAlign.center, style: const TextStyle(color: DsColors.muted)),
                  const SizedBox(height: 12),
                  const Center(child: FlagStripe()),
                  const SizedBox(height: 28),
                  TextField(
                    controller: _phone,
                    enabled: !_codeSent && !_busy,
                    keyboardType: TextInputType.phone,
                    autofillHints: const [AutofillHints.telephoneNumber],
                    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9+ ]'))],
                    decoration: const InputDecoration(
                      labelText: 'Phone number',
                      hintText: '0771 234 567',
                      prefixIcon: Icon(Icons.phone_iphone_rounded),
                    ),
                    onSubmitted: (_) => _codeSent ? null : _sendCode(),
                  ),
                  if (_codeSent) ...[
                    const SizedBox(height: 16),
                    TextField(
                      controller: _code,
                      autofocus: true,
                      keyboardType: TextInputType.number,
                      autofillHints: const [AutofillHints.oneTimeCode],
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(8)],
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 24, letterSpacing: 10, fontWeight: FontWeight.w700),
                      decoration: InputDecoration(
                        labelText: 'SMS code',
                        helperText: _devCode != null ? 'Development code: $_devCode' : 'Sent to ${_phone.text}. Expires in 5 minutes.',
                      ),
                    ),
                    if (widget.askName) ...[
                      const SizedBox(height: 16),
                      TextField(
                        controller: _name,
                        textCapitalization: TextCapitalization.words,
                        decoration: const InputDecoration(
                          labelText: 'Your name (new accounts)',
                          prefixIcon: Icon(Icons.person_outline_rounded),
                        ),
                      ),
                    ],
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(color: DsColors.redLight, borderRadius: BorderRadius.circular(12)),
                      child: Text(_error!, style: const TextStyle(color: DsColors.red)),
                    ),
                  ],
                  const SizedBox(height: 24),
                  PrimaryButton(
                    label: _codeSent ? 'Verify & continue' : 'Send code',
                    loading: _busy,
                    onPressed: _codeSent ? _verify : _sendCode,
                  ),
                  if (_codeSent) ...[
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        TextButton(
                          onPressed: _busy
                              ? null
                              : () => setState(() {
                                    _codeSent = false;
                                    _code.clear();
                                    _devCode = null;
                                    _error = null;
                                  }),
                          child: const Text('Change number'),
                        ),
                        TextButton(
                          onPressed: _resendIn > 0 || _busy ? null : _sendCode,
                          child: Text(_resendIn > 0 ? 'Resend in ${_resendIn}s' : 'Resend code'),
                        ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 24),
                  const Text(
                    'By continuing you agree to the DoorStep Terms and Privacy Policy. Standard SMS rates may apply.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: DsColors.muted, fontSize: 12),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
