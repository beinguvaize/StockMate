import React from 'react';

const GlobalLoading = () => (
    <div className="flex min-h-screen items-center justify-center bg-canvas animate-in fade-in duration-500 selection:bg-accent-signature/20">
        <div className="text-center">
            <div className="relative w-24 h-24 mb-10 mx-auto">
                {/* Outer spinning ring */}
                <div className="absolute inset-0 border-[6px] border-ink-primary/5 rounded-[2.5rem]"></div>
                <div className="absolute inset-0 border-[6px] border-t-accent-signature border-r-transparent border-b-transparent border-l-transparent rounded-[2.5rem] animate-spin-slow"></div>
                
                {/* Inner pulsing core */}
                <div className="absolute inset-4 bg-accent-signature/5 rounded-2xl animate-pulse flex items-center justify-center">
                    <div className="w-2 h-2 bg-accent-signature rounded-full shadow-[0_0_15px_rgba(200,255,0,0.8)]"></div>
                </div>
            </div>
            
            <h2 className="text-sm font-black text-ink-primary tracking-[0.2em] uppercase mb-2">Synchronizing Infrastructure.</h2>
            <p className="text-[10px] font-bold text-ink-tertiary uppercase tracking-[0.4em] opacity-50">Establishing Cloud Sequence</p>
        </div>
    </div>
);

export default GlobalLoading;
