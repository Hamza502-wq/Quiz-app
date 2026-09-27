import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

/// Asks new customers for their name (shown to stores and riders).
class ProfileSetupScreen extends StatefulWidget {
  const ProfileSetupScreen({super.key});

  @override
  State<ProfileSetupScreen> createState() => _ProfileSetupScreenState();
}

class _ProfileSetupScreenState extends State<ProfileSetupScreen> {
  final _name = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_name.text.trim().length < 2) {
      showSnack(context, 'Enter your name', error: true);
      return;
    }
    setState(() => _saving = true);
    await runWithFeedback(context, () => context.read<AuthController>().updateProfile({'name': _name.text.trim()}));
    if (mounted) setState(() => _saving = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 32),
              const Center(child: BrandIcon(size: 80)),
              const SizedBox(height: 16),
              Text('What should we call you?', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 6),
              const Text('Your rider and the store will see your first name.', textAlign: TextAlign.center, style: TextStyle(color: DsColors.muted)),
              const SizedBox(height: 24),
              TextField(
                controller: _name,
                autofocus: true,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Full name'),
                onSubmitted: (_) => _save(),
              ),
              const Spacer(),
              PrimaryButton(label: 'Continue', loading: _saving, onPressed: _save),
              TextButton(onPressed: () => context.read<AuthController>().logout(), child: const Text('Use a different number')),
            ],
          ),
        ),
      ),
    );
  }
}
