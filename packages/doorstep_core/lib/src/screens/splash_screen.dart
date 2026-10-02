import 'dart:async';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';

import '../theme.dart';
import '../widgets/brand.dart';

/// Opening screen: the DoorStep scooter rides in from the left to the house,
/// then the name appears. Shown while the app starts (restoring the session,
/// loading the profile). With "reduce motion" on, everything appears at once.
/// On the web the page's HTML loading screen plays the same animation while
/// Flutter loads, so this screen starts at its last frame there.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key, this.tagline});
  final String? tagline;

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 1500));

  // The scooter arrives over the first 70%, bumping along the road; the house
  // pops in at the start; the name and tagline rise in at the end.
  late final Animation<double> _ride = CurvedAnimation(parent: _controller, curve: const Interval(0.05, 0.72, curve: Curves.easeOutCubic));
  late final Animation<double> _house = CurvedAnimation(parent: _controller, curve: const Interval(0, 0.3, curve: Curves.easeOutBack));
  late final Animation<double> _text = CurvedAnimation(parent: _controller, curve: const Interval(0.62, 1, curve: Curves.easeOut));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (kIsWeb || (MediaQuery.maybeDisableAnimationsOf(context) ?? false)) {
      _controller.value = 1;
    } else if (!_controller.isAnimating && _controller.value == 0) {
      _controller.forward();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.sizeOf(context).width;
    return Scaffold(
      backgroundColor: DsColors.white,
      body: SafeArea(
        child: Stack(
          children: [
            Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: 264,
                    height: 124,
                    child: AnimatedBuilder(
                      animation: _controller,
                      builder: (context, _) {
                        // Off-screen on the left → resting next to the house's door.
                        final dx = (1 - _ride.value) * -(screenWidth / 2 + 264);
                        final riding = _ride.value > 0 && _ride.value < 1;
                        final bump = riding ? (_controller.value * 40).floor().isEven ? -2.5 : 0.0 : 0.0;
                        return Stack(
                          clipBehavior: Clip.none,
                          children: [
                            Positioned(
                              right: 6,
                              bottom: 0,
                              child: Opacity(
                                opacity: _house.value.clamp(0.0, 1.0),
                                child: Transform.scale(
                                  scale: 0.6 + 0.4 * _house.value,
                                  alignment: Alignment.bottomCenter,
                                  child: Image.asset('assets/brand/house.png', package: 'doorstep_core', width: 96, excludeFromSemantics: true),
                                ),
                              ),
                            ),
                            Positioned(
                              left: 0,
                              bottom: 0,
                              child: Transform.translate(
                                offset: Offset(dx, bump),
                                child: Image.asset('assets/brand/scooter.png', package: 'doorstep_core', width: 150, excludeFromSemantics: true),
                              ),
                            ),
                          ],
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 18),
                  FadeTransition(
                    opacity: _text,
                    child: SlideTransition(
                      position: Tween(begin: const Offset(0, 0.3), end: Offset.zero).animate(_text),
                      child: Column(
                        children: [
                          Semantics(
                            header: true,
                            label: 'DoorStep Zimbabwe',
                            child: const ExcludeSemantics(
                              child: Text.rich(
                                TextSpan(
                                  children: [
                                    TextSpan(text: 'Door', style: TextStyle(color: DsColors.black)),
                                    TextSpan(text: 'Step', style: TextStyle(color: DsColors.orange)),
                                  ],
                                ),
                                style: TextStyle(fontSize: 30, fontWeight: FontWeight.w700, letterSpacing: -0.5),
                              ),
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            (widget.tagline ?? 'Zimbabwe').toUpperCase(),
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: DsColors.muted, fontWeight: FontWeight.w600, letterSpacing: 2.4, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Positioned(
              left: 0,
              right: 0,
              bottom: 20,
              child: FadeTransition(opacity: _text, child: const MadeBy()),
            ),
          ],
        ),
      ),
    );
  }
}

/// Shows the opening [SplashScreen] when the app starts, for long enough to
/// play the animation and until [ready] (session restored, profile loaded),
/// then [child]. Skips the wait when "reduce motion" is on, and on the web
/// (where the page's loading screen has already played the animation).
class OpeningSplashGate extends StatefulWidget {
  const OpeningSplashGate({
    super.key,
    required this.ready,
    required this.child,
    this.tagline,
    this.minDuration = const Duration(milliseconds: 1700),
  });

  final bool ready;
  final Widget child;
  final String? tagline;
  final Duration minDuration;

  @override
  State<OpeningSplashGate> createState() => _OpeningSplashGateState();
}

class _OpeningSplashGateState extends State<OpeningSplashGate> {
  Timer? _timer;
  bool _introDone = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_introDone || _timer != null) return;
    if (kIsWeb || (MediaQuery.maybeDisableAnimationsOf(context) ?? false)) {
      _introDone = true;
    } else {
      _timer = Timer(widget.minDuration, () {
        if (mounted) setState(() => _introDone = true);
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_introDone || !widget.ready) return SplashScreen(tagline: widget.tagline);
    return widget.child;
  }
}
