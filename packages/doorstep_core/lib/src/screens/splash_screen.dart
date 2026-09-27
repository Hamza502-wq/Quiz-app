import 'package:flutter/material.dart';

import '../theme.dart';
import '../widgets/brand.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key, this.tagline});
  final String? tagline;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: DsColors.white,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const BrandLogo(height: 200),
            const SizedBox(height: 16),
            if (tagline != null) Text(tagline!, style: const TextStyle(color: DsColors.muted, fontWeight: FontWeight.w500)),
            const SizedBox(height: 28),
            const SizedBox(width: 28, height: 28, child: CircularProgressIndicator(strokeWidth: 3, color: DsColors.orange)),
          ],
        ),
      ),
    );
  }
}
