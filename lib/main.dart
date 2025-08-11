import 'package:flutter/material.dart';

// Import all the pages we will use
import 'pages/home.dart';
import 'pages/profile.dart';
import 'pages/settings.dart';
import 'pages/about.dart';
import 'pages/contact.dart';

void main() {
  runApp(const PersonalApp());
  bool isDarkMode = false; // entry point
}

class PersonalApp extends StatelessWidget {
  const PersonalApp({super.key});

  bool get isDarkMode => true;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Get to know who Malvirn is',
      debugShowCheckedModeBanner: false,
      theme: isDarkMode ? ThemeData.dark() : ThemeData.light(),
      initialRoute: '/',
      routes: {
        '/': (context) => const HomePage(),
        '/home': (context) => const HomePage(),
        '/profile': (context) => const ProfilePage(),
        '/settings': (context) => const SettingsPage(),
        '/about': (context) => const AboutPage(),
        '/contact': (context) => const ContactPage(),
      },
    );
  }
}
