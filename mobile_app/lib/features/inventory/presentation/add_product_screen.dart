import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/database/database.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/widgets/barcode_scanner_screen.dart';
import 'package:mobile_app/features/inventory/presentation/providers/inventory_provider.dart';

class AddProductScreen extends ConsumerStatefulWidget {
  final Product? product; // non-null = edit mode

  const AddProductScreen({super.key, this.product});

  @override
  ConsumerState<AddProductScreen> createState() => _AddProductScreenState();
}

class _AddProductScreenState extends ConsumerState<AddProductScreen> {
  final _nameController = TextEditingController();
  final _skuController = TextEditingController();
  final _costController = TextEditingController();
  final _sellingController = TextEditingController();
  final _stockController = TextEditingController();
  final _alertController = TextEditingController();
  final _categoryController = TextEditingController();
  final _barcodeController = TextEditingController();
  bool _isLoading = false;

  // EAN-13 check digit for a 12-digit body.
  static String _ean13Check(String body12) {
    var sum = 0;
    for (var i = 0; i < 12; i++) {
      final d = int.parse(body12[i]);
      sum += (i % 2 == 0) ? d : d * 3;
    }
    return ((10 - (sum % 10)) % 10).toString();
  }

  // Internal EAN-13 (GS1 in-store prefix 21 + random body + check digit).
  void _assignBarcode() {
    final rnd = DateTime.now().microsecondsSinceEpoch % 10000000000;
    final body = '21${rnd.toString().padLeft(10, '0')}';
    setState(() => _barcodeController.text = body + _ean13Check(body));
  }

  Future<void> _scanBarcodeIntoField() async {
    final code = await Navigator.push<String>(
      context,
      MaterialPageRoute(builder: (_) => const BarcodeScannerScreen(title: 'Scan barcode')),
    );
    if (code != null && code.isNotEmpty && mounted) {
      setState(() => _barcodeController.text = code);
    }
  }

  String _selectedUnit = 'pcs';
  String _selectedTaxSlab = '0% (Exempt)';
  double _taxRate = 0.0;
  double _cessRate = 0.0;
  final _hsnController = TextEditingController();

  // GST rate + Compensation Cess combinations (ad-valorem %). Mirrors the
  // web TAX_SLABS_WITH_CESS so both platforms capture cess at source.
  static const List<Map<String, dynamic>> _taxSlabs = [
    {'label': '0% (Exempt)',        'rate': 0.0,  'cess': 0.0},
    {'label': 'GST 5%',             'rate': 5.0,  'cess': 0.0},
    {'label': 'GST 12%',            'rate': 12.0, 'cess': 0.0},
    {'label': 'GST 18%',            'rate': 18.0, 'cess': 0.0},
    {'label': 'GST 28%',            'rate': 28.0, 'cess': 0.0},
    {'label': 'GST 28% + 1% Cess',  'rate': 28.0, 'cess': 1.0},
    {'label': 'GST 28% + 3% Cess',  'rate': 28.0, 'cess': 3.0},
    {'label': 'GST 28% + 12% Cess', 'rate': 28.0, 'cess': 12.0},
    {'label': 'GST 28% + 15% Cess', 'rate': 28.0, 'cess': 15.0},
    {'label': 'GST 28% + 17% Cess', 'rate': 28.0, 'cess': 17.0},
    {'label': 'GST 28% + 22% Cess', 'rate': 28.0, 'cess': 22.0},
    {'label': 'GST 28% + 60% Cess', 'rate': 28.0, 'cess': 60.0},
  ];

  bool get _isEditMode => widget.product != null;

  @override
  void initState() {
    super.initState();
    final p = widget.product;
    if (p != null) {
      _nameController.text = p.name;
      _skuController.text = p.sku ?? '';
      _categoryController.text = p.category ?? '';
      _costController.text = p.costPrice.toStringAsFixed(2);
      _sellingController.text = p.sellingPrice.toStringAsFixed(2);
      _stockController.text = p.stock.toStringAsFixed(0);
      _selectedUnit = p.unit ?? 'pcs';
      _taxRate = p.taxRate;
      _cessRate = p.cessRate;
      _hsnController.text = p.hsnCode ?? '';
      final match = _taxSlabs.firstWhere(
        (s) => s['rate'] == _taxRate && s['cess'] == _cessRate,
        orElse: () => _taxSlabs.first,
      );
      _selectedTaxSlab = match['label'] as String;
      supabase
          .from('products')
          .select('barcode').isFilter('deleted_at', null)
          .eq('id', p.id)
          .maybeSingle()
          .then((row) {
        if (mounted && row != null && (row['barcode'] ?? '') != '') {
          setState(() => _barcodeController.text = row['barcode'] as String);
        }
      }, onError: (_) {});
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _skuController.dispose();
    _costController.dispose();
    _sellingController.dispose();
    _stockController.dispose();
    _alertController.dispose();
    _categoryController.dispose();
    _barcodeController.dispose();
    _hsnController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_nameController.text.isEmpty || _skuController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Name and SKU required'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    final tenantCtx = ref.read(tenantContextProvider).valueOrNull;
    final repo = ref.read(productRepositoryProvider);

    setState(() => _isLoading = true);
    try {
      if (_isEditMode) {
        // Edit mode — update via repository (offline-first)
        final updated = widget.product!.copyWith(
          name: _nameController.text.trim(),
          sku: Value(_skuController.text.trim()),
          category: Value(_categoryController.text.trim().isEmpty
              ? 'Other'
              : _categoryController.text.trim()),
          unit: Value(_selectedUnit),
          costPrice: double.tryParse(_costController.text) ?? 0.0,
          sellingPrice: double.tryParse(_sellingController.text) ?? 0.0,
          stock: double.tryParse(_stockController.text) ?? 0.0,
          taxRate: _taxRate,
          cessRate: _cessRate,
          hsnCode: Value(_hsnController.text.trim().isEmpty ? null : _hsnController.text.trim()),
        );
        await repo.updateProduct(updated);
        // Barcode column exists only on Supabase (not in the drift cache).
        final bc = _barcodeController.text.trim();
        await supabase.from('products')
            .update({
              'barcode': bc.isEmpty ? null : bc,
              'cess_rate': _cessRate,
              'hsn_code': _hsnController.text.trim().isEmpty ? null : _hsnController.text.trim(),
            })
            .eq('id', widget.product!.id);
      } else {
        // Add mode — insert via Supabase directly.
        // Column names are camelCase to match the products table
        // (costPrice/sellingPrice/lowStockThreshold/taxRate/taxSlab); snake_case
        // keys 404 in the PostgREST schema cache (PGRST204). id is a text PK with
        // no default, so generate it the same way the web app does.
        final id = 'PROD-${DateTime.now().millisecondsSinceEpoch}-'
            '${(1000 + (DateTime.now().microsecond % 9000))}';
        await supabase.from('products').insert({
          'id': id,
          'name': _nameController.text.trim(),
          'sku': _skuController.text.trim(),
          'costPrice': double.tryParse(_costController.text) ?? 0.0,
          'sellingPrice': double.tryParse(_sellingController.text) ?? 0.0,
          'stock': double.tryParse(_stockController.text) ?? 0.0,
          'lowStockThreshold': double.tryParse(_alertController.text) ?? 10.0,
          'category': _categoryController.text.trim().isEmpty
              ? 'Other'
              : _categoryController.text.trim(),
          'unit': _selectedUnit,
          'taxRate': _taxRate,
          'taxSlab': _selectedTaxSlab,
          'cess_rate': _cessRate,
          'hsn_code': _hsnController.text.trim().isEmpty ? null : _hsnController.text.trim(),
          'barcode': _barcodeController.text.trim().isEmpty ? null : _barcodeController.text.trim(),
          'tenant_id': tenantCtx?.tenantId,
        });
      }

      if (mounted) {
        ref.invalidate(productsProvider);
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(_isEditMode ? 'Product updated' : 'Product added'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
                'May not have saved. Check the product list before trying again. ($e)'),
            backgroundColor: Bl.redDeep,
            behavior: SnackBarBehavior.floating,
            duration: const Duration(seconds: 8),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  int _step = 0;

  static const _units = ['pcs', 'kg', 'ltr', 'box', 'set', 'dozen'];

  void _toast(String msg) => ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), behavior: SnackBarBehavior.floating));

  void _next() {
    if (_step == 0 &&
        (_nameController.text.trim().isEmpty ||
            _skuController.text.trim().isEmpty)) {
      _toast('Enter the product name and SKU first.');
      return;
    }
    if (_step < 2) {
      FocusScope.of(context).unfocus();
      setState(() => _step++);
    } else {
      _submit();
    }
  }

  void _back() {
    if (_step == 0) {
      Navigator.maybePop(context);
    } else {
      setState(() => _step--);
    }
  }

  Future<void> _pickCategory() async {
    final known = <String>{
      'Other',
      for (final p in ref.read(productsProvider).valueOrNull ?? const <Product>[])
        if ((p.category ?? '').trim().isNotEmpty) p.category!.trim(),
    }.toList()
      ..sort();
    const addNew = 'New category…';
    final picked = await showBlPicker(context,
        title: 'Category',
        options: [...known, addNew],
        selected: _categoryController.text.trim().isEmpty
            ? 'Other'
            : _categoryController.text.trim());
    if (picked == null || !mounted) return;
    if (picked != addNew) {
      setState(() => _categoryController.text = picked);
      return;
    }
    final ctrl = TextEditingController();
    final name = await showBlCustomDialog<String>(
      context: context,
      builder: (ctx) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('New category', style: Bl.tight(16, w: FontWeight.w700)),
          BlField(
              label: 'Name',
              hint: 'e.g. Groceries',
              controller: ctrl,
              capitalization: TextCapitalization.words),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: BlButton('Cancel',
                    kind: BlButtonKind.soft, onTap: () => Navigator.pop(ctx)),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: BlButton('Use it',
                    onTap: () => Navigator.pop(ctx, ctrl.text.trim())),
              ),
            ],
          ),
        ],
      ),
    );
    if (name != null && name.isNotEmpty && mounted) {
      setState(() => _categoryController.text = name);
    }
  }

  Future<void> _pickTax() async {
    final picked = await showBlPicker(context,
        title: 'Tax slab (GST + Cess)',
        options: _taxSlabs.map((m) => m['label'].toString()).toList(),
        selected: _selectedTaxSlab);
    if (picked == null || !mounted) return;
    final slab = _taxSlabs.firstWhere((s) => s['label'] == picked,
        orElse: () => _taxSlabs.first);
    setState(() {
      _selectedTaxSlab = picked;
      _taxRate = (slab['rate'] as num).toDouble();
      _cessRate = (slab['cess'] as num).toDouble();
    });
  }

  static final _money = [
    FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d{0,2}')),
  ];

  List<Widget> _detailsStep() => [
        BlField(
          label: 'Product name',
          hint: 'e.g. Premium Basmati Rice',
          controller: _nameController,
          capitalization: TextCapitalization.words,
        ),
        BlField(
          label: 'SKU',
          hint: 'e.g. RICE-5KG-001',
          controller: _skuController,
          capitalization: TextCapitalization.characters,
        ),
        BlField(
          label: 'Barcode',
          hint: 'Scan or type',
          controller: _barcodeController,
          keyboardType: TextInputType.number,
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              BlTap(
                label: 'Make a barcode',
                onTap: _assignBarcode,
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 12),
                  child: Text('Make one',
                      style: Bl.tight(12.5,
                          w: FontWeight.w600,
                          ls: 0,
                          c: const Color(0xFFB86A0A))),
                ),
              ),
              BlTap(
                label: 'Scan barcode',
                onTap: _scanBarcodeIntoField,
                child: Padding(
                  padding: const EdgeInsets.all(7),
                  child: Container(
                    width: 30,
                    height: 30,
                    alignment: Alignment.center,
                    decoration: const BoxDecoration(
                        color: Bl.well, shape: BoxShape.circle),
                    child: const BlIcon(BlIcons.scan, size: 14),
                  ),
                ),
              ),
            ],
          ),
        ),
        BlField(
          label: 'Category',
          value: _categoryController.text.trim().isEmpty
              ? 'Other'
              : _categoryController.text.trim(),
          onTap: _pickCategory,
        ),
      ];

  List<Widget> _pricingStep() {
    final cost = double.tryParse(_costController.text) ?? 0;
    final sell = double.tryParse(_sellingController.text) ?? 0;
    final has = cost > 0 && sell > 0;
    final margin = has ? (sell - cost) / sell * 100 : 0.0;
    final bad = has && sell <= cost;
    return [
      Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: BlField(
              label: 'Cost price',
              hint: '0.00',
              prefix: '₹',
              controller: _costController,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: _money,
              onChanged: (_) => setState(() {}),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: BlField(
              label: 'Selling price',
              hint: '0.00',
              prefix: '₹',
              controller: _sellingController,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: _money,
              onChanged: (_) => setState(() {}),
            ),
          ),
        ],
      ),
      Container(
        margin: const EdgeInsets.only(top: 10),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
            color: bad ? const Color(0xFFFFF8E1) : const Color(0xFFF1F8F3),
            borderRadius: BorderRadius.circular(12)),
        child: Row(
          children: [
            BlIcon('<path d="M4 17l6-6 4 4 6-8"/>',
                size: 15,
                color: bad ? const Color(0xFF6B4E00) : const Color(0xFF17663A)),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                  !has
                      ? 'Your margin shows here once both prices are filled.'
                      : bad
                          ? 'Selling at or below cost. You make nothing on this item.'
                          : 'Margin ${margin.toStringAsFixed(1)}% · you make ₹${(sell - cost).toStringAsFixed(2)} on each.',
                  style: Bl.inter(12.5,
                      w: FontWeight.w500,
                      c: bad
                          ? const Color(0xFF6B4E00)
                          : const Color(0xFF17663A))),
            ),
          ],
        ),
      ),
      BlField(
          label: 'Tax slab (GST + Cess)',
          value: _selectedTaxSlab,
          onTap: _pickTax),
      BlField(
        label: 'HSN / SAC code',
        hint: 'e.g. 39231090',
        controller: _hsnController,
        keyboardType: TextInputType.number,
      ),
    ];
  }

  List<Widget> _stockStep() => [
        BlField(
          label: 'Current stock',
          hint: '0',
          controller: _stockController,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
        ),
        // The alert level is set when the product is created; the app has no
        // way to change it afterwards yet, so it is not offered on edit.
        if (!_isEditMode)
          BlField(
            label: 'Low stock alert',
            hint: '10',
            controller: _alertController,
            keyboardType: TextInputType.number,
            helper: 'We mark the product Low when stock falls to this number.',
          ),
        Padding(
          padding: const EdgeInsets.only(top: 16, bottom: 8),
          child: Text('Unit of measure',
              style: Bl.tight(13, w: FontWeight.w600, ls: 0, c: Bl.ink3)),
        ),
        BlChoicePills(
          options: [
            ..._units,
            if (!_units.contains(_selectedUnit)) _selectedUnit,
          ],
          selected: _selectedUnit,
          onChanged: (v) => setState(() => _selectedUnit = v),
        ),
      ];

  @override
  Widget build(BuildContext context) {
    const questions = [
      'What are you adding?',
      'Set the price',
      'How much do you have?',
    ];
    return PopScope(
      canPop: _step == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: BlStepFrame(
        title: _isEditMode ? 'Edit Product' : 'Add Product',
        step: _step,
        stepNames: const ['Details', 'Pricing', 'Stock'],
        question: _isEditMode && _step == 0
            ? 'What is this product?'
            : questions[_step],
        onBack: _back,
        loading: _isLoading,
        onNext: _isLoading ? null : _next,
        buttonLabel: switch (_step) {
          0 => 'Next: pricing',
          1 => 'Next: stock',
          _ => _isEditMode ? 'Save changes' : 'Add to inventory',
        },
        children: switch (_step) {
          0 => _detailsStep(),
          1 => _pricingStep(),
          _ => _stockStep(),
        },
      ),
    );
  }
}
