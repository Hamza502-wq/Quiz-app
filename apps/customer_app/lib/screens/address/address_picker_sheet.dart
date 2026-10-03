import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/address_controller.dart';
import 'address_form_screen.dart';

/// Bottom sheet to choose (or add) the delivery address.
Future<void> showAddressPicker(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (sheetContext) => const _AddressPicker(),
  );
}

class _AddressPicker extends StatelessWidget {
  const _AddressPicker();

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<AddressController>();
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.75),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Text('Where should we deliver?', style: Theme.of(context).textTheme.titleLarge),
            ),
            if (controller.loading && controller.addresses.isEmpty)
              const LoadingView(compact: true)
            else if (controller.error != null && controller.addresses.isEmpty)
              ErrorView(error: controller.error!, onRetry: controller.load)
            else
              Flexible(
                child: ListView(
                  shrinkWrap: true,
                  children: [
                    for (final a in controller.addresses)
                      ListTile(
                        leading: Icon(
                          a.label.toLowerCase() == 'work' ? Icons.work_outline_rounded : Icons.home_outlined,
                          color: controller.selected?.id == a.id ? DsColors.orange : DsColors.inkSoft,
                        ),
                        title: Text(a.label, style: const TextStyle(fontWeight: FontWeight.w700)),
                        subtitle: Text('${a.landmark}\n${a.summary}', maxLines: 2, overflow: TextOverflow.ellipsis),
                        isThreeLine: true,
                        trailing: controller.selected?.id == a.id ? const Icon(Icons.check_circle_rounded, color: DsColors.orange) : null,
                        onTap: () {
                          controller.select(a);
                          Navigator.pop(context);
                        },
                      ),
                  ],
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
              child: OutlinedButton.icon(
                icon: const Icon(Icons.add_location_alt_outlined),
                label: const Text('Add new address'),
                onPressed: () async {
                  Navigator.pop(context);
                  await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const AddressFormScreen()));
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
