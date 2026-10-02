import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../theme.dart';

String _initials(String? name) {
  final parts = (name ?? '').trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  final first = parts.first[0];
  final last = parts.length > 1 ? parts.last[0] : '';
  return (first + last).toUpperCase();
}

/// Round profile photo; shows the person's initials when there is no photo
/// (or it can't be loaded). `square` gives a rounded square, for shop logos.
class UserAvatar extends StatelessWidget {
  const UserAvatar({super.key, required this.url, required this.name, this.size = 44, this.square = false});
  final String? url;
  final String? name;
  final double size;
  final bool square;

  @override
  Widget build(BuildContext context) {
    final fallback = Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      color: DsColors.orangeLight,
      child: Text(
        _initials(name),
        style: TextStyle(color: DsColors.orange, fontWeight: FontWeight.w700, fontSize: size * 0.36),
      ),
    );
    final image = url == null || url!.isEmpty
        ? fallback
        : CachedNetworkImage(
            imageUrl: url!,
            width: size,
            height: size,
            fit: BoxFit.cover,
            placeholder: (_, _) => Container(width: size, height: size, color: DsColors.line),
            errorWidget: (_, _, _) => fallback,
          );
    return Semantics(
      label: name == null ? null : '$name photo',
      image: true,
      child: square
          ? ClipRRect(borderRadius: BorderRadius.circular(size * 0.25), child: image)
          : ClipOval(child: image),
    );
  }
}

/// A vehicle number plate, e.g. "AEZ 1234", styled like the plate on the bike.
class PlateChip extends StatelessWidget {
  const PlateChip({super.key, required this.plate});
  final String plate;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Number plate $plate',
      child: ExcludeSemantics(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
          decoration: BoxDecoration(
            color: DsColors.white,
            border: Border.all(color: DsColors.black, width: 1.6),
            borderRadius: BorderRadius.circular(5),
          ),
          child: Text(
            plate,
            style: const TextStyle(fontWeight: FontWeight.w800, letterSpacing: 1.2, fontSize: 12.5, color: DsColors.black),
          ),
        ),
      ),
    );
  }
}
