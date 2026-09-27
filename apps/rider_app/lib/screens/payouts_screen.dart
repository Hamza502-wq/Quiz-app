import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/rider_controller.dart';

class PayoutsScreen extends StatefulWidget {
  const PayoutsScreen({super.key, this.openRequest = false});
  final bool openRequest;

  @override
  State<PayoutsScreen> createState() => _PayoutsScreenState();
}

class _PayoutsScreenState extends State<PayoutsScreen> {
  final _key = GlobalKey<AsyncViewState<Paged<Payout>>>();

  @override
  void initState() {
    super.initState();
    if (widget.openRequest) WidgetsBinding.instance.addPostFrameCallback((_) => _request());
  }

  Future<void> _request() async {
    final created = await showModalBottomSheet<bool>(context: context, isScrollControlled: true, builder: (_) => const _PayoutRequestSheet());
    if (created == true) {
      await _key.currentState?.reload();
      if (mounted) context.read<RiderController>().refresh();
    }
  }

  Color _statusColor(String s) => switch (s) {
        'PAID' => DsColors.green,
        'REJECTED' => DsColors.red,
        'PROCESSING' => const Color(0xFF1D4ED8),
        _ => const Color(0xFFB7791F),
      };

  @override
  Widget build(BuildContext context) {
    final api = context.read<ApiClient>();
    return Scaffold(
      appBar: AppBar(title: const Text('Payouts')),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: DsColors.orange,
        foregroundColor: Colors.white,
        onPressed: _request,
        icon: const Icon(Icons.send_to_mobile_rounded),
        label: const Text('Request payout'),
      ),
      body: AsyncView<Paged<Payout>>(
        key: _key,
        load: () async => Paged.fromJson(await api.get('/rider/payouts', query: {'pageSize': 50}) as Map<String, dynamic>, Payout.fromJson),
        builder: (context, data, _) => ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
          children: [
            const SectionCard(
              child: Text(
                'Payouts are sent weekly to your EcoCash, OneMoney or bank account. Any cash you owe from cash orders is deducted first.',
                style: TextStyle(color: DsColors.inkSoft),
              ),
            ),
            const SizedBox(height: 12),
            if (data.items.isEmpty)
              const EmptyView(icon: Icons.account_balance_wallet_outlined, title: 'No payouts yet')
            else
              for (final p in data.items)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Card(
                    child: ListTile(
                      title: Text(formatMoney(p.amountCents), style: const TextStyle(fontWeight: FontWeight.w800)),
                      subtitle: Text(
                        '${paymentLabel(p.method)} · ${p.accountNumber}\n${formatDate(p.requestedAt)}${p.isAutomatic ? ' · weekly' : ''}${p.reference != null ? ' · ref ${p.reference}' : ''}${p.notes != null ? '\n${p.notes}' : ''}',
                      ),
                      isThreeLine: true,
                      trailing: Text(p.status.toLowerCase(), style: TextStyle(color: _statusColor(p.status), fontWeight: FontWeight.w700)),
                    ),
                  ),
                ),
          ],
        ),
      ),
    );
  }
}

class _PayoutRequestSheet extends StatefulWidget {
  const _PayoutRequestSheet();

  @override
  State<_PayoutRequestSheet> createState() => _PayoutRequestSheetState();
}

class _PayoutRequestSheetState extends State<_PayoutRequestSheet> {
  late final RiderProfile? _rider = context.read<RiderController>().rider;
  late final WalletSummary? _wallet = context.read<RiderController>().dashboard?.wallet;
  late String _method = _rider?.payoutMethod ?? 'ECOCASH';
  late final _account = TextEditingController(text: _rider?.payoutAccount ?? '');
  late final _accountName = TextEditingController(text: _rider?.payoutAccountName ?? _rider?.name ?? '');
  late final _bank = TextEditingController(text: _rider?.payoutBankName ?? '');
  late final _amount = TextEditingController(text: _wallet == null ? '' : (_wallet.availableForPayoutCents / 100).toStringAsFixed(2));
  bool _saveDetails = true;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_account, _accountName, _bank, _amount]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    final cents = parseMoney(_amount.text);
    if (cents == null || cents <= 0) return setState(() => _error = 'Enter a valid amount');
    if (_account.text.trim().length < 5) return setState(() => _error = 'Enter your account or mobile number');
    if (_method == 'BANK' && _bank.text.trim().isEmpty) return setState(() => _error = 'Enter your bank name');
    setState(() {
      _busy = true;
      _error = null;
    });
    final api = context.read<ApiClient>();
    final navigator = Navigator.of(context);
    try {
      if (_saveDetails) {
        await api.patch('/rider/me', body: {
          'payoutMethod': _method,
          'payoutAccount': _account.text.trim(),
          if (_accountName.text.trim().isNotEmpty) 'payoutAccountName': _accountName.text.trim(),
          if (_method == 'BANK') 'payoutBankName': _bank.text.trim(),
        });
      }
      await api.post('/rider/payouts', body: {
        'amountCents': cents,
        'method': _method,
        'accountNumber': _account.text.trim(),
        if (_accountName.text.trim().isNotEmpty) 'accountName': _accountName.text.trim(),
        if (_method == 'BANK') 'bankName': _bank.text.trim(),
      });
      if (!mounted) return;
      showSnack(context, 'Payout requested — we’ll notify you when it’s sent.');
      navigator.pop(true);
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Request payout', style: Theme.of(context).textTheme.titleLarge),
              if (_wallet != null) Text('Available: ${formatMoney(_wallet.availableForPayoutCents)}', style: const TextStyle(color: DsColors.muted)),
              const SizedBox(height: 16),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'ECOCASH', label: Text('EcoCash')),
                  ButtonSegment(value: 'ONEMONEY', label: Text('OneMoney')),
                  ButtonSegment(value: 'BANK', label: Text('Bank')),
                ],
                selected: {_method},
                showSelectedIcon: false,
                onSelectionChanged: (s) => setState(() => _method = s.first),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _account,
                keyboardType: _method == 'BANK' ? TextInputType.number : TextInputType.phone,
                decoration: InputDecoration(labelText: _method == 'BANK' ? 'Account number' : '${paymentLabel(_method)} number'),
              ),
              const SizedBox(height: 12),
              TextField(controller: _accountName, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Account name')),
              if (_method == 'BANK') ...[
                const SizedBox(height: 12),
                TextField(controller: _bank, decoration: const InputDecoration(labelText: 'Bank name')),
              ],
              const SizedBox(height: 12),
              TextField(
                controller: _amount,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Amount', prefixText: 'US\$ '),
              ),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: _saveDetails,
                onChanged: (v) => setState(() => _saveDetails = v ?? true),
                title: const Text('Save these details for weekly payouts'),
              ),
              if (_error != null) Text(_error!, style: const TextStyle(color: DsColors.red)),
              const SizedBox(height: 8),
              PrimaryButton(label: 'Request payout', loading: _busy, onPressed: _submit),
            ],
          ),
        ),
      ),
    );
  }
}
