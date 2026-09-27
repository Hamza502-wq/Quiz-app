import 'package:intl/intl.dart';

final _money = NumberFormat('#,##0.00', 'en_US');

/// "US$5.50" or "ZiG 147.40".
String formatMoney(int cents, [String currency = 'USD']) {
  final value = _money.format(cents / 100);
  return currency == 'ZWG' ? 'ZiG $value' : 'US\$$value';
}

/// Shows a USD amount in the customer's chosen currency.
String formatInCurrency(int usdCents, String currency, double zigPerUsd) =>
    currency == 'ZWG' ? formatMoney((usdCents * zigPerUsd).round(), 'ZWG') : formatMoney(usdCents);

/// "US$5.50 · ZiG 147.40".
String formatUsdZig(int usdCents, double zigPerUsd) =>
    '${formatMoney(usdCents)} · ${formatMoney((usdCents * zigPerUsd).round(), 'ZWG')}';

/// Parses "12.50" into cents, or null.
int? parseMoney(String input) {
  final cleaned = input.replaceAll(RegExp(r'[^0-9.]'), '');
  if (!RegExp(r'^\d+(\.\d{0,2})?$').hasMatch(cleaned)) return null;
  return (double.parse(cleaned) * 100).round();
}

String formatDateTime(DateTime? d) => d == null ? '—' : DateFormat('d MMM, HH:mm').format(d);
String formatDate(DateTime? d) => d == null ? '—' : DateFormat('d MMM yyyy').format(d);
String formatTime(DateTime? d) => d == null ? '—' : DateFormat('HH:mm').format(d);

String timeAgo(DateTime d) {
  final diff = DateTime.now().difference(d);
  if (diff.inSeconds < 60) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes} min ago';
  if (diff.inHours < 24) return '${diff.inHours} h ago';
  return formatDate(d);
}

const paymentMethodLabels = {
  'ECOCASH': 'EcoCash',
  'ONEMONEY': 'OneMoney',
  'CARD': 'Card',
  'CASH': 'Cash on delivery',
  'BANK': 'Bank transfer',
};

String paymentLabel(String method) => paymentMethodLabels[method] ?? method;

/// Light client-side check before hitting the API (which normalises properly).
bool looksLikePhone(String input) {
  final digits = input.replaceAll(RegExp(r'\D'), '');
  return digits.length >= 9 && digits.length <= 13;
}
