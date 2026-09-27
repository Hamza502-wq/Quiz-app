import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/cart_controller.dart';
import '../checkout/checkout_screen.dart';
import 'order_detail_screen.dart';

class OrdersScreen extends StatelessWidget {
  const OrdersScreen({super.key, required this.active});

  /// Whether this tab is visible (lists refresh when shown).
  final bool active;

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('My orders'),
          bottom: const TabBar(
            labelColor: DsColors.orange,
            indicatorColor: DsColors.orange,
            tabs: [Tab(text: 'Active'), Tab(text: 'Past')],
          ),
        ),
        body: TabBarView(
          children: [
            _OrderList(key: ValueKey('active-$active'), activeOnly: true),
            _OrderList(key: ValueKey('past-$active'), activeOnly: false),
          ],
        ),
      ),
    );
  }
}

class _OrderList extends StatefulWidget {
  const _OrderList({super.key, required this.activeOnly});
  final bool activeOnly;

  @override
  State<_OrderList> createState() => _OrderListState();
}

class _OrderListState extends State<_OrderList> {
  final List<Order> _orders = [];
  int _page = 1;
  bool _hasMore = true;
  bool _loading = true;
  bool _loadingMore = false;
  Object? _error;
  VoidCallback? _unsubscribe;

  @override
  void initState() {
    super.initState();
    _load();
    _unsubscribe = context.read<SocketService>().on('order:updated', (data) {
      if (data is Map && mounted) _load();
    });
  }

  @override
  void dispose() {
    _unsubscribe?.call();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _orders.isEmpty;
      _error = null;
    });
    try {
      final data = await context.read<ApiClient>().get('/orders', query: {'active': widget.activeOnly ? 'true' : 'false', 'page': 1, 'pageSize': 20});
      final paged = Paged.fromJson(data as Map<String, dynamic>, Order.fromJson);
      if (!mounted) return;
      setState(() {
        _orders
          ..clear()
          ..addAll(paged.items);
        _page = 1;
        _hasMore = paged.hasMore;
        _loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e;
          _loading = false;
        });
      }
    }
  }

  Future<void> _more() async {
    if (_loadingMore || !_hasMore) return;
    setState(() => _loadingMore = true);
    try {
      final data = await context.read<ApiClient>().get('/orders', query: {'active': widget.activeOnly ? 'true' : 'false', 'page': _page + 1, 'pageSize': 20});
      final paged = Paged.fromJson(data as Map<String, dynamic>, Order.fromJson);
      if (!mounted) return;
      setState(() {
        _orders.addAll(paged.items);
        _page = paged.page;
        _hasMore = paged.hasMore;
      });
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  Future<void> _reorder(Order order) async {
    final api = context.read<ApiClient>();
    final cart = context.read<CartController>();
    final navigator = Navigator.of(context);
    final data = await runWithFeedback(context, () => api.post('/orders/${order.id}/reorder'));
    if (data == null || !mounted) return;
    final map = data as Map<String, dynamic>;
    final items = (map['items'] as List).cast<Map<String, dynamic>>();
    final unavailable = (map['unavailable'] as List).cast<String>();
    if (items.isEmpty) {
      showSnack(context, 'None of those items are available right now.', error: true);
      return;
    }
    await cart.clear();
    for (final item in items) {
      cart.add(
        vendorId: map['vendorId'] as String,
        vendorName: (map['vendorName'] as String?) ?? order.title,
        productId: item['productId'] as String,
        name: item['name'] as String,
        priceCents: (item['priceCents'] as num).toInt(),
        quantity: (item['quantity'] as num).toInt(),
      );
    }
    if (unavailable.isNotEmpty && mounted) showSnack(context, 'Not available: ${unavailable.join(', ')}');
    navigator.push(MaterialPageRoute<void>(builder: (_) => const CheckoutScreen()));
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();
    if (_error != null && _orders.isEmpty) return ErrorView(error: _error!, onRetry: _load);
    return RefreshIndicator(
      onRefresh: _load,
      child: _orders.isEmpty
          ? ListView(children: [
              const SizedBox(height: 100),
              EmptyView(
                icon: Icons.receipt_long_outlined,
                title: widget.activeOnly ? 'No active orders' : 'No past orders yet',
                message: widget.activeOnly ? 'Orders you place will show here with live tracking.' : 'Your delivered and cancelled orders appear here.',
              ),
            ])
          : NotificationListener<ScrollNotification>(
              onNotification: (n) {
                if (n.metrics.pixels > n.metrics.maxScrollExtent - 300) _more();
                return false;
              },
              child: ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: _orders.length + (_loadingMore ? 1 : 0),
                separatorBuilder: (_, _) => const SizedBox(height: 10),
                itemBuilder: (context, i) {
                  if (i >= _orders.length) return const LoadingView();
                  final o = _orders[i];
                  return Card(
                    child: InkWell(
                      borderRadius: BorderRadius.circular(18),
                      onTap: () async {
                        await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => OrderDetailScreen(orderId: o.id)));
                        _load();
                      },
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                LowDataImage(
                                  url: o.vendorLogoUrl,
                                  width: 44,
                                  height: 44,
                                  placeholderIcon: o.isParcel ? Icons.inventory_2_rounded : Icons.storefront_rounded,
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(o.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                                      Text('${o.code} · ${formatDateTime(o.placedAt ?? o.createdAt)}', style: const TextStyle(color: DsColors.muted, fontSize: 12)),
                                    ],
                                  ),
                                ),
                                StatusChip(status: o.status),
                              ],
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    o.isParcel ? (o.parcelDescription ?? 'Parcel') : o.items.map((i) => '${i.quantity}× ${i.name}').join(', '),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(color: DsColors.inkSoft),
                                  ),
                                ),
                                Text(formatMoney(o.amounts.totalLocalCents, o.amounts.currency), style: const TextStyle(fontWeight: FontWeight.w700)),
                              ],
                            ),
                            if (!widget.activeOnly && !o.isParcel && o.vendorId != null) ...[
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  if (o.canRate)
                                    const Text('⭐ Rate this order', style: TextStyle(color: DsColors.orange, fontWeight: FontWeight.w600)),
                                  const Spacer(),
                                  TextButton.icon(onPressed: () => _reorder(o), icon: const Icon(Icons.replay_rounded), label: const Text('Reorder')),
                                ],
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
    );
  }
}
