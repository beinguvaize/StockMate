import React from 'react';
import { Hammer, Cog, ShieldAlert, ArrowLeft } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

const Maintenance = () => {
    const { logout, businessProfile } = useAppContext();

    return (
        <div className="min-h-screen bg-canvas flex items-center justify-center p-6 relative overflow-hidden font-inter">
            {/* Background Decorative Elements */}
            <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent-signature/5 blur-[120px] rounded-full"></div>
            <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent-signature/5 blur-[120px] rounded-full"></div>

            <div className="max-w-md w-full glass-panel !p-12 !rounded-[40px] border border-black/5 shadow-premium text-center relative z-10 animate-fade-in">
                {/* Icon Container */}
                <div className="flex justify-center mb-8">
                    <div className="relative">
                        <div className="w-24 h-24 bg-ink-primary rounded-pill flex items-center justify-center shadow-2xl animate-pulse">
                            <Hammer size={40} className="text-accent-signature" />
                        </div>
                        <div className="absolute -top-2 -right-2 w-8 h-8 bg-surface border-2 border-ink-primary rounded-pill flex items-center justify-center shadow-lg animate-bounce">
                            <Cog size={16} className="text-ink-primary" />
                        </div>
                    </div>
                </div>

                {/* Text Content */}
                <h1 className="text-4xl font-black text-ink-primary tracking-tighter uppercase leading-none mb-4">
                    SYSTEM<br />MAINTENANCE.
                </h1>
                
                <p className="text-ink-secondary text-sm font-bold leading-relaxed opacity-70 mb-10 px-4">
                    Our engineering team is currently upgrading the {businessProfile?.name || 'StockMate'} platform to improve performance and reliability. 
                    <br /><br />
                    <span className="text-[10px] font-black uppercase tracking-widest text-ink-primary">Expected downtime: 30 minutes</span>
                </p>

                {/* Footer Controls */}
                <div className="space-y-4">
                    <div className="flex items-center justify-center gap-3 py-3 px-6 bg-black/5 rounded-pill border border-black/5">
                        <ShieldAlert size={14} className="text-ink-secondary opacity-40" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-60">Status: Scheduled Update</span>
                    </div>

                    <button 
                        onClick={() => logout()}
                        className="w-full h-14 rounded-pill border border-ink-primary/10 flex items-center justify-center gap-4 hover:bg-black/5 transition-all group"
                    >
                        <ArrowLeft size={16} className="text-ink-primary group-hover:-translate-x-1 transition-transform" />
                        <span className="text-xs font-black uppercase tracking-widest">RETURN TO LOGIN</span>
                    </button>
                </div>

                {/* Branding Hook */}
                <div className="mt-12 pt-8 border-t border-black/5">
                    <div className="flex items-center justify-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent-signature animate-pulse"></div>
                        <span className="text-[9px] font-black uppercase tracking-[0.3em] text-[#747576]">LEDGR™ ENTERPRISE CLOUD</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Maintenance;
