import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/rider_controller.dart';
import 'payouts_screen.dart';

class RiderProfileScreen extends StatelessWidget {
  const RiderProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<RiderController>();
    final settings = context.watch<AppSettings>();
    final auth = context.read<AuthController>();
    final r = controller.rider;

    return Scaffold(
      appBar: AppBar(title: const Text('Account')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          SectionCard(
            child: ProfilePhotoHeader(
              subtitle: r == null ? null : '★ ${r.ratingAvg.toStringAsFixed(1)} · ${r.ratingCount} ratings${r.zoneName != null ? ' · ${r.zoneName}' : ''}',
            ),
          ),
          const SizedBox(height: 12),
          if (r != null)
            SectionCard(
              title: 'Vehicle',
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      [vehicleLabel(r.vehicleType), [r.vehicleColor, r.vehicleMake, r.vehicleModel].whereType<String>().join(' ')]
                          .where((s) => s.isNotEmpty)
                          .join(' · '),
                    ),
                  ),
                  if (r.vehiclePlate != null) PlateChip(plate: r.vehiclePlate!),
                ],
              ),
            ),
          const SizedBox(height: 12),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.account_balance_outlined),
                  title: const Text('Payout details & history'),
                  subtitle: Text(r?.payoutMethod != null ? '${paymentLabel(r!.payoutMethod!)} · ${r.payoutAccount}' : 'Not set'),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const PayoutsScreen())),
                ),
                const Divider(),
                SwitchListTile(
                  secondary: const Icon(Icons.data_saver_on_rounded),
                  title: const Text('Low-data mode'),
                  subtitle: const Text('Lite maps and fewer location updates'),
                  value: settings.lowDataMode,
                  onChanged: settings.setLowDataMode,
                ),
                const Divider(),
                ListTile(
                  leading: const Icon(Icons.sms_outlined),
                  title: const Text('Backup notifications by'),
                  trailing: DropdownButton<String>(
                    value: auth.profile?.notificationChannel == 'WHATSAPP' ? 'WHATSAPP' : 'SMS',
                    underline: const SizedBox.shrink(),
                    items: const [DropdownMenuItem(value: 'SMS', child: Text('SMS')), DropdownMenuItem(value: 'WHATSAPP', child: Text('WhatsApp'))],
                    onChanged: (v) => v == null ? null : runWithFeedback(context, () => auth.updateProfile({'notificationChannel': v}), success: 'Saved'),
                  ),
                ),
                const Divider(),
                const ChangePasswordTile(),
                const Divider(),
                ListTile(
                  leading: const Icon(Icons.logout_rounded, color: DsColors.red),
                  title: const Text('Sign out', style: TextStyle(color: DsColors.red)),
                  onTap: () async {
                    if (controller.activeOrder != null) {
                      showSnack(context, 'Finish your current delivery before signing out.', error: true);
                      return;
                    }
                    await auth.logout();
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          const Center(child: FlagStripe(width: 48)),
          const SizedBox(height: 8),
          const Center(child: Text('DoorStep Rider · v1.0.0', style: TextStyle(color: DsColors.muted, fontSize: 12))),
          const SizedBox(height: 4),
          const MadeBy(),
        ],
      ),
    );
  }
}
