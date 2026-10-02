import 'package:flutter/material.dart';

import '../theme.dart';

/// The full DoorStep Zimbabwe logo.
class BrandLogo extends StatelessWidget {
  const BrandLogo({super.key, this.height = 120});
  final double height;

  @override
  Widget build(BuildContext context) =>
      Image.asset('assets/brand/logo.png', package: 'doorstep_core', height: height, semanticLabel: 'DoorStep Zimbabwe');
}

/// The house-and-door icon.
class BrandIcon extends StatelessWidget {
  const BrandIcon({super.key, this.size = 36});
  final double size;

  @override
  Widget build(BuildContext context) =>
      Image.asset('assets/brand/icon.png', package: 'doorstep_core', width: size, height: size, excludeFromSemantics: true);
}

/// Zimbabwe flag stripes — a small accent only.
class FlagStripe extends StatelessWidget {
  const FlagStripe({super.key, this.width = 64});
  final double width;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(2),
      child: SizedBox(
        width: width,
        height: 4.5,
        child: const Column(
          children: [
            Expanded(child: ColoredBox(color: DsColors.flagGreen, child: SizedBox.expand())),
            Expanded(child: ColoredBox(color: DsColors.flagYellow, child: SizedBox.expand())),
            Expanded(child: ColoredBox(color: DsColors.flagRed, child: SizedBox.expand())),
          ],
        ),
      ),
    );
  }
}

/// AppBar title with the house icon.
class BrandAppBarTitle extends StatelessWidget {
  const BrandAppBarTitle({super.key, required this.title});
  final String title;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const BrandIcon(size: 30),
        const SizedBox(width: 8),
        Flexible(child: Text(title, overflow: TextOverflow.ellipsis)),
      ],
    );
  }
}

/// Developer credit, shown on the opening screen, sign-in and profile screens.
const kMadeBy = 'Hamza Protech Solutions';

class MadeBy extends StatelessWidget {
  const MadeBy({super.key});

  @override
  Widget build(BuildContext context) => const Text(
        'Made by $kMadeBy',
        textAlign: TextAlign.center,
        style: TextStyle(color: DsColors.muted, fontSize: 12),
      );
}

/// Icon for a shop category slug (food, groceries, electronics, fashion, …).
IconData categoryIcon(String? slug) => switch (slug) {
      'food' => Icons.restaurant_rounded,
      'groceries' => Icons.local_grocery_store_rounded,
      'pharmacy' => Icons.local_pharmacy_rounded,
      'parcels' => Icons.inventory_2_rounded,
      'electronics' => Icons.devices_rounded,
      'fashion' => Icons.checkroom_rounded,
      'beauty' => Icons.spa_rounded,
      'hardware' => Icons.hardware_rounded,
      'home' => Icons.chair_rounded,
      'books' => Icons.menu_book_rounded,
      'gifts' => Icons.local_florist_rounded,
      'farm' => Icons.yard_rounded,
      _ => Icons.storefront_rounded,
    };
