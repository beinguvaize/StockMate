import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Receipt, Plus, Search, Calendar, Tag, User, X } from 'lucide-react';

const CATEGORIES = ['Travel', 'Meals', 'Supplies', 'Vehicle', 'Other'];

const Expenses = () => {
    const { expenses, addExpense, currentUser, businessProfile, routes } = useAppContext();
    const [showAddForm, setShowAddForm] = useState(false);
    const [newExpense, setNewExpense] = useState({ amount: '', category: 'Travel', description: '', routeId: '' });

    const activeRoutes = routes.filter(r => r.status === 'ACTIVE');

    const handleAddSubmit = (e) => {
        e.preventDefault();
        if (!newExpense.amount || !newExpense.description) return;

        addExpense({
            amount: parseFloat(newExpense.amount),
            category: newExpense.category,
            description: newExpense.description,
            routeId: newExpense.routeId || null,
            userId: currentUser.id,
            userName: currentUser.name
        });

        setNewExpense({ amount: '', category: 'Travel', description: '', routeId: '' });
        setShowAddForm(false);
    };

    const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);

    return (
        <>
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%', maxWidth: '1000px', margin: '0 auto' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="page-title" style={{ marginBottom: '0.25rem' }}>Daily Expenses</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Track operational and travel costs.</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowAddForm(!showAddForm)}>
                    <Plus size={20} /> Log New Expense
                </button>
            </div>

            <div className="glass-panel" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Recent Expenses</h2>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--danger)' }}>
                        Total: {businessProfile.currencySymbol}{totalExpenses.toFixed(2)}
                    </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table className="data-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left' }}>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Logged By</th>
                                <th>Category</th>
                                <th>Description</th>
                                <th style={{ textAlign: 'right' }}>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {expenses.map(expense => (
                                <tr key={expense.id}>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                                            <Calendar size={14} /> {new Date(expense.date).toLocaleDateString()}
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}>
                                            <User size={14} className="text-muted" /> {expense.userName}
                                        </div>
                                    </td>
                                    <td>
                                        <span className="badge" style={{ backgroundColor: 'var(--primary-transparent)', color: 'var(--primary)', gap: '0.3rem' }}>
                                            <Tag size={12} /> {expense.category}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                            <span>{expense.description}</span>
                                            {expense.routeId && (
                                                <span className="badge badge-warning" style={{ fontSize: '0.7rem', width: 'fit-content' }}>
                                                    Route: {expense.routeId.slice(-6)}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--danger)' }}>
                                        {businessProfile.currencySymbol}{expense.amount.toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                            {expenses.length === 0 && (
                                <tr>
                                    <td colSpan="5" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        No expenses logged yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        {showAddForm && (
            <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', backdropFilter: 'blur(12px)' }}>
                <div className="glass-panel animate-scale-up" style={{ padding: '2.5rem', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', background: '#ffffff', borderRadius: '24px', position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-main)' }}>
                            <Receipt size={24} className="text-primary" /> Log Expense
                        </h2>
                        <button className="btn btn-secondary" style={{ padding: '0.5rem', borderRadius: '12px', minWidth: '40px' }} onClick={() => setShowAddForm(false)}><X size={20} /></button>
                    </div>
                    <form onSubmit={handleAddSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Amount ({businessProfile.currencySymbol})</label>
                            <input
                                required
                                type="number"
                                step="0.01"
                                min="0.01"
                                className="input-field"
                                value={newExpense.amount}
                                onChange={e => setNewExpense({ ...newExpense, amount: e.target.value })}
                                placeholder="0.00"
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Category</label>
                            <select
                                className="input-field"
                                value={newExpense.category}
                                onChange={e => setNewExpense({ ...newExpense, category: e.target.value })}
                            >
                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Link to Route (Optional)</label>
                            <select
                                className="input-field"
                                value={newExpense.routeId}
                                onChange={e => setNewExpense({ ...newExpense, routeId: e.target.value })}
                            >
                                <option value="">None (General Store Expense)</option>
                                {activeRoutes.map(r => <option key={r.id} value={r.id}>Route: {r.driverId} ({new Date(r.date).toLocaleDateString()})</option>)}
                            </select>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Description</label>
                            <input
                                required
                                type="text"
                                className="input-field"
                                value={newExpense.description}
                                onChange={e => setNewExpense({ ...newExpense, description: e.target.value })}
                                placeholder="e.g. Fuel for delivery van"
                            />
                        </div>
                        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowAddForm(false)}>Cancel</button>
                            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Save Expense</button>
                        </div>
                    </form>
                </div>
            </div>
        )}
        </>
    );
};

export default Expenses;
