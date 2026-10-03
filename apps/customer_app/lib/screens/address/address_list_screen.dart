import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/address_controller.dart';
import 'address_form_screen.dart';

class AddressListScreen extends StatelessWidget {
  const AddressListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<AddressController>();
    return Scaffold(
      appBar: AppBar(title: const Text('My addresses')),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: DsColors.orange,
        foregroundColor: Colors.white,
        onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const AddressFormScreen())),
        icon: const Icon(Icons.add_location_alt_outlined),
        label: const Text('Add address'),
      ),
      body: RefreshIndicator(
        onRefresh: controller.load,
        child: controller.loading && controller.addresses.isEmpty
            ? const LoadingView()
            : controller.error != null && controller.addresses.isEmpty
                ? ErrorView(error: controller.error!, onRetry: controller.load)
                : controller.addresses.isEmpty
                    ? ListView(children: const [
                        SizedBox(height: 120),
                        EmptyView(icon: Icons.location_off_outlined, title: 'No saved addresses', message: 'Add where you want deliveries to go.'),
                      ])
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                        itemCount: controller.addresses.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 10),
                        itemBuilder: (context, i) {
                          final a = controller.addresses[i];
                          return Card(
                            child: ListTile(
                              title: Row(children: [
                                Text(a.label, style: const TextStyle(fontWeight: FontWeight.w700)),
                                if (a.isDefault) ...[
                                  const SizedBox(width: 8),
                                  const Chip(label: Text('Default'), visualDensity: VisualDensity.compact),
                                ],
                              ]),
                              subtitle: Text('${a.landmark}\n${a.summary}'),
                              isThreeLine: true,
                              trailing: PopupMenuButton<String>(
                                onSelected: (action) async {
                                  if (action == 'edit') {
                                    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => AddressFormScreen(address: a)));
                                  } else if (action == 'default') {
                                    await runWithFeedback(context, () => controller.save(id: a.id, body: {'makeDefault': true}), success: 'Default address updated');
                                  } else if (action == 'delete') {
                                    await runWithFeedback(context, () => controller.remove(a.id), success: 'Address deleted');
                                  }
                                },
                                itemBuilder: (_) => [
                                  const PopupMenuItem(value: 'edit', child: Text('Edit')),
                                  if (!a.isDefault) const PopupMenuItem(value: 'default', child: Text('Make default')),
                                  const PopupMenuItem(value: 'delete', child: Text('Delete')),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
      ),
    );
  }
}
