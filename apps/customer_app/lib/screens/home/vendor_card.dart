import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';

class VendorCard extends StatelessWidget {
  const VendorCard({super.key, required this.vendor, required this.onTap});
  final Vendor vendor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final v = vendor;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Stack(
              children: [
                LowDataImage(
                  url: v.coverUrl ?? v.logoUrl,
                  height: 130,
                  width: double.infinity,
                  borderRadius: 0,
                  placeholderIcon: v.categorySlug == 'pharmacy'
                      ? Icons.local_pharmacy_rounded
                      : v.categorySlug == 'groceries'
                          ? Icons.local_grocery_store_rounded
                          : Icons.restaurant_rounded,
                ),
                Positioned(
                  left: 12,
                  top: 12,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(color: v.isOpen ? DsColors.green : DsColors.black, borderRadius: BorderRadius.circular(20)),
                    child: Text(v.isOpen ? 'Open' : 'Closed', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12)),
                  ),
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(child: Text(v.name, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700))),
                      if (v.ratingCount > 0) ...[
                        const Icon(Icons.star_rounded, color: DsColors.orange, size: 18),
                        Text(' ${v.ratingAvg.toStringAsFixed(1)} (${v.ratingCount})', style: const TextStyle(fontWeight: FontWeight.w600)),
                      ],
                    ],
                  ),
                  if (v.description != null)
                    Text(v.description!, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: DsColors.muted)),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 12,
                    runSpacing: 4,
                    children: [
                      _Meta(icon: Icons.schedule_rounded, text: v.etaMinutes != null ? '${v.etaMinutes} min' : '~${v.avgPrepMinutes} min prep'),
                      if (v.deliveryFeeCents != null) _Meta(icon: Icons.delivery_dining_rounded, text: formatMoney(v.deliveryFeeCents!)),
                      if (v.distanceKm != null) _Meta(icon: Icons.near_me_rounded, text: '${v.distanceKm!.toStringAsFixed(1)} km'),
                      if (v.minOrderCents > 0) _Meta(icon: Icons.shopping_basket_outlined, text: 'Min ${formatMoney(v.minOrderCents)}'),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Meta extends StatelessWidget {
  const _Meta({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: DsColors.inkSoft),
        const SizedBox(width: 4),
        Text(text, style: const TextStyle(fontSize: 13, color: DsColors.inkSoft, fontWeight: FontWeight.w500)),
      ],
    );
  }
}
