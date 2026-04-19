import React, { useState, useMemo } from 'react';
import { ShoppingCart as CartIcon, Search, Plus, Minus, CreditCard, Banknote, Check, ArrowRight, Package, X } from 'lucide-react';
import Button from '../../../shared/Button';
import Modal from '../../../shared/Modal';
import { formatCurrency } from '../../../lib/utils';
import { useNotifications } from '../../../context/NotificationContext';

const InvoiceBuilder = ({ products, clients, onPlaceSale, currentTenantId }) => {
  const { addNotification } = useNotifications();
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('WALKIN');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredProducts = useMemo(() => {
    return products.filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.sku.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [products, searchTerm]);

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        return prev.map(item => item.productId === product.id 
          ? { ...item, quantity: item.quantity + 1 } 
          : item
        );
      }
      return [...prev, { 
        productId: product.id, 
        name: product.name, 
        price: product.sellingPrice, 
        quantity: 1,
        taxRate: product.taxRate || 0
      }];
    });
  };

  const updateQuantity = (productId, delta) => {
    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        return { ...item, quantity: Math.max(0, item.quantity + delta) };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const tax = cart.reduce((acc, item) => acc + (item.price * item.quantity * (item.taxRate / 100)), 0);
  const total = subtotal + tax;

  const handleCompleteSale = async () => {
    if (isSubmitting) return;
    if (cart.length === 0) {
      addNotification('Cart is empty', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      const saleData = {
        id: `SAL-${Date.now()}`,
        clientId: selectedClientId,
        items: cart,
        totalAmount: total,
        paidAmount: paymentMethod === 'CASH' ? total : 0,
        paymentMethod,
        status: 'COMPLETED'
      };
      const result = await onPlaceSale(saleData);
      if (result && result.error) {
        const msg = result.error.message || 'Sale could not be recorded';
        addNotification(`Checkout failed: ${msg}`, 'error');
        return; // keep cart + modal so user can retry
      }
      addNotification(`Sale recorded: ${formatCurrency(total)}`, 'success');
      setCart([]);
      setShowPaymentModal(false);
    } catch (err) {
      addNotification(`Checkout error: ${err.message || err}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-200px)]">
      {/* Product Selection Area */}
      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Search products by name or SKU..." 
            className="w-full bg-white rounded-2xl py-4 pl-12 pr-4 border border-black/5 outline-none focus:ring-2 focus:ring-accent-signature/20 shadow-sm font-medium"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto pr-2 pb-4">
          {filteredProducts.map(product => (
            <div 
              key={product.id} 
              onClick={() => addToCart(product)}
              className="glass-panel !p-4 cursor-pointer hover:border-accent-signature/30 transition-all hover:shadow-lg group"
            >
              <div className="aspect-square bg-canvas rounded-xl mb-3 flex items-center justify-center overflow-hidden border border-black/5">
                {product.image ? (
                  <img src={product.image} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                ) : (
                  <Package size={32} className="opacity-10 group-hover:scale-110 transition-transform" />
                )}
              </div>
              <div className="font-bold text-xs text-ink-primary line-clamp-2 mb-1 uppercase tracking-tight">{product.name}</div>
              <div className="text-lg font-black text-accent-signature leading-none">{formatCurrency(product.sellingPrice)}</div>
              <div className="mt-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">{product.stock} in stock</div>
            </div>
          ))}
        </div>
      </div>

      {/* Cart Area */}
      <div className="w-full lg:w-96 glass-panel !p-0 flex flex-col overflow-hidden border-l border-black/5 shadow-2xl">
        <div className="p-6 border-b border-black/5 flex justify-between items-center bg-canvas/30">
          <div className="flex items-center gap-3">
            <CartIcon size={20} className="text-accent-signature" />
            <h2 className="font-bold text-sm uppercase tracking-widest">Active Cart</h2>
          </div>
          <div className="bg-accent-signature text-button-text text-[10px] font-black px-2 py-1 rounded-pill ring-4 ring-accent-signature/10">
            {cart.reduce((acc, i) => acc + i.quantity, 0)} ITEMS
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {cart.map(item => (
            <div key={item.productId} className="flex justify-between items-center group">
              <div className="flex-1">
                <div className="text-xs font-bold text-ink-primary uppercase truncate pr-4">{item.name}</div>
                <div className="text-gray-400 text-[10px] font-bold mt-1">{formatCurrency(item.price)} per unit</div>
              </div>
              <div className="flex items-center gap-3 bg-canvas p-1 rounded-pill">
                <button 
                  onClick={() => updateQuantity(item.productId, -1)}
                  className="w-6 h-6 rounded-pill flex items-center justify-center hover:bg-white transition-all text-ink-primary"
                >
                  <Minus size={12} strokeWidth={3} />
                </button>
                <span className="text-xs font-black min-w-[20px] text-center">{item.quantity}</span>
                <button 
                  onClick={() => addToCart(products.find(p => p.id === item.productId))}
                  className="w-6 h-6 rounded-pill bg-white flex items-center justify-center hover:bg-accent-signature transition-all text-ink-primary shadow-sm"
                >
                  <Plus size={12} strokeWidth={3} />
                </button>
              </div>
            </div>
          ))}
          {cart.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center opacity-30 pointer-events-none p-10 text-center">
              <Package size={48} className="mb-4" />
              <div className="text-xs font-bold uppercase tracking-widest">Cart is empty</div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-black/5 bg-canvas/10">
          <div className="space-y-2 mb-6">
            <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              <span>VAT / Tax</span>
              <span>{formatCurrency(tax)}</span>
            </div>
            <div className="flex justify-between text-xl font-black text-ink-primary pt-2 border-t border-black/5">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>
          
          <Button 
            disabled={cart.length === 0}
            onClick={() => setShowPaymentModal(true)}
            className="w-full !rounded-xl !h-14 shadow-xl"
            icon={ArrowRight}
          >
            CHECKOUT
          </Button>
        </div>
      </div>

      <Modal isOpen={showPaymentModal} onClose={() => setShowPaymentModal(false)} title="COMPLETE TRANSACTION" subtitle="SELECT PAYMENT METHOD">
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div 
            onClick={() => setPaymentMethod('CASH')}
            className={`p-10 rounded-3xl border-2 transition-all cursor-pointer flex flex-col items-center gap-4 ${paymentMethod === 'CASH' ? 'border-accent-signature bg-accent-signature/5 shadow-premium' : 'border-black/5 hover:border-black/10'}`}
          >
            <div className={`p-4 rounded-2xl ${paymentMethod === 'CASH' ? 'bg-accent-signature text-button-text' : 'bg-canvas text-gray-400'}`}>
              <Banknote size={32} />
            </div>
            <span className="text-xs font-black uppercase tracking-widest">Cash Payment</span>
          </div>
          <div 
            onClick={() => setPaymentMethod('CREDIT')}
            className={`p-10 rounded-3xl border-2 transition-all cursor-pointer flex flex-col items-center gap-4 ${paymentMethod === 'CREDIT' ? 'border-accent-signature bg-accent-signature/5 shadow-premium' : 'border-black/5 hover:border-black/10'}`}
          >
            <div className={`p-4 rounded-2xl ${paymentMethod === 'CREDIT' ? 'bg-accent-signature text-button-text' : 'bg-canvas text-gray-400'}`}>
              <CreditCard size={32} />
            </div>
            <span className="text-xs font-black uppercase tracking-widest">Client Credit</span>
          </div>
        </div>
        <div className="mt-8 bg-canvas rounded-2xl p-6 border border-black/5">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Amount Due</span>
            <span className="text-sm font-black text-accent-signature">{formatCurrency(total)}</span>
          </div>
          <p className="text-[9px] text-gray-400 italic">Verify amount before finalizing the sale.</p>
        </div>
        <Button
          onClick={handleCompleteSale}
          disabled={isSubmitting || cart.length === 0}
          className="w-full !mt-8 !h-14 !rounded-xl"
          icon={Check}
        >
          {isSubmitting ? 'PROCESSING...' : `FINALIZE ORDER (${formatCurrency(total)})`}
        </Button>
      </Modal>
    </div>
  );
};

export default InvoiceBuilder;
