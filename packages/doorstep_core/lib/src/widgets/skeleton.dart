import 'package:flutter/material.dart';

import '../theme.dart';

/// Layouts for [SkeletonView]: a placeholder shaped like the content on its way.
enum SkeletonLayout { list, cards, detail, chat, menu }

/// Animates a soft highlight across every [SkeletonBox] below it.
class Shimmer extends StatefulWidget {
  const Shimmer({super.key, required this.child});
  final Widget child;

  @override
  State<Shimmer> createState() => _ShimmerState();
}

class _ShimmerState extends State<Shimmer> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Respect "reduce motion": a still grey placeholder.
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) {
      _controller.stop();
    } else if (!_controller.isAnimating) {
      _controller.repeat();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      child: widget.child,
      builder: (context, child) {
        final t = _controller.value;
        return ShaderMask(
          blendMode: BlendMode.srcATop,
          shaderCallback: (rect) => LinearGradient(
            colors: const [_base, _highlight, _base],
            stops: const [0.35, 0.5, 0.65],
            begin: Alignment(-2.5 + 4 * t, 0),
            end: Alignment(-0.5 + 4 * t, 0),
          ).createShader(rect),
          child: child,
        );
      },
    );
  }
}

const _base = Color(0xFFEEEEF0);
const _highlight = Color(0xFFF8F8F9);

/// A grey placeholder block (use inside a [Shimmer]).
class SkeletonBox extends StatelessWidget {
  const SkeletonBox({super.key, this.width, this.height = 14, this.radius = 8, this.circle = false});
  final double? width;
  final double height;
  final double radius;
  final bool circle;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: circle ? height : width,
      height: height,
      decoration: BoxDecoration(
        color: _base,
        shape: circle ? BoxShape.circle : BoxShape.rectangle,
        borderRadius: circle ? null : BorderRadius.circular(radius),
      ),
    );
  }
}

/// One list row: avatar, two lines of text and a badge.
class SkeletonListTile extends StatelessWidget {
  const SkeletonListTile({super.key, this.wide = true});
  final bool wide;

  @override
  Widget build(BuildContext context) {
    return Shimmer(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            const SkeletonBox(height: 44, circle: true),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  FractionallySizedBox(widthFactor: wide ? 0.7 : 0.5, child: const SkeletonBox(height: 15)),
                  const SizedBox(height: 8),
                  const FractionallySizedBox(widthFactor: 0.4, child: SkeletonBox(height: 12)),
                ],
              ),
            ),
            const SizedBox(width: 12),
            const SkeletonBox(width: 56, height: 22, radius: 11),
          ],
        ),
      ),
    );
  }
}

/// A store card: cover photo, logo and two lines of text.
class SkeletonCard extends StatelessWidget {
  const SkeletonCard({super.key});

  @override
  Widget build(BuildContext context) {
    return Shimmer(
      child: Container(
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        decoration: BoxDecoration(
          color: DsColors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: DsColors.line),
        ),
        clipBehavior: Clip.antiAlias,
        child: const Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AspectRatio(aspectRatio: 16 / 7, child: SkeletonBox(radius: 0)),
            Padding(
              padding: EdgeInsets.all(14),
              child: Row(
                children: [
                  SkeletonBox(width: 44, height: 44, radius: 12),
                  SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        FractionallySizedBox(widthFactor: 0.65, child: SkeletonBox(height: 15)),
                        SizedBox(height: 8),
                        FractionallySizedBox(widthFactor: 0.45, child: SkeletonBox(height: 12)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Skeleton for a whole screen or section. It clips when the space is short;
/// use [compact] where its height is unbounded (e.g. inside a Column in a
/// bottom sheet) so it stays small.
class SkeletonView extends StatelessWidget {
  const SkeletonView({super.key, this.layout = SkeletonLayout.list, this.label, this.compact = false});
  final SkeletonLayout layout;

  /// Read out by screen readers (e.g. "Loading your order…").
  final String? label;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: label ?? 'Loading',
      liveRegion: true,
      child: ExcludeSemantics(
        child: SingleChildScrollView(
          physics: const NeverScrollableScrollPhysics(),
          primary: false,
          padding: const EdgeInsets.only(top: 12),
          child: switch (layout) {
            SkeletonLayout.list => Column(children: [for (var i = 0; i < (compact ? 3 : 7); i++) SkeletonListTile(wide: i.isEven)]),
            SkeletonLayout.cards => Column(children: [for (var i = 0; i < (compact ? 1 : 3); i++) const SkeletonCard()]),
            SkeletonLayout.detail => _DetailSkeleton(compact: compact),
            SkeletonLayout.chat => _ChatSkeleton(compact: compact),
            SkeletonLayout.menu => _MenuSkeleton(compact: compact),
          },
        ),
      ),
    );
  }
}

class _Block extends StatelessWidget {
  const _Block({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 14),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: DsColors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: DsColors.line),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
    );
  }
}

class _DetailSkeleton extends StatelessWidget {
  const _DetailSkeleton({this.compact = false});
  final bool compact;

  @override
  Widget build(BuildContext context) {
    const gap = SizedBox(height: 10);
    return Shimmer(
      child: Column(
        children: [
          const _Block(
            children: [
              FractionallySizedBox(widthFactor: 0.5, child: SkeletonBox(height: 20)),
              gap,
              FractionallySizedBox(widthFactor: 0.35, child: SkeletonBox(height: 12)),
              SizedBox(height: 16),
              SkeletonBox(height: 8, radius: 4),
            ],
          ),
          const _Block(children: [SkeletonBox(height: 160, radius: 12)]),
          if (!compact) ...const [
            _Block(
              children: [
                Row(
                  children: [
                    SkeletonBox(height: 48, circle: true),
                    SizedBox(width: 12),
                    Expanded(
                      child: FractionallySizedBox(alignment: Alignment.centerLeft, widthFactor: 0.6, child: SkeletonBox(height: 15)),
                    ),
                  ],
                ),
              ],
            ),
            _Block(
              children: [
                SkeletonBox(height: 13),
                gap,
                FractionallySizedBox(widthFactor: 0.8, child: SkeletonBox(height: 13)),
                gap,
                FractionallySizedBox(widthFactor: 0.6, child: SkeletonBox(height: 13)),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _ChatSkeleton extends StatelessWidget {
  const _ChatSkeleton({this.compact = false});
  final bool compact;

  @override
  Widget build(BuildContext context) {
    Widget bubble(bool mine, double width) => Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        child: SkeletonBox(width: width, height: 38, radius: 16),
      ),
    );
    return Shimmer(
      child: Column(
        children: [
          bubble(false, 200),
          bubble(true, 150),
          bubble(false, 240),
          if (!compact) ...[bubble(true, 120), bubble(false, 170)],
        ],
      ),
    );
  }
}

class _MenuSkeleton extends StatelessWidget {
  const _MenuSkeleton({this.compact = false});
  final bool compact;

  @override
  Widget build(BuildContext context) {
    Widget product() => const Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, 18),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                FractionallySizedBox(widthFactor: 0.6, child: SkeletonBox(height: 15)),
                SizedBox(height: 8),
                SkeletonBox(height: 12),
                SizedBox(height: 8),
                FractionallySizedBox(widthFactor: 0.25, child: SkeletonBox(height: 13)),
              ],
            ),
          ),
          SizedBox(width: 14),
          SkeletonBox(width: 76, height: 76, radius: 14),
        ],
      ),
    );
    return Shimmer(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(padding: EdgeInsets.fromLTRB(16, 0, 16, 16), child: SkeletonBox(height: 150, radius: 18)),
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 0, 16, 20),
            child: FractionallySizedBox(widthFactor: 0.5, child: SkeletonBox(height: 20)),
          ),
          for (var i = 0; i < (compact ? 2 : 5); i++) product(),
        ],
      ),
    );
  }
}
