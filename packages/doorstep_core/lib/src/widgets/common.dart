import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../settings/app_settings.dart';
import '../theme.dart';

/// Order status pill.
class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.status, this.label});
  final OrderStatus status;
  final String? label;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (status) {
      OrderStatus.pendingPayment => (const Color(0xFFFDF4E3), const Color(0xFFB7791F)),
      OrderStatus.placed => (DsColors.orangeLight, DsColors.orangeDark),
      OrderStatus.accepted || OrderStatus.pickedUp || OrderStatus.onTheWay => (const Color(0xFFEAF2FF), const Color(0xFF1D4ED8)),
      OrderStatus.readyForPickup => (DsColors.black, DsColors.white),
      OrderStatus.delivered => (DsColors.greenLight, DsColors.green),
      OrderStatus.rejected => (DsColors.redLight, DsColors.red),
      OrderStatus.cancelled => (const Color(0xFFF1F1F1), DsColors.inkSoft),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
      child: Text(label ?? status.label, style: TextStyle(color: fg, fontWeight: FontWeight.w700, fontSize: 12)),
    );
  }
}

/// Network image that loads the small thumbnail in low-data mode.
class LowDataImage extends StatelessWidget {
  const LowDataImage({super.key, required this.url, this.thumbUrl, this.width, this.height, this.fit = BoxFit.cover, this.placeholderIcon = Icons.restaurant_rounded, this.borderRadius = 14});

  final String? url;
  final String? thumbUrl;
  final double? width;
  final double? height;
  final BoxFit fit;
  final IconData placeholderIcon;
  final double borderRadius;

  @override
  Widget build(BuildContext context) {
    final lowData = context.watch<AppSettings>().lowDataMode;
    final src = lowData ? (thumbUrl ?? url) : (url ?? thumbUrl);
    final placeholder = Container(
      width: width,
      height: height,
      color: DsColors.orangeLight,
      alignment: Alignment.center,
      child: Icon(placeholderIcon, color: DsColors.orange, size: 28),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(borderRadius),
      child: src == null
          ? placeholder
          : CachedNetworkImage(
              imageUrl: src,
              width: width,
              height: height,
              fit: fit,
              memCacheWidth: lowData ? 360 : null,
              placeholder: (_, _) => placeholder,
              errorWidget: (_, _, _) => placeholder,
            ),
    );
  }
}

class SectionCard extends StatelessWidget {
  const SectionCard({super.key, required this.child, this.title, this.padding = const EdgeInsets.all(16), this.trailing});
  final Widget child;
  final String? title;
  final Widget? trailing;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: padding,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (title != null) ...[
              Row(
                children: [
                  Expanded(child: Text(title!, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700))),
                  ?trailing,
                ],
              ),
              const SizedBox(height: 12),
            ],
            child,
          ],
        ),
      ),
    );
  }
}

class KeyValueRow extends StatelessWidget {
  const KeyValueRow({super.key, required this.label, required this.value, this.bold = false, this.valueColor});
  final String label;
  final String value;
  final bool bold;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    final style = TextStyle(fontWeight: bold ? FontWeight.w700 : FontWeight.w500, fontSize: bold ? 16 : 14);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(child: Text(label, style: style.copyWith(color: bold ? DsColors.black : DsColors.inkSoft))),
          Text(value, style: style.copyWith(color: valueColor)),
        ],
      ),
    );
  }
}

/// Small banner shown while offline / reconnecting.
class OfflineBanner extends StatelessWidget {
  const OfflineBanner({super.key, required this.visible, this.message = 'Reconnecting… live updates paused'});
  final bool visible;
  final String message;

  @override
  Widget build(BuildContext context) {
    return AnimatedSize(
      duration: const Duration(milliseconds: 200),
      child: visible
          ? Container(
              width: double.infinity,
              color: const Color(0xFFFDF4E3),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              child: Row(
                children: [
                  const Icon(Icons.cloud_off_rounded, size: 16, color: Color(0xFFB7791F)),
                  const SizedBox(width: 8),
                  Expanded(child: Text(message, style: const TextStyle(fontSize: 12, color: Color(0xFF8A5A12)))),
                ],
              ),
            )
          : const SizedBox.shrink(),
    );
  }
}
