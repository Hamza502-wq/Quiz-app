import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/api_exception.dart';
import '../models/models.dart';
import '../realtime/socket_service.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../utils/launch.dart';
import '../widgets/feedback.dart';
import '../widgets/skeleton.dart';

/// An order's chat, shared by the customer, the store and the rider.
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, required this.orderId, required this.title, this.phone, this.quickReplies = const ["I'm outside", 'On my way', 'Please call me', 'Thank you!']});
  final String orderId;
  final String title;
  final String? phone;
  final List<String> quickReplies;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final List<ChatMessage> _messages = [];
  bool _loading = true;
  bool _sending = false;
  Object? _error;
  VoidCallback? _unsubscribe;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _load();
    // Without a live connection, check for new messages every few seconds.
    _poll = Timer.periodic(const Duration(seconds: 5), (_) {
      if (mounted && !context.read<SocketService>().isConnected) _refresh();
    });
    _unsubscribe = context.read<SocketService>().on('chat:message', (data) {
      if (data is! Map) return;
      final msg = ChatMessage.fromJson(Map<String, dynamic>.from(data));
      if (msg.orderId != widget.orderId || _messages.any((m) => m.id == msg.id)) return;
      if (mounted) {
        setState(() => _messages.add(msg));
        _scrollToEnd();
      }
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    _unsubscribe?.call();
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await context.read<ApiClient>().get('/orders/${widget.orderId}/messages') as List;
      if (!mounted) return;
      setState(() {
        _messages
          ..clear()
          ..addAll(data.map((e) => ChatMessage.fromJson(e as Map<String, dynamic>)));
        _loading = false;
      });
      _scrollToEnd();
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e;
          _loading = false;
        });
      }
    }
  }

  /// Quietly adds messages that arrived since the last load.
  Future<void> _refresh() async {
    if (_loading) return;
    try {
      final data = await context.read<ApiClient>().get('/orders/${widget.orderId}/messages') as List;
      if (!mounted) return;
      final fresh = data
          .map((e) => ChatMessage.fromJson(e as Map<String, dynamic>))
          .where((m) => !_messages.any((x) => x.id == m.id))
          .toList();
      if (fresh.isEmpty) return;
      setState(() => _messages.addAll(fresh));
      _scrollToEnd();
    } catch (_) {
      // Try again on the next tick.
    }
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
    });
  }

  Future<void> _send([String? preset]) async {
    final body = (preset ?? _input.text).trim();
    if (body.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      final data = await context.read<ApiClient>().post('/orders/${widget.orderId}/messages', body: {'body': body});
      final msg = ChatMessage.fromJson(data as Map<String, dynamic>);
      if (!mounted) return;
      setState(() {
        if (!_messages.any((m) => m.id == msg.id)) _messages.add(msg);
        _input.clear();
      });
      _scrollToEnd();
    } catch (e) {
      if (mounted) showSnack(context, errorMessage(e), error: true);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          if (widget.phone != null) IconButton(onPressed: () => callPhone(widget.phone!), icon: const Icon(Icons.call_rounded), tooltip: 'Call'),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? const LoadingView(layout: SkeletonLayout.chat)
                : _error != null
                    ? ErrorView(error: _error!, onRetry: _load)
                    : _messages.isEmpty
                        ? const EmptyView(icon: Icons.chat_bubble_outline_rounded, title: 'No messages yet', message: 'Say hello or share directions.')
                        : ListView.builder(
                            controller: _scroll,
                            padding: const EdgeInsets.all(16),
                            itemCount: _messages.length,
                            itemBuilder: (_, i) {
                              final m = _messages[i];
                              return Align(
                                alignment: m.mine ? Alignment.centerRight : Alignment.centerLeft,
                                child: Container(
                                  margin: const EdgeInsets.symmetric(vertical: 4),
                                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                                  constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.75),
                                  decoration: BoxDecoration(
                                    color: m.mine ? DsColors.orange : DsColors.white,
                                    borderRadius: BorderRadius.circular(16),
                                    border: m.mine ? null : Border.all(color: DsColors.line),
                                  ),
                                  child: Column(
                                    crossAxisAlignment: m.mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                                    children: [
                                      if (!m.mine && m.senderLabel != null)
                                        Padding(
                                          padding: const EdgeInsets.only(bottom: 2),
                                          child: Text(m.senderLabel!, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: DsColors.orange)),
                                        ),
                                      Text(m.body, style: TextStyle(color: m.mine ? Colors.white : DsColors.black)),
                                      const SizedBox(height: 2),
                                      Text(formatTime(m.createdAt), style: TextStyle(fontSize: 10, color: m.mine ? Colors.white70 : DsColors.muted)),
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
          ),
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              children: [
                for (final q in widget.quickReplies)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ActionChip(label: Text(q), onPressed: () => _send(q)),
                  ),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _input,
                      minLines: 1,
                      maxLines: 4,
                      maxLength: 1000,
                      textCapitalization: TextCapitalization.sentences,
                      // Enter (or the keyboard's send key) sends; the keyboard stays open for the next message.
                      textInputAction: TextInputAction.send,
                      decoration: const InputDecoration(hintText: 'Type a message', counterText: ''),
                      onEditingComplete: () {},
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: _sending ? null : _send,
                    icon: _sending
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Icon(Icons.send_rounded),
                    style: IconButton.styleFrom(backgroundColor: DsColors.orange, minimumSize: const Size(52, 52)),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
