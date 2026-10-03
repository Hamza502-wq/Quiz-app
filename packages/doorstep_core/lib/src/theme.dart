import 'package:flutter/material.dart';

/// DoorStep Zimbabwe brand palette.
class DsColors {
  DsColors._();
  static const orange = Color(0xFFFF7A00);
  static const orangeDark = Color(0xFFE56D00);
  static const orangeLight = Color(0xFFFFF1E5);
  static const black = Color(0xFF1A1A1A);
  static const inkSoft = Color(0xFF4A4A4A);
  static const muted = Color(0xFF7A7A7A);
  static const line = Color(0xFFECECEC);
  static const canvas = Color(0xFFF7F7F8);
  static const red = Color(0xFFE01E1E);
  static const redLight = Color(0xFFFDE8E8);
  static const white = Color(0xFFFFFFFF);
  static const green = Color(0xFF1F9D55);
  static const greenLight = Color(0xFFE6F6EC);
  // Zimbabwe flag accents — use sparingly.
  static const flagGreen = Color(0xFF319B42);
  static const flagYellow = Color(0xFFFFD200);
  static const flagRed = Color(0xFFE01E1E);
}

/// Font family bundled in the doorstep_core package.
const String kPoppins = 'packages/doorstep_core/Poppins';

ThemeData buildDoorStepTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: DsColors.orange,
    primary: DsColors.orange,
    onPrimary: DsColors.white,
    secondary: DsColors.black,
    onSecondary: DsColors.white,
    error: DsColors.red,
    onError: DsColors.white,
    surface: DsColors.white,
    onSurface: DsColors.black,
  );

  final base = ThemeData(useMaterial3: true, colorScheme: scheme, fontFamily: kPoppins);
  final text = base.textTheme.apply(bodyColor: DsColors.black, displayColor: DsColors.black, fontFamily: kPoppins);
  final rounded = RoundedRectangleBorder(borderRadius: BorderRadius.circular(14));

  return base.copyWith(
    scaffoldBackgroundColor: DsColors.canvas,
    textTheme: text.copyWith(
      headlineLarge: text.headlineLarge?.copyWith(fontWeight: FontWeight.w800),
      headlineMedium: text.headlineMedium?.copyWith(fontWeight: FontWeight.w800),
      headlineSmall: text.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
      titleLarge: text.titleLarge?.copyWith(fontWeight: FontWeight.w700),
      titleMedium: text.titleMedium?.copyWith(fontWeight: FontWeight.w600),
      labelLarge: text.labelLarge?.copyWith(fontWeight: FontWeight.w600),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: DsColors.white,
      foregroundColor: DsColors.black,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(fontFamily: kPoppins, fontSize: 19, fontWeight: FontWeight.w700, color: DsColors.black),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: DsColors.orange,
        foregroundColor: DsColors.white,
        minimumSize: const Size(64, 52),
        shape: rounded,
        textStyle: const TextStyle(fontFamily: kPoppins, fontWeight: FontWeight.w700, fontSize: 16),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: DsColors.black,
        minimumSize: const Size(64, 52),
        side: const BorderSide(color: DsColors.line, width: 1.5),
        shape: rounded,
        textStyle: const TextStyle(fontFamily: kPoppins, fontWeight: FontWeight.w600, fontSize: 15),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: DsColors.orange,
        textStyle: const TextStyle(fontFamily: kPoppins, fontWeight: FontWeight.w600),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: DsColors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: DsColors.line)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: DsColors.line)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: DsColors.orange, width: 2)),
      errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: DsColors.red)),
      hintStyle: const TextStyle(color: DsColors.muted),
    ),
    cardTheme: CardThemeData(
      color: DsColors.white,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: const BorderSide(color: DsColors.line)),
    ),
    chipTheme: base.chipTheme.copyWith(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      side: const BorderSide(color: DsColors.line),
      selectedColor: DsColors.orangeLight,
      labelStyle: const TextStyle(fontFamily: kPoppins, fontWeight: FontWeight.w600, color: DsColors.black),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: DsColors.white,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: DsColors.white,
      surfaceTintColor: Colors.transparent,
      indicatorColor: DsColors.orangeLight,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          fontFamily: kPoppins,
          fontSize: 12,
          fontWeight: states.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
          color: states.contains(WidgetState.selected) ? DsColors.orange : DsColors.inkSoft,
        ),
      ),
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(color: states.contains(WidgetState.selected) ? DsColors.orange : DsColors.inkSoft),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: DsColors.black,
      contentTextStyle: const TextStyle(fontFamily: kPoppins, color: DsColors.white),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    dividerTheme: const DividerThemeData(color: DsColors.line, thickness: 1, space: 1),
  );
}
