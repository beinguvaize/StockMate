import React from 'react';
import { useAppContext } from '../context/AppContext';
import { CheckCircle2, AlertCircle, ShoppingCart, DollarSign, X } from 'lucide-react';

const NotificationStack = () => {
    const { notifications } = useAppContext();

    if (notifications.length === 0) return null;

    return (
        <div className="fixed top-24 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
            {notifications.map((n) => (
                <div 
                    key={n.id}
                    className="group pointer-events-auto min-w-[320px] bg-white rounded-2xl shadow-2xl border border-black/5 p-4 animate-in slide-in-from-right-10 fade-in duration-300 flex items-start gap-4"
                >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        n.type === 'success' ? 'bg-green-50 text-green-600' : 
                        n.type === 'expense' ? 'bg-pink-50 text-pink-600' : 'bg-blue-50 text-blue-600'
                    }`}>
                        {n.type === 'success' ? <ShoppingCart size={20} /> : 
                         n.type === 'expense' ? <DollarSign size={20} /> : <CheckCircle2 size={20} />}
                    </div>
                    
                    <div className="flex-1">
                        <div className="flex justify-between items-start">
                            <p className="font-bold text-ink-primary text-base">
                                {n.message}
                            </p>
                        </div>
                        <p className="text-ink-secondary text-xs font-semibold uppercase tracking-wider mt-1 opacity-60">
                            {n.type === 'success' ? 'Sale Recorded' : 
                             n.type === 'expense' ? 'Expense Logged' : 'System Update'}
                        </p>
                        <p className="text-[10px] text-ink-secondary mt-1 font-mono uppercase tracking-widest opacity-30">
                            Just now
                        </p>
                    </div>

                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <X size={14} className="text-ink-secondary cursor-pointer" />
                    </div>
                </div>
            ))}
        </div>
    );
};

export default NotificationStack;
