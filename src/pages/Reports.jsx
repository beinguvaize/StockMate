import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { Calendar, FileText, Download, Printer, TrendingUp, Package, Receipt, ArrowUpRight, ArrowDownRight, X, Check } from 'lucide-react';

const Reports = () => {
    const { orders, movementLog, expenses, businessProfile, shops } = useAppContext();
    const [dateRange, setDateRange] = useState('MONTH');
    const [activeTab, setActiveTab] = useState('SALES');
    const [invoiceOrder, setInvoiceOrder] = useState(null);

    // Filter Logic
    const filterByDate = (items, dateKey) => {
        if (dateRange === 'ALL') return items;
        const now = new Date();
        const past = new Date();

        if (dateRange === 'TODAY') past.setHours(0, 0, 0, 0);
        else if (dateRange === 'WEEK') past.setDate(now.getDate() - 7);
        else if (dateRange === 'MONTH') past.setMonth(now.getMonth() - 1);

        return items.filter(item => new Date(item[dateKey]) >= past);
    };

    const filteredOrders = useMemo(() => filterByDate(orders, 'date'), [orders, dateRange]);
    const filteredMovements = useMemo(() => filterByDate(movementLog, 'date'), [movementLog, dateRange]);
    const filteredExpenses = useMemo(() => filterByDate(expenses, 'date'), [expenses, dateRange]);

    // Sales Metrics
    const totalSalesVol = filteredOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const cashSales = filteredOrders.filter(o => o.paymentMethod === 'CASH').reduce((sum, o) => sum + o.totalAmount, 0);
    const creditSales = filteredOrders.filter(o => o.paymentMethod === 'CREDIT').reduce((sum, o) => sum + o.totalAmount, 0);
    const totalCogs = filteredOrders.reduce((sum, o) => sum + (o.totalCogs || 0), 0);
    const grossMargin = totalSalesVol - totalCogs;

    // Movement Metrics
    const itemsIn = filteredMovements.filter(m => m.type === 'IN').reduce((sum, m) => sum + m.quantity, 0);
    const itemsOut = filteredMovements.filter(m => m.type === 'OUT').reduce((sum, m) => sum + m.quantity, 0);

    // Expense Metrics
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Sales Attribution Metrics
    const attributionByRep = filteredOrders.reduce((acc, order) => {
        if (order.status !== 'CANCELLED' && order.bookedBy) {
            acc[order.bookedBy] = (acc[order.bookedBy] || 0) + order.totalAmount;
        }
        return acc;
    }, {});

    const attributionByFleet = filteredOrders.reduce((acc, order) => {
        if (order.status === 'COMPLETED' && order.deliveredBy) {
            acc[order.deliveredBy] = (acc[order.deliveredBy] || 0) + order.totalAmount;
        }
        return acc;
    }, {});

    const handlePrint = () => {
        window.print();
    };

    const handlePrintInvoice = () => {
        window.print();
    };

    const getClientName = (shopId) => {
        if (shopId === 'POS-WALKIN') return 'Walk-in Customer';
        const shop = shops.find(s => s.id === shopId);
        return shop ? shop.name : shopId;
    };

    return (
        <div className="page-container animate-fade-in print-area" style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
            <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 className="page-title">Business Reports</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Generate and export data across your operations.</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'var(--surface)', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <Calendar size={18} className="text-muted" />
                        <select className="input-field" style={{ border: 'none', backgroundColor: 'transparent', padding: 0 }} value={dateRange} onChange={e => setDateRange(e.target.value)}>
                            <option value="TODAY">Today</option>
                            <option value="WEEK">Last 7 Days</option>
                            <option value="MONTH">Last 30 Days</option>
                            <option value="ALL">All Time</option>
                        </select>
                    </div>
                    <button className="btn btn-primary" onClick={handlePrint}><Printer size={18} /> Print Report</button>
                </div>
            </div>

            {/* Print Header */}
            <div className="print-only" style={{ display: 'none', marginBottom: '2rem', textAlign: 'center' }}>
                <h2>{businessProfile.name} - Official Report</h2>
                <p>Period: {dateRange} | Generated: {new Date().toLocaleDateString()}</p>
            </div>

            {/* Top Level KPI Cards */}
            <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', marginBottom: '2rem' }}>
                <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid var(--primary)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Total Revenue</span>
                        <TrendingUp size={16} className="text-primary" />
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>{businessProfile.currencySymbol}{totalSalesVol.toFixed(2)}</div>
                    <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', color: 'var(--success)' }}>Gross Margin: {businessProfile.currencySymbol}{grossMargin.toFixed(2)}</div>
                </div>

                <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid var(--warning)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Cash / Credit Split</span>
                        <FileText size={16} className="text-warning" />
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                        <span style={{ color: 'var(--success)' }}>{businessProfile.currencySymbol}{cashSales.toFixed(2)}</span> / <span style={{ color: 'var(--danger)' }}>{businessProfile.currencySymbol}{creditSales.toFixed(2)}</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>Actual Cash vs Accounts Receivable</div>
                </div>

                <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid var(--danger)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Total Expenses</span>
                        <Receipt size={16} className="text-danger" />
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>{businessProfile.currencySymbol}{totalExpenses.toFixed(2)}</div>
                    <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>Operating Costs</div>
                </div>

                <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid var(--success)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Stock Movement Volume</span>
                        <Package size={16} className="text-success" />
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                        <span style={{ color: 'var(--success)' }}><ArrowDownRight size={14} /> {itemsIn} IN</span>  <span style={{ color: 'var(--danger)', marginLeft: '1rem' }}><ArrowUpRight size={14} /> {itemsOut} OUT</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>Total Unit Velocity</div>
                </div>
            </div>

            {/* Attribution Breakdown Cards */}
            <div className="grid-cards no-print" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', marginBottom: '2rem' }}>
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                        <span>Sales by Representative</span>
                        <FileText size={16} className="text-primary" />
                    </div>
                    {Object.keys(attributionByRep).length === 0 ? (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No attributed rep sales.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {Object.entries(attributionByRep).sort((a, b) => b[1] - a[1]).map(([rep, amount]) => (
                                <div key={rep} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'var(--surface)', borderRadius: '12px' }}>
                                    <span style={{ fontWeight: 600 }}>{rep}</span>
                                    <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{businessProfile.currencySymbol}{amount.toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                        <span>Sales by Fleet / Route</span>
                        <Package size={16} className="text-warning" />
                    </div>
                    {Object.keys(attributionByFleet).length === 0 ? (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No attributed fleet sales.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {Object.entries(attributionByFleet).sort((a, b) => b[1] - a[1]).map(([fleet, amount]) => (
                                <div key={fleet} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'var(--surface)', borderRadius: '12px' }}>
                                    <span style={{ fontWeight: 600 }}>Vehicle: {fleet}</span>
                                    <span style={{ fontWeight: 700, color: 'var(--warning)' }}>{businessProfile.currencySymbol}{amount.toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="no-print" style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
                <button
                    style={{ padding: '0.75rem 1.5rem', background: 'none', border: 'none', borderBottom: activeTab === 'SALES' ? '2px solid var(--primary)' : '2px solid transparent', color: activeTab === 'SALES' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}
                    onClick={() => setActiveTab('SALES')}
                >
                    Sales Ledger
                </button>
                <button
                    style={{ padding: '0.75rem 1.5rem', background: 'none', border: 'none', borderBottom: activeTab === 'MOVEMENTS' ? '2px solid var(--primary)' : '2px solid transparent', color: activeTab === 'MOVEMENTS' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}
                    onClick={() => setActiveTab('MOVEMENTS')}
                >
                    Movement Logs
                </button>
                <button
                    style={{ padding: '0.75rem 1.5rem', background: 'none', border: 'none', borderBottom: activeTab === 'EXPENSES' ? '2px solid var(--primary)' : '2px solid transparent', color: activeTab === 'EXPENSES' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}
                    onClick={() => setActiveTab('EXPENSES')}
                >
                    Expenses
                </button>
            </div>

            <div className="print-only" style={{ display: 'none', margin: '2rem 0' }}>
                <h3>Detailed Ledger</h3>
            </div>

            {/* Table Content */}
            <div className="glass-panel" style={{ padding: 0, overflowX: 'auto' }}>
                {activeTab === 'SALES' && (
                    <table className="data-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left' }}>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Order ID</th>
                                <th>Client / Source</th>
                                <th>Method</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Amount</th>
                                <th className="no-print" style={{ textAlign: 'right' }}>Invoice</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredOrders.length === 0 ? <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>No sales in this period.</td></tr> : null}
                            {filteredOrders.map(order => (
                                <tr key={order.id}>
                                    <td>{new Date(order.date).toLocaleDateString()} {new Date(order.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                    <td style={{ fontWeight: 600 }}>{order.id}</td>
                                    <td>{order.customerInfo?.name || 'Unknown'} <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{order.shopId === 'POS-WALKIN' ? 'Store Front' : getClientName(order.shopId)}</div></td>
                                    <td><span className={`badge ${order.paymentMethod === 'CASH' ? 'badge-success' : 'badge-warning'}`}>{order.paymentMethod}</span></td>
                                    <td>
                                        <span className={`badge ${order.status === 'COMPLETED' ? 'badge-success' : order.status === 'PENDING' ? 'badge-warning' : 'badge-danger'}`}>
                                            {order.status || 'COMPLETED'}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{businessProfile.currencySymbol}{order.totalAmount.toFixed(2)}</td>
                                    <td className="no-print" style={{ textAlign: 'right' }}>
                                        <button
                                            className="btn btn-secondary"
                                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                            onClick={() => setInvoiceOrder(order)}
                                        >
                                            <FileText size={13} /> Invoice
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {activeTab === 'MOVEMENTS' && (
                    <table className="data-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left' }}>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Product</th>
                                <th>Type</th>
                                <th>Quantity</th>
                                <th>Reason</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredMovements.length === 0 ? <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>No stock movements in this period.</td></tr> : null}
                            {filteredMovements.map(log => (
                                <tr key={log.id}>
                                    <td>{new Date(log.date).toLocaleDateString()} {new Date(log.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                    <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{log.productName}</td>
                                    <td>
                                        <span className={`badge ${log.type === 'IN' ? 'badge-success' : 'badge-danger'}`}>
                                            {log.type}
                                        </span>
                                    </td>
                                    <td style={{ fontWeight: 700 }}>{log.quantity}</td>
                                    <td style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{log.reason}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {activeTab === 'EXPENSES' && (
                    <table className="data-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left' }}>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Category</th>
                                <th>Description</th>
                                <th>Linked Route</th>
                                <th style={{ textAlign: 'right' }}>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredExpenses.length === 0 ? <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>No expenses in this period.</td></tr> : null}
                            {filteredExpenses.map(expense => (
                                <tr key={expense.id}>
                                    <td>{new Date(expense.date).toLocaleDateString()}</td>
                                    <td>
                                        <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600, backgroundColor: 'rgba(0,0,0,0.05)' }}>
                                            {expense.category}
                                        </span>
                                    </td>
                                    <td>{expense.description}</td>
                                    <td style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{expense.routeId ? `Route ${expense.routeId.slice(-6)}` : '-'}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--danger)' }}>{businessProfile.currencySymbol}{expense.amount.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ========== INVOICE MODAL ========== */}
            {invoiceOrder && (
                <div style={{
                    position: 'fixed', inset: 0,
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    zIndex: 200,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '1rem',
                    backdropFilter: 'blur(4px)'
                }}>
                    <div id="invoice-print-area" className="card animate-fade-in" style={{
                        background: 'white',
                        padding: 0,
                        width: '100%',
                        maxWidth: '650px',
                        borderRadius: '16px',
                        maxHeight: '90vh',
                        overflow: 'auto',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                    }}>
                        {/* Invoice Header */}
                        <div style={{ padding: '2rem 2rem 1.5rem', borderBottom: '2px solid var(--primary)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)', marginBottom: '0.25rem' }}>INVOICE</h2>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{invoiceOrder.id}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{businessProfile.name}</div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Date: {new Date(invoiceOrder.date).toLocaleDateString()}</div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Time: {new Date(invoiceOrder.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                </div>
                            </div>
                        </div>

                        {/* Client Info */}
                        <div style={{ padding: '1.25rem 2rem', backgroundColor: 'rgba(241, 245, 249, 0.5)', borderBottom: '1px solid var(--border-color)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.3rem' }}>Bill To</div>
                                    <div style={{ fontWeight: 600, fontSize: '1rem' }}>{invoiceOrder.customerInfo?.name || 'Walk-in Customer'}</div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{getClientName(invoiceOrder.shopId)}</div>
                                    {invoiceOrder.customerInfo?.phone && (
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{invoiceOrder.customerInfo.phone}</div>
                                    )}
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.3rem' }}>Payment Info</div>
                                    <div style={{ fontWeight: 600 }}>{invoiceOrder.paymentMethod}</div>
                                    <div style={{
                                        display: 'inline-block',
                                        padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600,
                                        backgroundColor: invoiceOrder.status === 'COMPLETED' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                                        color: invoiceOrder.status === 'COMPLETED' ? 'var(--success)' : 'var(--warning)',
                                        marginTop: '0.25rem'
                                    }}>
                                        {invoiceOrder.status || 'COMPLETED'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Itemized List */}
                        <div style={{ padding: '1.5rem 2rem' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <th style={{ textAlign: 'left', padding: '0.5rem 0', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>#</th>
                                        <th style={{ textAlign: 'left', padding: '0.5rem 0', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Item</th>
                                        <th style={{ textAlign: 'center', padding: '0.5rem 0', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Qty</th>
                                        <th style={{ textAlign: 'right', padding: '0.5rem 0', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Unit Price</th>
                                        {invoiceOrder.items.some(i => i.discount > 0) && (
                                            <th style={{ textAlign: 'right', padding: '0.5rem 0', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Disc</th>
                                        )}
                                        <th style={{ textAlign: 'right', padding: '0.5rem 0', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {invoiceOrder.items.map((item, idx) => {
                                        const lineGross = item.price * item.quantity;
                                        const lineDiscount = lineGross * ((item.discount || 0) / 100);
                                        const afterDiscount = lineGross - lineDiscount;
                                        const lineTax = afterDiscount * ((item.taxRate || 0) / 100);
                                        const lineTotal = afterDiscount + lineTax;
                                        return (
                                            <tr key={item.productId || idx} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                                                <td style={{ padding: '0.75rem 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{idx + 1}</td>
                                                <td style={{ padding: '0.75rem 0' }}>
                                                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{item.name}</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.sku}</div>
                                                </td>
                                                <td style={{ textAlign: 'center', padding: '0.75rem 0', fontWeight: 600 }}>{item.quantity}</td>
                                                <td style={{ textAlign: 'right', padding: '0.75rem 0' }}>{businessProfile.currencySymbol}{item.price.toFixed(2)}</td>
                                                {invoiceOrder.items.some(i => i.discount > 0) && (
                                                    <td style={{ textAlign: 'right', padding: '0.75rem 0', color: item.discount > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                                                        {item.discount > 0 ? `${item.discount}%` : '-'}
                                                    </td>
                                                )}
                                                <td style={{ textAlign: 'right', padding: '0.75rem 0', fontWeight: 700 }}>{businessProfile.currencySymbol}{lineTotal.toFixed(2)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Totals */}
                        <div style={{ padding: '1rem 2rem 1.5rem', borderTop: '1px solid var(--border-color)', backgroundColor: 'rgba(241, 245, 249, 0.3)' }}>
                            <div style={{ maxWidth: '280px', marginLeft: 'auto' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.9rem' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Subtotal</span>
                                    <span>{businessProfile.currencySymbol}{invoiceOrder.subtotal.toFixed(2)}</span>
                                </div>
                                {invoiceOrder.discount > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.9rem', color: 'var(--success)' }}>
                                        <span>Discount</span>
                                        <span>-{businessProfile.currencySymbol}{invoiceOrder.discount.toFixed(2)}</span>
                                    </div>
                                )}
                                {invoiceOrder.tax > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.9rem', color: 'var(--warning)' }}>
                                        <span>Tax</span>
                                        <span>+{businessProfile.currencySymbol}{invoiceOrder.tax.toFixed(2)}</span>
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.75rem', borderTop: '2px solid var(--primary)', marginTop: '0.5rem' }}>
                                    <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>Grand Total</span>
                                    <span style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--primary)' }}>{businessProfile.currencySymbol}{invoiceOrder.totalAmount.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{ padding: '1rem 2rem', borderTop: '1px solid var(--border-color)', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Thank you for your business! — {businessProfile.name}
                        </div>

                        {/* Actions */}
                        <div className="no-print" style={{ padding: '1rem 2rem 1.5rem', display: 'flex', gap: '0.75rem' }}>
                            <button className="btn btn-secondary" style={{ flex: 1, padding: '0.75rem', borderRadius: '10px' }} onClick={() => setInvoiceOrder(null)}>
                                <X size={16} /> Close
                            </button>
                            <button className="btn btn-primary" style={{ flex: 2, padding: '0.75rem', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} onClick={handlePrintInvoice}>
                                <Printer size={16} /> Print Invoice
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @media print {
                    body * { visibility: hidden; }
                    .print-area, .print-area * { visibility: visible; }
                    .print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; }
                    .no-print { display: none !important; }
                    .print-only { display: block !important; }
                    .card { border: none !important; box-shadow: none !important; margin-bottom: 2rem !important; }
                    .grid-cards { grid-template-columns: repeat(4, 1fr) !important; gap: 1rem !important; }
                    .data-table th { background: #f1f5f9 !important; color: #000 !important; }
                }
            `}</style>
        </div>
    );
};

export default Reports;
