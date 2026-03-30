import React, { useState, useEffect } from 'react';

const GlobalLoading = () => {
    const [statusIndex, setStatusIndex] = useState(0);
    const statuses = [
        "SECURING CLOUD INFRASTRUCTURE",
        "SYNCHRONIZING BUSINESS ASSETS",
        "INITIALIZING INTELLIGENCE CORE",
        "OPTIMIZING CLIENT REGISTRIES",
        "READYING ENTERPRISE WORKSPACE"
    ];

    useEffect(() => {
        const interval = setInterval(() => {
            setStatusIndex(prev => (prev + 1) % statuses.length);
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#fdfdfd] overflow-hidden">
            {/* Soft Ambient Mesh Glow */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent-signature/5 rounded-full blur-[120px] pointer-events-none animate-pulse"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none animate-pulse" style={{ animationDelay: '1s' }}></div>
            
            <div className="relative z-10 flex flex-col items-center">
                {/* Minimalist Central Mark */}
                <div className="relative mb-12 group">
                    <div className="w-16 h-16 bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.08)] border border-black/5 flex items-center justify-center rotate-45 transform transition-transform group-hover:rotate-90 duration-1000">
                        <div className="-rotate-45 w-4 h-4 bg-accent-signature rounded-full shadow-[0_0_20px_rgba(200,255,0,0.4)] animate-pulse"></div>
                    </div>
                </div>
                
                <div className="text-center space-y-6">
                    <div className="relative inline-block">
                        <h2 className="text-4xl md:text-5xl font-black text-[#111] tracking-tighter uppercase leading-none mb-1">
                            LEDGR<span className="text-accent-signature">.</span>PRO
                        </h2>
                        <div className="absolute -bottom-2 left-0 w-0 h-[2px] bg-accent-signature animate-[loading-bar_4s_ease-in-out_infinite]"></div>
                    </div>

                    <div className="h-6 flex items-center justify-center overflow-hidden">
                        <p className="text-[10px] font-black text-black/30 tracking-[0.5em] uppercase animate-in fade-in slide-in-from-bottom-2 duration-700 whitespace-nowrap" key={statusIndex}>
                            {statuses[statusIndex]}
                        </p>
                    </div>
                    
                    <div className="flex items-center justify-center gap-2 pt-2">
                        {[0, 1, 2, 3, 4].map(i => (
                            <div 
                                key={i}
                                className={`h-1 rounded-full transition-all duration-700 ${
                                    i === statusIndex ? 'w-8 bg-accent-signature' : 'w-1.5 bg-black/5'
                                }`}
                            ></div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Subtle Footer Intel */}
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 opacity-30">
                <div className="px-4 py-1.5 rounded-full border border-black/10 bg-white shadow-sm flex items-center gap-3">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-[8px] font-black uppercase tracking-widest text-black/60">System Ready & Synchronized</span>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes loading-bar {
                    0% { width: 0; left: 0; }
                    50% { width: 100%; left: 0; }
                    100% { width: 0; left: 100%; }
                }
            `}} />
        </div>
    );
};

export default GlobalLoading;
