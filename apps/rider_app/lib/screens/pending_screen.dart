import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/rider_controller.dart';
import 'registration_screen.dart';

class PendingScreen extends StatelessWidget {
  const PendingScreen({super.key, required this.rider, this.canResubmit = false});
  final RiderProfile rider;
  final bool canResubmit;

  @override
  Widget build(BuildContext context) {
    final rejected = rider.status == 'REJECTED';
    final suspended = rider.status == 'SUSPENDED';
    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: context.read<RiderController>().refresh,
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              const SizedBox(height: 40),
              const Center(child: BrandLogo(height: 140)),
              const SizedBox(height: 24),
              Icon(
                rejected || suspended ? Icons.error_outline_rounded : Icons.hourglass_top_rounded,
                size: 56,
                color: rejected || suspended ? DsColors.red : DsColors.orange,
              ),
              const SizedBox(height: 12),
              Text(
                rejected ? 'Application not approved' : suspended ? 'Account suspended' : 'Thanks, ${rider.name ?? 'rider'}!',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 8),
              Text(
                rejected
                    ? (rider.rejectionReason ?? 'Your documents could not be verified.')
                    : suspended
                        ? 'Please contact DoorStep support to resolve this.'
                        : 'We are reviewing your documents. You’ll get an SMS as soon as you’re approved — usually within 24 hours.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: DsColors.muted),
              ),
              const SizedBox(height: 28),
              if (canResubmit)
                PrimaryButton(
                  label: 'Update details & resubmit',
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => RegistrationScreen(existing: rider))),
                )
              else
                OutlinedButton.icon(
                  onPressed: () => runWithFeedback(context, context.read<RiderController>().refresh),
                  icon: const Icon(Icons.refresh_rounded),
                  label: const Text('Check status'),
                ),
              const SizedBox(height: 8),
              TextButton(onPressed: () => context.read<AuthController>().logout(), child: const Text('Sign out')),
            ],
          ),
        ),
      ),
    );
  }
}
