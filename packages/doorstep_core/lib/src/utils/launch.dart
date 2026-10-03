import 'package:url_launcher/url_launcher.dart';

Future<bool> callPhone(String phone) => launchUrl(Uri(scheme: 'tel', path: phone));

Future<bool> openWhatsApp(String phone) =>
    launchUrl(Uri.parse('https://wa.me/${phone.replaceAll(RegExp(r'\D'), '')}'), mode: LaunchMode.externalApplication);

/// Opens turn-by-turn navigation in Google Maps (falls back to the browser).
Future<bool> openNavigation(double lat, double lng) async {
  final nav = Uri.parse('google.navigation:q=$lat,$lng&mode=d');
  if (await canLaunchUrl(nav)) return launchUrl(nav);
  return launchUrl(
    Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$lat,$lng&travelmode=driving'),
    mode: LaunchMode.externalApplication,
  );
}

Future<bool> openExternal(String url) => launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
