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
