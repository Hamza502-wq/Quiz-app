import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/address_controller.dart';
import '../../state/cart_controller.dart';
import '../checkout/checkout_screen.dart';

const _dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

class VendorScreen extends StatelessWidget {
  const VendorScreen({super.key, required this.vendorId});
  final String vendorId;

  @override
  Widget build(BuildContext context) {
    final address = context.read<AddressController>().selected;
    final api = context.read<ApiClient>();
    return Scaffold(
      body: AsyncView<VendorMenu>(
        load: () async => VendorMenu.fromJson(
          await api.get('/vendors/$vendorId', query: {if (address != null) 'lat': address.lat, if (address != null) 'lng': address.lng})
              as Map<String, dynamic>,
        ),
        loadingMessage: 'Loading menu…',
        builder: (context, menu, reload) => _MenuView(menu: menu),
      ),
      bottomNavigationBar: const _CartBar(),
    );
  }
}

class _MenuView extends StatelessWidget {
  const _MenuView({required this.menu});
  final VendorMenu menu;

  @override
  Widget build(BuildContext context) {
    final v = menu.vendor;
    final d = menu.delivery;
    return CustomScrollView(
      slivers: [
        SliverAppBar(
          pinned: true,
          expandedHeight: 190,
          foregroundColor: DsColors.black,
          flexibleSpace: FlexibleSpaceBar(
            title: Text(v.name, style: const TextStyle(fontWeight: FontWeight.w700, color: DsColors.black, fontSize: 16)),
            titlePadding: const EdgeInsetsDirectional.only(start: 56, bottom: 14, end: 16),
            background: Stack(
              fit: StackFit.expand,
              children: [
                LowDataImage(url: v.coverUrl ?? v.logoUrl, borderRadius: 0),
                const DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(begin: Alignment.center, end: Alignment.bottomCenter, colors: [Colors.transparent, Colors.white]),
                  ),
                ),
              ],
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (v.description != null) Text(v.description!, style: const TextStyle(color: DsColors.inkSoft)),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    Chip(
                      avatar: Icon(v.isOpen ? Icons.check_circle_rounded : Icons.cancel_rounded, color: v.isOpen ? DsColors.green : DsColors.red, size: 18),
                      label: Text(v.isOpen ? 'Open now' : 'Closed'),
                    ),
                    if (v.ratingCount > 0)
                      ActionChip(
                        avatar: const Icon(Icons.star_rounded, color: DsColors.orange, size: 18),
                        label: Text('${v.ratingAvg.toStringAsFixed(1)} · ${v.ratingCount} reviews'),
                        onPressed: () => _showReviews(context, v),
                      ),
                    if (d != null) Chip(avatar: const Icon(Icons.schedule_rounded, size: 18), label: Text('${d.etaMinutes} min')),
                    if (d != null) Chip(avatar: const Icon(Icons.delivery_dining_rounded, size: 18), label: Text('${formatMoney(d.deliveryFeeCents)} delivery')),
                    if (v.minOrderCents > 0) Chip(label: Text('Min order ${formatMoney(v.minOrderCents)}')),
                  ],
                ),
                const SizedBox(height: 8),
                InkWell(
                  onTap: () => _showHours(context, v),
                  child: Row(
                    children: [
                      const Icon(Icons.place_outlined, size: 16, color: DsColors.muted),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text('${v.addressLine}${v.landmark != null ? ' · ${v.landmark}' : ''}',
                            style: const TextStyle(fontSize: 13, color: DsColors.muted)),
                      ),
                      const Text('Hours', style: TextStyle(color: DsColors.orange, fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
                if (d != null && !d.deliverable)
                  Container(
                    margin: const EdgeInsets.only(top: 12),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: DsColors.redLight, borderRadius: BorderRadius.circular(12)),
                    child: const Text('This store is too far from your delivery address.', style: TextStyle(color: DsColors.red)),
                  ),
                if (!v.isOpen)
                  Container(
                    margin: const EdgeInsets.only(top: 12),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: DsColors.canvas, borderRadius: BorderRadius.circular(12)),
                    child: const Text("This store is closed right now. You can browse the menu, but ordering opens when they're open."),
                  ),
              ],
            ),
          ),
        ),
        if (menu.sections.isEmpty)
          const SliverFillRemaining(
            hasScrollBody: false,
            child: EmptyView(icon: Icons.restaurant_menu_rounded, title: 'Menu coming soon', message: 'This store has not added products yet.'),
          ),
        for (final section in menu.sections) ...[
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Text(section.name, style: Theme.of(context).textTheme.titleLarge),
            ),
          ),
          SliverList.separated(
            itemCount: section.products.length,
            separatorBuilder: (_, _) => const Divider(indent: 16, endIndent: 16),
            itemBuilder: (context, i) => _ProductTile(vendor: v, product: section.products[i]),
          ),
        ],
        const SliverToBoxAdapter(child: SizedBox(height: 24)),
      ],
    );
  }

  void _showHours(BuildContext context, Vendor v) {
    showModalBottomSheet<void>(
      context: context,
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Opening hours', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            for (var d = 0; d < 7; d++)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    SizedBox(width: 60, child: Text(_dayNames[d], style: const TextStyle(fontWeight: FontWeight.w600))),
                    Text(() {
                      final h = v.openingHours.where((x) => x.dayOfWeek == d).firstOrNull;
                      if (h == null) return 'Closed';
                      return h.opensAt == h.closesAt ? 'Open 24 hours' : '${h.opensAt} – ${h.closesAt}';
                    }()),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  void _showReviews(BuildContext context, Vendor v) {
    final api = context.read<ApiClient>();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.7,
        child: AsyncView<Paged<Review>>(
          refreshable: false,
          load: () async => Paged.fromJson(await api.get('/vendors/${v.id}/reviews', query: {'pageSize': 50}) as Map<String, dynamic>, Review.fromJson),
          builder: (context, data, _) => data.items.isEmpty
              ? const EmptyView(title: 'No reviews yet')
              : ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: data.items.length,
                  separatorBuilder: (_, _) => const Divider(),
                  itemBuilder: (_, i) {
                    final r = data.items[i];
                    return ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Row(children: [
                        for (var s = 1; s <= 5; s++) Icon(s <= r.score ? Icons.star_rounded : Icons.star_border_rounded, color: DsColors.orange, size: 18),
                        const SizedBox(width: 8),
                        Text(r.customerName, style: const TextStyle(fontWeight: FontWeight.w600)),
                      ]),
                      subtitle: Text('${r.comment ?? ''}\n${formatDate(r.createdAt)}'.trim()),
                    );
                  },
                ),
        ),
      ),
    );
  }
}

class _ProductTile extends StatelessWidget {
  const _ProductTile({required this.vendor, required this.product});
  final Vendor vendor;
  final Product product;

  Future<void> _add(BuildContext context) async {
    final cart = context.read<CartController>();
    if (cart.belongsToOtherVendor(vendor.id)) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('Start a new cart?'),
          content: Text('Your cart has items from ${cart.vendorName}. Adding this will clear it.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep cart')),
            TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Start new cart')),
          ],
        ),
      );
      if (ok != true) return;
    }
    cart.add(
      vendorId: vendor.id,
      vendorName: vendor.name,
      productId: product.id,
      name: product.name,
      priceCents: product.priceCents,
      thumbUrl: product.thumbUrl,
    );
  }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartController>();
    final qty = cart.vendorId == vendor.id ? cart.quantityOf(product.id) : 0;
    final canOrder = product.isAvailable && vendor.isOpen;
    final maxQty = product.stockQty;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(product.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                if (product.description != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(product.description!, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: DsColors.muted, fontSize: 13)),
                  ),
                const SizedBox(height: 6),
                Text(formatMoney(product.priceCents), style: const TextStyle(fontWeight: FontWeight.w700, color: DsColors.orange)),
                if (!product.isAvailable)
                  const Text('Sold out', style: TextStyle(color: DsColors.red, fontWeight: FontWeight.w600, fontSize: 12))
                else if (maxQty != null && maxQty <= 5)
                  Text('Only $maxQty left', style: const TextStyle(color: DsColors.red, fontSize: 12)),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Column(
            children: [
              LowDataImage(url: product.imageUrl, thumbUrl: product.thumbUrl, width: 86, height: 86),
              const SizedBox(height: 8),
              if (qty == 0)
                SizedBox(
                  height: 36,
                  child: OutlinedButton(
                    onPressed: canOrder ? () => _add(context) : null,
                    style: OutlinedButton.styleFrom(minimumSize: const Size(86, 36), padding: EdgeInsets.zero),
                    child: const Text('Add'),
                  ),
                )
              else
                _Stepper(
                  quantity: qty,
                  onMinus: () => cart.setQuantity(product.id, qty - 1),
                  onPlus: maxQty != null && qty >= maxQty ? null : () => cart.setQuantity(product.id, qty + 1),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({required this.quantity, required this.onMinus, required this.onPlus});
  final int quantity;
  final VoidCallback onMinus;
  final VoidCallback? onPlus;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 36,
      decoration: BoxDecoration(color: DsColors.orange, borderRadius: BorderRadius.circular(12)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            visualDensity: VisualDensity.compact,
            onPressed: onMinus,
            icon: const Icon(Icons.remove_rounded, color: Colors.white, size: 18),
            tooltip: 'Remove one',
          ),
          Text('$quantity', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
          IconButton(
            visualDensity: VisualDensity.compact,
            onPressed: onPlus,
            icon: Icon(Icons.add_rounded, color: onPlus == null ? Colors.white54 : Colors.white, size: 18),
            tooltip: 'Add one',
          ),
        ],
      ),
    );
  }
}

class _CartBar extends StatelessWidget {
  const _CartBar();

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartController>();
    if (cart.isEmpty) return const SizedBox.shrink();
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
        child: FilledButton(
          onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const CheckoutScreen())),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(8)),
                child: Text('${cart.itemCount}'),
              ),
              const SizedBox(width: 12),
              Expanded(child: Text('View cart · ${cart.vendorName ?? ''}', overflow: TextOverflow.ellipsis)),
              Text(formatMoney(cart.subtotalCents)),
            ],
          ),
        ),
      ),
    );
  }
}
