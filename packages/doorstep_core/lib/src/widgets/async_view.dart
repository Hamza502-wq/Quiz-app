import 'package:flutter/material.dart';

import 'feedback.dart';
import 'skeleton.dart';

/// Loads data with a loading state, an error state with retry, and
/// pull-to-refresh. Use [AsyncViewState.reload] via a GlobalKey to refresh.
class AsyncView<T> extends StatefulWidget {
  const AsyncView({
    super.key,
    required this.load,
    required this.builder,
    this.loadingMessage,
    this.refreshable = true,
    this.skeleton = SkeletonLayout.list,
  });

  final Future<T> Function() load;
  final Widget Function(BuildContext context, T data, Future<void> Function() reload) builder;
  final String? loadingMessage;
  final bool refreshable;

  /// Shape of the loading skeleton.
  final SkeletonLayout skeleton;

  @override
  State<AsyncView<T>> createState() => AsyncViewState<T>();
}

class AsyncViewState<T> extends State<AsyncView<T>> {
  T? _data;
  Object? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    reload();
  }

  Future<void> reload() async {
    setState(() {
      _loading = _data == null;
      _error = null;
    });
    try {
      final data = await widget.load();
      if (!mounted) return;
      setState(() {
        _data = data;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _data == null) return LoadingView(message: widget.loadingMessage, layout: widget.skeleton);
    if (_error != null && _data == null) return ErrorView(error: _error!, onRetry: reload);
    final content = widget.builder(context, _data as T, reload);
    if (!widget.refreshable) return content;
    return RefreshIndicator(onRefresh: reload, child: content);
  }
}
