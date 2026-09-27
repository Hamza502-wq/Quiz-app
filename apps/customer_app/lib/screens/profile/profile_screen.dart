import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../address/address_list_screen.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final settings = context.watch<AppSettings>();
    final profile = auth.profile;

    Future<void> update(Map<String, dynamic> patch, String message) =>
        runWithFeedback(context, () => auth.updateProfile(patch), success: message);

    return Scaffold(
      appBar: AppBar(title: const Text('Account')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          SectionCard(
            child: Row(
              children: [
                const CircleAvatar(radius: 28, backgroundColor: DsColors.orangeLight, child: Icon(Icons.person_rounded, color: DsColors.orange, size: 30)),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(profile?.name ?? 'DoorStep customer', style: Theme.of(context).textTheme.titleLarge),
                      Text(profile?.phone ?? '', style: const TextStyle(color: DsColors.muted)),
                      if (profile?.email != null) Text(profile!.email!, style: const TextStyle(color: DsColors.muted)),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.edit_outlined),
                  tooltip: 'Edit profile',
                  onPressed: () => showDialog<void>(context: context, builder: (_) => _EditProfileDialog(profile: profile)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.location_on_outlined),
                  title: const Text('My addresses'),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const AddressListScreen())),
                ),
                const Divider(),
                ListTile(
                  leading: const Icon(Icons.currency_exchange_rounded),
                  title: const Text('Show prices in'),
                  trailing: SegmentedButton<String>(
                    segments: const [ButtonSegment(value: 'USD', label: Text('USD')), ButtonSegment(value: 'ZWG', label: Text('ZiG'))],
                    selected: {profile?.preferredCurrency ?? 'USD'},
                    showSelectedIcon: false,
                    onSelectionChanged: (s) => update({'preferredCurrency': s.first}, 'Currency updated'),
                  ),
                ),
                const Divider(),
                ListTile(
                  leading: const Icon(Icons.sms_outlined),
                  title: const Text('Important updates by'),
                  subtitle: const Text('Used when push notifications can’t reach you'),
                  trailing: DropdownButton<String>(
                    value: profile?.notificationChannel == 'WHATSAPP' ? 'WHATSAPP' : 'SMS',
                    underline: const SizedBox.shrink(),
                    items: const [DropdownMenuItem(value: 'SMS', child: Text('SMS')), DropdownMenuItem(value: 'WHATSAPP', child: Text('WhatsApp'))],
                    onChanged: (v) => v == null ? null : update({'notificationChannel': v}, 'Preference saved'),
                  ),
                ),
                const Divider(),
                SwitchListTile(
                  secondary: const Icon(Icons.data_saver_on_rounded),
                  title: const Text('Low-data mode'),
                  subtitle: const Text('Smaller images, lighter maps, less background data'),
                  value: settings.lowDataMode,
                  onChanged: settings.setLowDataMode,
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.notifications_none_rounded),
                  title: const Text('Notifications'),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const NotificationsScreen())),
                ),
                const Divider(),
                ListTile(
                  leading: const Icon(Icons.support_agent_rounded),
                  title: const Text('Help & support'),
                  subtitle: const Text('Report a problem from any order, or WhatsApp us'),
                  onTap: () => showSnack(context, 'Open an order and tap "Report a problem" for fastest help.'),
                ),
                const Divider(),
                ListTile(
                  leading: const Icon(Icons.logout_rounded, color: DsColors.red),
                  title: const Text('Sign out', style: TextStyle(color: DsColors.red)),
                  onTap: () async {
                    final ok = await showDialog<bool>(
                      context: context,
                      builder: (_) => AlertDialog(
                        title: const Text('Sign out?'),
                        actions: [
                          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Stay')),
                          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Sign out')),
                        ],
                      ),
                    );
                    if (ok == true) await auth.logout();
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          const Center(child: FlagStripe(width: 48)),
          const SizedBox(height: 8),
          const Center(child: Text('DoorStep Zimbabwe · v1.0.0', style: TextStyle(color: DsColors.muted, fontSize: 12))),
        ],
      ),
    );
  }
}

class _EditProfileDialog extends StatefulWidget {
  const _EditProfileDialog({required this.profile});
  final Profile? profile;

  @override
  State<_EditProfileDialog> createState() => _EditProfileDialogState();
}

class _EditProfileDialogState extends State<_EditProfileDialog> {
  late final _name = TextEditingController(text: widget.profile?.name);
  late final _email = TextEditingController(text: widget.profile?.email);
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Edit profile'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Name')),
          const SizedBox(height: 12),
          TextField(controller: _email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email (for receipts)')),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        TextButton(
          onPressed: _saving
              ? null
              : () async {
                  setState(() => _saving = true);
                  final ok = await runWithFeedback(
                    context,
                    () => context.read<AuthController>().updateProfile({
                      'name': _name.text.trim(),
                      'email': _email.text.trim().isEmpty ? null : _email.text.trim(),
                    }),
                    success: 'Profile updated',
                  );
                  if (!context.mounted) return;
                  setState(() => _saving = false);
                  if (ok != null) Navigator.pop(context);
                },
          child: const Text('Save'),
        ),
      ],
    );
  }
}
