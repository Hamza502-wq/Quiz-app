import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models/models.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../widgets/async_view.dart';
import '../widgets/feedback.dart';

/// In-app notification inbox. [onOpen] handles taps (e.g. open an order).
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key, this.onOpen});
  final void Function(BuildContext context, AppNotification notification)? onOpen;

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final _key = GlobalKey<AsyncViewState<Paged<AppNotification>>>();

  Future<Paged<AppNotification>> _load() async {
    final data = await context.read<ApiClient>().get('/notifications', query: {'pageSize': 50}) as Map<String, dynamic>;
    return Paged.fromJson(data, AppNotification.fromJson);
  }

  IconData _icon(String type) {
    if (type.contains('PAYMENT') || type.contains('PAYOUT') || type.contains('REFUND')) return Icons.payments_outlined;
    if (type.contains('CHAT')) return Icons.chat_bubble_outline_rounded;
    if (type.contains('BONUS') || type.contains('TIP')) return Icons.celebration_outlined;
    if (type.contains('DISPATCH') || type.contains('ASSIGNED')) return Icons.delivery_dining_rounded;
    return Icons.notifications_none_rounded;
  }

  @override
  Widget build(BuildContext context) {
    final api = context.read<ApiClient>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          TextButton(
            onPressed: () async {
              await runWithFeedback(context, () => api.post('/notifications/read-all'));
              await _key.currentState?.reload();
            },
            child: const Text('Mark all read'),
          ),
        ],
      ),
      body: AsyncView<Paged<AppNotification>>(
        key: _key,
        load: _load,
        builder: (context, data, reload) {
          if (data.items.isEmpty) {
            return ListView(children: const [
              SizedBox(height: 120),
              EmptyView(icon: Icons.notifications_none_rounded, title: 'No notifications yet', message: 'Order updates will appear here.'),
            ]);
          }
          return ListView.separated(
            itemCount: data.items.length,
            separatorBuilder: (_, _) => const Divider(),
            itemBuilder: (context, i) {
              final n = data.items[i];
              return ListTile(
                tileColor: n.readAt == null ? DsColors.orangeLight.withValues(alpha: 0.5) : DsColors.white,
                leading: CircleAvatar(backgroundColor: DsColors.orangeLight, child: Icon(_icon(n.type), color: DsColors.orange)),
                title: Text(n.title, style: TextStyle(fontWeight: n.readAt == null ? FontWeight.w700 : FontWeight.w500)),
                subtitle: Text('${n.body}\n${timeAgo(n.createdAt)}'),
                isThreeLine: true,
                onTap: () async {
                  if (n.readAt == null) {
                    api.post('/notifications/${n.id}/read').ignore();
                  }
                  widget.onOpen?.call(context, n);
                },
              );
            },
          );
        },
      ),
    );
  }
}
