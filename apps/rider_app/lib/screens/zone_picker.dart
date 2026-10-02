import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';

/// The rider's choice of delivery zone; a null [id] means any zone.
typedef ZoneChoice = ({String? id, String? name});

/// Bottom sheet listing the delivery zones, plus "Any zone". Returns null when dismissed.
Future<ZoneChoice?> pickDeliveryZone(BuildContext context, {required Future<List<DeliveryZone>> Function() load, String? currentId}) {
  return showModalBottomSheet<ZoneChoice>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _ZoneSheet(load: load, currentId: currentId),
  );
}

class _ZoneSheet extends StatefulWidget {
  const _ZoneSheet({required this.load, this.currentId});
  final Future<List<DeliveryZone>> Function() load;
  final String? currentId;

  @override
  State<_ZoneSheet> createState() => _ZoneSheetState();
}

class _ZoneSheetState extends State<_ZoneSheet> {
  late Future<List<DeliveryZone>> _zones = widget.load();

  @override
  Widget build(BuildContext context) {
    Widget option({required String? id, required String title, required String subtitle}) {
      final selected = id == widget.currentId;
      return ListTile(
        leading: Icon(id == null ? Icons.public_rounded : Icons.map_outlined, color: selected ? DsColors.orange : null),
        title: Text(title, style: TextStyle(fontWeight: selected ? FontWeight.w700 : FontWeight.w500)),
        subtitle: Text(subtitle),
        trailing: selected ? const Icon(Icons.check_circle_rounded, color: DsColors.orange) : null,
        selected: selected,
        onTap: () => Navigator.of(context).pop<ZoneChoice>((id: id, name: id == null ? null : title)),
      );
    }

    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.75),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 4),
              child: Text('Where do you deliver?', style: Theme.of(context).textTheme.titleLarge),
            ),
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Text('You get orders that start or end in your zone. Change it any time.', style: TextStyle(color: DsColors.muted)),
            ),
            Flexible(
              child: FutureBuilder<List<DeliveryZone>>(
                future: _zones,
                builder: (context, snapshot) {
                  if (snapshot.hasError) {
                    return ErrorView(error: snapshot.error!, onRetry: () => setState(() => _zones = widget.load()));
                  }
                  if (!snapshot.hasData) return const LoadingView(compact: true);
                  return ListView(
                    shrinkWrap: true,
                    children: [
                      option(id: null, title: 'Any zone', subtitle: 'Deliveries anywhere near you'),
                      for (final z in snapshot.data!) option(id: z.id, title: z.name, subtitle: z.city),
                    ],
                  );
                },
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}
