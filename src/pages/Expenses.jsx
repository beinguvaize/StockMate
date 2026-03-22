import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { 
    Plus, Search, Filter, ArrowUpRight, ArrowDownRight, 
    Calendar, Tag, FileText, X, Check, Save, TrendingDown,
    DollarSign, Briefcase, CreditCard, Layers
} from 'lucide-react';

const Expenses = () => {
    const { 
        expenses, addExpense, updateExpense, deleteExpense, 
        businessProfile, hasPermission, isViewOnly,
        expenseCategories 
    } = useAppContext();
    
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('all'); // 'all', 'today', 'yesterday', 'custom'
    const [filterDate, setFilterDate] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [editingExpense, setEditingExpense] = useState(null);
    const [formData, setFormData] = useState({
        title: '',
        amount: '',
        category: 'Other',
        date: new Date().toISOString().split('T')[0],
        notes: '',
        splitType: 'Company'
    });

    const uniqueTitles = useMemo(() => {
        if (!Array.isArray(expenses)) return [];
        const titles = expenses.map(e => e.title || '');
        return [...new Set(titles)].filter(t => t);
    }, [expenses]);

    const filteredExpenses = useMemo(() => {
        if (!Array.isArray(expenses)) return [];
        
        const getLocalDate = (date) => {
            if (!date) return '';
            try {
                const d = new Date(date);
                if (isNaN(d.getTime())) return '';
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            } catch (e) { return ''; }
        };

        const today = getLocalDate(new Date());
        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterday = getLocalDate(yesterdayDate);

        return expenses
            .filter(e => {
                if (!e) return false;
                const matchesSearch = (e.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (e.category || '').toLowerCase().includes(searchTerm.toLowerCase());
                
                const expenseDate = getLocalDate(e.date);
                
                let matchesDate = true;
                if (filterType === 'today') matchesDate = expenseDate === today;
                else if (filterType === 'yesterday') matchesDate = expenseDate === yesterday;
                else if (filterType === 'custom') matchesDate = !filterDate || expenseDate === filterDate;
                
                return matchesSearch && matchesDate;
            })
            .sort((a, b) => new Date(b.date) - new Date(a.date));
    }, [expenses, searchTerm, filterType, filterDate]);

    const totalExpenses = useMemo(() => {
        return filteredExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    }, [filteredExpenses]);

    const dailyAvg = useMemo(() => {
        if (filteredExpenses.length === 0) return 0;
        const total = filteredExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
        return total / 30; // Approximation for month or context
    }, [filteredExpenses]);

    const getFilterLabel = () => {
        if (filterType === 'today') return "Today's Expenses";
        if (filterType === 'yesterday') return "Yesterday's Expenses";
        if (filterType === 'custom' && filterDate) return `Expenses for ${new Date(filterDate).toLocaleDateString()}`;
        return "Total Expenses";
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const expenseData = {
            ...formData,
            amount: parseFloat(formData.amount) || 0
        };

        if (editingExpense) {
            updateExpense({ ...expenseData, id: editingExpense.id });
            setEditingExpense(null);
        } else {
            addExpense(expenseData);
        }
        
        setIsAdding(false);
        setFormData({
            title: '',
            amount: '',
            category: 'Other',
            date: new Date().toISOString().split('T')[0],
            notes: '',
            splitType: 'Company'
        });
    };

    const handleEdit = (expense) => {
        if (!expense) return;
        setEditingExpense(expense);
        setFormData({
            title: expense.title || '',
            amount: (expense.amount || 0).toString(),
            category: expense.category || 'Other',
            date: expense.date ? expense.date.split('T')[0] : new Date().toISOString().split('T')[0],
            notes: expense.notes || '',
            splitType: expense.split_type || expense.splitType || 'Company'
        });
        setIsAdding(true);
    };

    const handleCloseModal = () => {
        setIsAdding(false);
        setEditingExpense(null);
        setFormData({
            title: '',
            amount: '',
            category: 'Other',
            date: new Date().toISOString().split('T')[0],
            notes: '',
            splitType: 'Company'
        });
    };

    return (
        <>
            <div className="animate-fade-in flex flex-col gap-4 pb-12">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-4 border-b border-black/5">
                <div>
                    <h1 className="text-6xl font-black text-ink-primary uppercase tracking-tighter leading-none mb-2">EXPENSES.</h1>
                    <p className="text-[10px] font-black text-ink-secondary uppercase tracking-widest opacity-70">OPERATING COSTS & EXPENDITURE</p>
                </div>
                <div className="flex items-center gap-6">
                    <div className="text-right mr-4">
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-secondary opacity-70 mb-1">{getFilterLabel()}</div>
                        <div className="text-2xl font-black text-ink-primary tracking-tighter">
                            {businessProfile?.currencySymbol || '₹'}{totalExpenses.toLocaleString()}
                        </div>
                    </div>
                    {hasPermission('ADD_EXPENSE') && (
                        <button className="btn-signature h-12 !px-5 !rounded-pill flex items-center justify-between gap-6 group transition-all duration-500 hover:shadow-[0_0_20px_rgba(200,241,53,0.3)]" onClick={() => setIsAdding(true)}>
                            <span className="text-xs font-black uppercase tracking-widest px-2">ADD EXPENSE</span>
                            <div className="icon-nest !w-8 !h-8 bg-black shadow-lg">
                                <Plus size={16} className="text-accent-signature" />
                            </div>
                        </button>
                    )}
                </div>
            </div>

            {/* Quick Stats & Controls */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-panel !p-1 bg-white border border-black/5 flex items-center justify-between rounded-pill shadow-sm !h-12 overflow-hidden">
                    <div className="flex items-center gap-3 pl-4">
                        <div className="w-8 h-8 rounded-xl bg-red-50 text-red-500 flex items-center justify-center shrink-0">
                            <TrendingDown size={18} />
                        </div>
                        <div className="flex flex-col -space-y-1">
                            <div className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70">Total Records</div>
                            <div className="text-2xl font-black text-ink-primary tracking-tighter leading-none">{filteredExpenses.length} Records</div>
                        </div>
                    </div>
                    <div className="flex flex-col items-end -space-y-1 pl-6 pr-6 border-l border-black/5">
                        <div className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 whitespace-nowrap">Monthly Avg.</div>
                        <div className="text-2xl font-black text-ink-primary tracking-tighter leading-none">
                            {businessProfile?.currencySymbol || '₹'}{dailyAvg.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                    </div>
                </div>

                <div className="md:col-span-1 relative group flex items-center !h-12">
                    <Search size={18} className="absolute left-5 text-ink-primary opacity-20 group-focus-within:opacity-100 transition-opacity z-10" />
                    <input 
                        type="text" 
                        placeholder="Search expenses..." 
                        className="input-field !pl-12 !h-full !py-0 !rounded-pill bg-surface border border-black/5 shadow-premium text-sm font-bold placeholder:text-ink-secondary/30"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="md:col-span-1 flex gap-1 bg-surface p-1.5 rounded-pill border border-black/5 shadow-premium !h-12">
                    <button 
                        onClick={() => setFilterType('all')}
                        className={`flex-1 text-[10px] font-black uppercase tracking-widest rounded-pill transition-all ${filterType === 'all' ? 'bg-ink-primary text-surface shadow-lg' : 'text-ink-secondary hover:bg-black/5'}`}
                    >
                        All
                    </button>
                    <button 
                        onClick={() => setFilterType('today')}
                        className={`flex-1 text-[10px] font-black uppercase tracking-widest rounded-pill transition-all ${filterType === 'today' ? 'bg-ink-primary text-surface shadow-lg' : 'text-ink-secondary hover:bg-black/5'}`}
                    >
                        Today
                    </button>
                    <button 
                        onClick={() => setFilterType('yesterday')}
                        className={`flex-1 text-[10px] font-black uppercase tracking-widest rounded-pill transition-all ${filterType === 'yesterday' ? 'bg-ink-primary text-surface shadow-lg' : 'text-ink-secondary hover:bg-black/5'}`}
                    >
                        Prev
                    </button>
                    <div className="relative group/date pr-2 flex items-center border-l border-black/10 ml-0.5 pl-2">
                        <Calendar size={12} className={`mr-1.5 transition-colors ${filterType === 'custom' ? 'text-accent-signature' : 'text-ink-secondary opacity-70 group-hover/date:opacity-100'}`} />
                        <input 
                            type="date" 
                            className="bg-transparent text-[9px] font-black uppercase tracking-widest text-ink-primary focus:outline-none w-20 cursor-pointer"
                            value={filterDate}
                            onChange={e => {
                                setFilterDate(e.target.value);
                                setFilterType('custom');
                            }}
                        />
                        {filterDate && (
                            <button 
                                onClick={() => {
                                    setFilterDate('');
                                    setFilterType('all');
                                }}
                                className="ml-0.5 text-ink-secondary opacity-70 hover:opacity-100 transition-opacity"
                            >
                                <X size={10} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Expenses Table/Ledger */}
            <div className="glass-panel !p-0 !rounded-bento border border-black/5 shadow-premium overflow-hidden">
                <div className="bg-ink-primary p-4 flex items-center gap-4">
                    <Briefcase size={16} className="text-accent-signature" />
                    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-surface">Expense History</h2>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-black/5 bg-canvas">
                                <th className="p-1.5 pl-8 text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70">Expense Name</th>
                                <th className="p-1.5 text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 text-center">Category</th>
                                <th className="p-1.5 text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 text-center">Date</th>
                                <th className="p-1.5 text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 text-right">Amount</th>
                                <th className="p-1.5 pr-8 text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5 bg-white font-inter">
                            {filteredExpenses.map(expense => (
                                <tr key={expense.id} className="group hover:bg-canvas transition-colors">
                                    <td className="p-1.5 pl-8">
                                        <div className="flex flex-col">
                                            <div className="text-xs font-black text-ink-primary uppercase tracking-tight flex items-center gap-2">
                                                {expense.title}
                                                <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[#747576] text-[8px] font-black uppercase tracking-widest border border-gray-200">
                                                    {expense.splitType || expense.split_type || 'Company'}
                                                </span>
                                            </div>
                                            <div className="text-[10px] font-bold text-ink-primary uppercase tracking-widest opacity-70 mt-0.5">{expense.notes || 'N/A'}</div>
                                        </div>
                                    </td>
                                    <td className="p-1.5 text-center">
                                        <span className={`px-3 py-1 rounded-pill text-[9px] font-black uppercase tracking-widest border ${
                                            (expense.category || '').toLowerCase() === 'petrol' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                                            (expense.category || '').toLowerCase() === 'food' ? 'bg-red-50 text-red-600 border-red-100' :
                                            (expense.category || '').toLowerCase() === 'salary' ? 'bg-green-50 text-green-600 border-green-100' :
                                            (expense.category || '').toLowerCase() === 'rent' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                            (expense.category || '').toLowerCase() === 'utility' ? 'bg-yellow-50 text-yellow-600 border-yellow-100' :
                                            (expense.category || '').toLowerCase() === 'purchase' ? 'bg-purple-50 text-purple-600 border-purple-100' :
                                            (expense.category || '').toLowerCase() === 'maintenance' ? 'bg-teal-50 text-teal-600 border-teal-100' :
                                            (expense.category || '').toLowerCase().includes('credit') ? 'bg-fuchsia-50 text-fuchsia-600 border-fuchsia-100' :
                                            (expense.category || '').toLowerCase().includes('delivery') ? 'bg-sky-50 text-sky-600 border-sky-100' :
                                            'bg-gray-100 text-[#747576] border-gray-200'
                                        }`}>
                                            {expense.category || 'Other'}
                                        </span>
                                    </td>
                                    <td className="p-1.5 text-center">
                                        <div className="flex items-center justify-center gap-2 text-[10px] font-bold text-ink-secondary uppercase tracking-tight">
                                            <Calendar size={10} className="opacity-30" />
                                            {new Date(expense.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </div>
                                    </td>
                                    <td className="p-1.5 text-right">
                                        <div className="text-base font-black text-ink-primary tracking-tighter">
                                            {businessProfile?.currencySymbol || '₹'}{parseFloat(expense.amount).toLocaleString()}
                                        </div>
                                    </td>
                                    <td className="p-1.5 pr-8 text-right">
                                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                            {hasPermission('EDIT_EXPENSE') && (
                                                <button 
                                                    className="w-8 h-8 rounded-xl bg-accent-signature/20 text-ink-primary flex items-center justify-center hover:scale-110 transition-all border border-black/5"
                                                    onClick={() => handleEdit(expense)}
                                                >
                                                    <FileText size={14} />
                                                </button>
                                            )}
                                            {hasPermission('DELETE_EXPENSE') && (
                                                <button 
                                                    className="w-8 h-8 rounded-xl bg-red-50 text-red-500 flex items-center justify-center hover:scale-110 transition-all border border-red-100"
                                                    onClick={() => {
                                                        if(window.confirm('Delete record?')) deleteExpense(expense.id);
                                                    }}
                                                >
                                                    <X size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {filteredExpenses.length === 0 && (
                    <div className="p-32 text-center">
                        <div className="flex justify-center mb-6 opacity-10">
                            <Layers size={64} strokeWidth={1} />
                        </div>
                        <p className="text-sm font-black uppercase tracking-[0.4em] text-[#747576]">No expenses found</p>
                    </div>
                )}
                </div>
            </div>

            {/* Expense Form Modal */}
            {isAdding && (
                <div className="modal-overlay">
                    <div className="glass-modal">
                        <div className="flex justify-between items-start mb-5">
                            <div>
                                <h2 className="text-3xl font-black text-ink-primary tracking-tighter uppercase leading-none mb-2">
                                    {editingExpense ? 'EDIT EXPENSE.' : 'NEW EXPENSE.'}
                                </h2>
                                <p className="text-[10px] font-black text-ink-secondary uppercase tracking-[0.3em] opacity-70">
                                    LOG BUSINESS EXPENDITURE DETAILS
                                </p>
                            </div>
                            <button 
                                onClick={handleCloseModal}
                                className="w-10 h-10 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all cursor-pointer text-ink-primary"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-1.5">Expense Title</label>
                                    <input 
                                        required 
                                        type="text" 
                                        list="expense-titles"
                                        placeholder="VENDOR OR SERVICE NAME..."
                                        className="w-full bg-canvas border-none rounded-2xl p-5 font-black text-lg text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase" 
                                        value={formData.title} 
                                        onChange={e => setFormData({...formData, title: e.target.value})} 
                                    />
                                    <datalist id="expense-titles">
                                        {uniqueTitles.map(title => (
                                            <option key={title} value={title} />
                                        ))}
                                    </datalist>
                                </div>
                                
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-1.5">Amount</label>
                                    <div className="relative">
                                        <div className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-ink-primary opacity-20">
                                            {businessProfile?.currencySymbol || '₹'}
                                        </div>
                                        <input 
                                            required 
                                            type="number" 
                                            step="0.01"
                                            className="w-full bg-canvas border-none rounded-2xl p-5 pl-14 font-black text-2xl text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all tabular-nums" 
                                            value={formData.amount} 
                                            onChange={e => setFormData({...formData, amount: e.target.value})} 
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-1.5">Category</label>
                                    <select 
                                        className="w-full bg-canvas border-none rounded-2xl p-5 font-black text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase appearance-none cursor-pointer" 
                                        value={formData.category} 
                                        onChange={e => setFormData({...formData, category: e.target.value})}
                                    >
                                        <option value="Other">OTHER (DEFAULT)</option>
                                        <option value="Petrol">PETROL</option>
                                        <option value="Food">FOOD</option>
                                        <option value="Salary">SALARY</option>
                                        <option value="Rent">RENT</option>
                                        <option value="Utility">UTILITY</option>
                                        <option value="Purchase">PURCHASE</option>
                                        <option value="Maintenance">MAINTENANCE</option>
                                        <option value="Credit Card Payment">CREDIT CARD PAYMENT</option>
                                        <option value="Delivery Charge">DELIVERY CHARGE</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-1.5">Date</label>
                                    <input 
                                        type="date" 
                                        className="w-full bg-canvas border-none rounded-2xl p-5 font-black text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase" 
                                        value={formData.date} 
                                        onChange={e => setFormData({...formData, date: e.target.value})} 
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-1.5">Split Type</label>
                                    <select 
                                        className="w-full bg-canvas border-none rounded-2xl p-5 font-black text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase appearance-none cursor-pointer" 
                                        value={formData.splitType} 
                                        onChange={e => setFormData({...formData, splitType: e.target.value})}
                                    >
                                        <option value="Company">COMPANY (DEFAULT)</option>
                                        <option value="Akbar">AKBAR</option>
                                        <option value="Nadar">NADAR</option>
                                        <option value="Narshik">NARSHIK</option>
                                    </select>
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-1.5">Notes (Internal Record)</label>
                                    <textarea 
                                        className="w-full bg-canvas border-none rounded-2xl p-5 font-black text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase min-h-[80px] resize-none" 
                                        placeholder="ADD DETAILS FOR THIS EXPENDITURE..."
                                        value={formData.notes} 
                                        onChange={e => setFormData({...formData, notes: e.target.value})} 
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-4">
                                <button type="button" className="px-8 py-4 rounded-pill border border-black/10 font-black text-ink-primary text-xs uppercase tracking-[0.2em] hover:bg-black/5 transition-all cursor-pointer" onClick={handleCloseModal}>Cancel</button>
                                <button type="submit" className="btn-signature !h-14 !text-sm flex items-center justify-center px-6 !rounded-pill">
                                    {editingExpense ? 'SAVE CHANGES' : 'LOG EXPENSE'}
                                    <div className="icon-nest !w-10 !h-10 ml-4">
                                        <Save size={22} />
                                    </div>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
};

export default Expenses;
