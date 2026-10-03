import 'dart:async';

import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/address_controller.dart';
import '../../state/cart_controller.dart';
import '../address/address_picker_sheet.dart';
import '../checkout/checkout_screen.dart';
import '../orders/order_detail_screen.dart';
import '../parcel/send_parcel_screen.dart';
import '../vendor/vendor_screen.dart';
import 'vendor_card.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _search = TextEditingController();
  final _scroll = ScrollController();
  Timer? _debounce;

  List<Category> _categories = [];
  String? _category;
  bool _openNow = false;
  String _sort = 'recommended';

  final List<Vendor> _vendors = [];
  int _page = 1;
  bool _hasMore = true;
  bool _loading = true;
  bool _loadingMore = false;
  Object? _error;
  String? _lastAddressId;

  @override
  void initState() {
    super.initState();
    _loadCategories();
    _reload();
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 400) _loadMore();
    });
  }

  bool _dependenciesReady = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Reload the store list whenever the delivery address changes (distance, fees, zone).
    final addressId = Provider.of<AddressController>(context).selected?.id;
    if (!_dependenciesReady) {
      _dependenciesReady = true;
      _lastAddressId = addressId;
      return;
    }
    if (addressId != _lastAddressId) {
      _lastAddressId = addressId;
      Future.microtask(_reload);
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _loadCategories() async {
    try {
      final data = await context.read<ApiClient>().get('/categories') as List;
      if (mounted) setState(() => _categories = data.map((e) => Category.fromJson(e as Map<String, dynamic>)).toList());
    } catch (_) {
      // Categories are optional chrome — vendor list still works.
    }
  }

  Map<String, dynamic> _query(int page) {
    final address = context.read<AddressController>().selected;
    return {
      'page': page,
      'pageSize': 20,
      'category': _category,
      'q': _search.text.trim(),
      'openNow': _openNow ? 'true' : null,
      'sort': _sort,
      if (address != null) 'lat': address.lat,
      if (address != null) 'lng': address.lng,
    };
  }

  Future<void> _reload() async {
    setState(() {
      _loading = true;
      _error = null;
      _page = 1;
    });
    try {
      final data = await context.read<ApiClient>().get('/vendors', query: _query(1)) as Map<String, dynamic>;
      final paged = Paged.fromJson(data, Vendor.fromJson);
      if (!mounted) return;
      setState(() {
        _vendors
          ..clear()
          ..addAll(paged.items);
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

  Future<void> _loadMore() async {
    if (_loadingMore || !_hasMore || _loading) return;
    setState(() => _loadingMore = true);
    try {
      final data = await context.read<ApiClient>().get('/vendors', query: _query(_page + 1)) as Map<String, dynamic>;
      final paged = Paged.fromJson(data, Vendor.fromJson);
      if (!mounted) return;
      setState(() {
        _page = paged.page;
        _vendors.addAll(paged.items);
        _hasMore = paged.hasMore;
      });
    } catch (_) {
      // Keep what we have; user can pull to refresh.
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  void _onSearchChanged(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 450), _reload);
  }

  @override
  Widget build(BuildContext context) {
    final address = context.watch<AddressController>().selected;
    final cart = context.watch<CartController>();
    final profile = context.watch<AuthController>().profile;

    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 68,
        titleSpacing: 16,
        title: InkWell(
          onTap: () => showAddressPicker(context),
          child: Row(
            children: [
              const Icon(Icons.location_on_rounded, color: DsColors.red),
              const SizedBox(width: 6),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Deliver to', style: TextStyle(fontSize: 12, color: DsColors.muted, fontWeight: FontWeight.w500)),
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            address == null ? 'Add a delivery address' : '${address.label} · ${address.landmark}',
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                          ),
                        ),
                        const Icon(Icons.keyboard_arrow_down_rounded),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        actions: [
          IconButton(
            tooltip: 'Notifications',
            icon: const Icon(Icons.notifications_none_rounded),
            onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(
              builder: (_) => NotificationsScreen(onOpen: (ctx, n) {
                final orderId = n.data['orderId'];
                if (orderId != null) Navigator.of(ctx).push(MaterialPageRoute<void>(builder: (_) => OrderDetailScreen(orderId: orderId)));
              }),
            )),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _reload,
        child: CustomScrollView(
          controller: _scroll,
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Mhoro${profile?.name != null ? ', ${profile!.name!.split(' ').first}' : ''}! 👋',
                        style: Theme.of(context).textTheme.headlineSmall),
                    const Text('What can we bring to your doorstep today?', style: TextStyle(color: DsColors.muted)),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _search,
                      onChanged: _onSearchChanged,
                      textInputAction: TextInputAction.search,
                      decoration: InputDecoration(
                        hintText: 'Search shops or products',
                        prefixIcon: const Icon(Icons.search_rounded),
                        suffixIcon: _search.text.isEmpty
                            ? null
                            : IconButton(
                                icon: const Icon(Icons.close_rounded),
                                onPressed: () {
                                  _search.clear();
                                  _reload();
                                },
                              ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: SizedBox(
                height: 104,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  children: [
                    for (final c in _categories)
                      _CategoryTile(
                        label: c.name,
                        icon: categoryIcon(c.slug),
                        selected: _category == c.slug,
                        onTap: () {
                          if (c.slug == 'parcels') {
                            Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const SendParcelScreen()));
                            return;
                          }
                          setState(() => _category = _category == c.slug ? null : c.slug);
                          _reload();
                        },
                      ),
                  ],
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  children: [
                    FilterChip(
                      label: const Text('Open now'),
                      selected: _openNow,
                      onSelected: (v) {
                        setState(() => _openNow = v);
                        _reload();
                      },
                    ),
                    const Spacer(),
                    PopupMenuButton<String>(
                      initialValue: _sort,
                      onSelected: (v) {
                        setState(() => _sort = v);
                        _reload();
                      },
                      itemBuilder: (_) => const [
                        PopupMenuItem(value: 'recommended', child: Text('Recommended')),
                        PopupMenuItem(value: 'rating', child: Text('Top rated')),
                        PopupMenuItem(value: 'distance', child: Text('Nearest')),
                        PopupMenuItem(value: 'deliveryFee', child: Text('Lowest delivery fee')),
                      ],
                      child: Row(
                        children: [
                          const Icon(Icons.sort_rounded, size: 18),
                          const SizedBox(width: 4),
                          Text(
                            {'recommended': 'Recommended', 'rating': 'Top rated', 'distance': 'Nearest', 'deliveryFee': 'Lowest fee'}[_sort]!,
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (_loading)
              const SliverFillRemaining(hasScrollBody: false, child: LoadingView(message: 'Finding stores near you…', layout: SkeletonLayout.cards))
            else if (_error != null)
              SliverFillRemaining(hasScrollBody: false, child: ErrorView(error: _error!, onRetry: _reload))
            else if (_vendors.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: EmptyView(
                  icon: Icons.storefront_outlined,
                  title: 'No stores found',
                  message: address == null
                      ? 'Add your delivery address to see stores that deliver to you.'
                      : 'Try another category, turn off "Open now", or search for something else.',
                  action: address == null
                      ? OutlinedButton(onPressed: () => showAddressPicker(context), child: const Text('Add address'))
                      : null,
                ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
                sliver: SliverList.separated(
                  itemCount: _vendors.length + (_loadingMore ? 1 : 0),
                  separatorBuilder: (_, _) => const SizedBox(height: 12),
                  itemBuilder: (context, i) {
                    if (i >= _vendors.length) return const SkeletonCard();
                    final v = _vendors[i];
                    return VendorCard(
                      vendor: v,
                      onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => VendorScreen(vendorId: v.id))),
                    );
                  },
                ),
              ),
          ],
        ),
      ),
      floatingActionButton: cart.isEmpty
          ? null
          : FloatingActionButton.extended(
              backgroundColor: DsColors.orange,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.shopping_bag_rounded),
              label: Text('${cart.itemCount} · ${formatMoney(cart.subtotalCents)}'),
              onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const CheckoutScreen())),
            ),
    );
  }
}

class _CategoryTile extends StatelessWidget {
  const _CategoryTile({required this.label, required this.icon, required this.selected, required this.onTap});
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Container(
          width: 84,
          decoration: BoxDecoration(
            color: selected ? DsColors.orange : DsColors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: selected ? DsColors.orange : DsColors.line),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: selected ? Colors.white : DsColors.orange, size: 30),
              const SizedBox(height: 6),
              Text(label, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: selected ? Colors.white : DsColors.black)),
            ],
          ),
        ),
      ),
    );
  }
}
