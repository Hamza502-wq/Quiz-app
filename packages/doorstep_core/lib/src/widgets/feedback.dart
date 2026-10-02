import 'package:flutter/material.dart';

import '../api/api_exception.dart';
import '../theme.dart';
import 'skeleton.dart';

/// Loading placeholder: a skeleton of the content on its way. `message` is
/// read out by screen readers.
class LoadingView extends StatelessWidget {
  const LoadingView({super.key, this.message, this.layout = SkeletonLayout.list, this.compact = false});
  final String? message;
  final SkeletonLayout layout;

  /// A shorter skeleton, for places where the height is unbounded.
  final bool compact;

  @override
  Widget build(BuildContext context) => SkeletonView(layout: layout, label: message, compact: compact);
}

/// A spinner with a message, for actions in progress (uploading a photo, …).
class BusyView extends StatelessWidget {
  const BusyView({super.key, this.message});
  final String? message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(color: DsColors.orange),
            if (message != null) ...[
              const SizedBox(height: 16),
              Text(message!, textAlign: TextAlign.center, style: const TextStyle(color: DsColors.muted)),
            ],
          ],
        ),
      ),
    );
  }
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.error, this.onRetry});
  final Object error;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final offline = error is ApiException && (error as ApiException).isNetwork;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(offline ? Icons.wifi_off_rounded : Icons.error_outline_rounded, size: 56, color: DsColors.red),
            const SizedBox(height: 12),
            Text(offline ? "You're offline" : 'Something went wrong', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 6),
            Text(errorMessage(error), textAlign: TextAlign.center, style: const TextStyle(color: DsColors.muted)),
            if (onRetry != null) ...[
              const SizedBox(height: 20),
              OutlinedButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh_rounded), label: const Text('Try again')),
            ],
          ],
        ),
      ),
    );
  }
}

class EmptyView extends StatelessWidget {
  const EmptyView({super.key, required this.title, this.message, this.icon = Icons.inbox_outlined, this.action});
  final String title;
  final String? message;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(18),
              decoration: const BoxDecoration(color: DsColors.orangeLight, shape: BoxShape.circle),
              child: Icon(icon, size: 40, color: DsColors.orange),
            ),
            const SizedBox(height: 16),
            Text(title, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleLarge),
            if (message != null) ...[
              const SizedBox(height: 6),
              Text(message!, textAlign: TextAlign.center, style: const TextStyle(color: DsColors.muted)),
            ],
            if (action != null) ...[const SizedBox(height: 20), action!],
          ],
        ),
      ),
    );
  }
}

/// Filled button with a built-in spinner.
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({super.key, required this.label, required this.onPressed, this.loading = false, this.icon, this.color});
  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final IconData? icon;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final child = loading
        ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
        : Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[Icon(icon, size: 20), const SizedBox(width: 8)],
              Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
            ],
          );
    return SizedBox(
      width: double.infinity,
      child: FilledButton(
        style: color == null ? null : FilledButton.styleFrom(backgroundColor: color),
        onPressed: loading ? null : onPressed,
        child: child,
      ),
    );
  }
}

void showSnack(BuildContext context, String message, {bool error = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message), backgroundColor: error ? DsColors.red : DsColors.black));
}

/// Runs an async action, showing its error as a SnackBar. Returns null on failure.
Future<T?> runWithFeedback<T>(BuildContext context, Future<T> Function() action, {String? success}) async {
  try {
    final result = await action();
    if (success != null && context.mounted) showSnack(context, success);
    return result;
  } catch (e) {
    if (context.mounted) showSnack(context, errorMessage(e), error: true);
    return null;
  }
}
