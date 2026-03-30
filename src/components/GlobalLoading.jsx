import React, { useState, useEffect } from 'react';

const GlobalLoading = () => {
    const [statusIndex, setStatusIndex] = useState(0);
    const statuses = [
        "ESTABLISHING SECURE PROTOCOLS",
        "SYNCHRONIZING CLOUD INFRASTRUCTURE",
        "FETCHING BUSINESS ANALYTICS",
        "OPTIMIZING COMPUTE RESOURCES",
        "MAPPING DATA PERIPHERALS"
    ];

    useEffect(() => {
        const interval = setInterval(() => {
            setStatusIndex(prev => (prev + 1) % statuses.length);
        }, 1500);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#050505] overflow-hidden">
            {/* Background Ambient Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent-signature/5 rounded-full blur-[120px] pointer-events-none animate-pulse"></div>
            
            <div className="relative z-10 text-center scale-110 md:scale-125">
                {/* Layered Spinner Cluster */}
                <div className="relative w-32 h-32 mb-16 mx-auto group">
                    {/* Outer slow orbital */}
                    <div className="absolute inset-0 border-[1px] border-white/5 rounded-[2.5rem] scale-125 rotate-45"></div>
                    
                    {/* Primary fast spinner */}
                    <div className="absolute inset-0 border-[4px] border-transparent border-t-accent-signature rounded-[2.8rem] animate-spin-slow"></div>
                    
                    {/* Secondary counter-spinner */}
                    <div className="absolute inset-4 border-[2px] border-transparent border-b-white/20 rounded-[2rem] animate-[spin_3s_linear_infinite_reverse]"></div>
                    
                    {/* Internal Core Node */}
                    <div className="absolute inset-10 bg-gradient-to-br from-white/10 to-transparent backdrop-blur-3xl rounded-[1.5rem] border border-white/10 flex items-center justify-center shadow-[0_0_50px_rgba(200,255,0,0.1)]">
                        <div className="w-3 h-3 bg-accent-signature rounded-full shadow-[0_0_20px_rgba(200,255,0,0.8)] animate-pulse"></div>
                    </div>

                    {/* Drifting particles (simulated) */}
                    <div className="absolute -top-10 -left-10 w-2 h-2 bg-white/10 rounded-full blur-[1px] animate-bounce"></div>
                    <div className="absolute -bottom-8 -right-8 w-1 h-1 bg-accent-signature/30 rounded-full blur-[1px] animate-pulse"></div>
                </div>
                
                <div className="space-y-4 px-6">
                    <div className="relative">
                        <h2 className="text-2xl md:text-3xl font-black text-white tracking-tighter uppercase leading-none mb-1 mix-blend-difference">
                            LEDGR<span className="text-accent-signature">.</span>PRO
                        </h2>
                        <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-accent-signature/50 to-transparent"></div>
                    </div>

                    <p className="text-[9px] md:text-[10px] font-black text-accent-signature tracking-[0.6em] uppercase transition-all duration-700 opacity-80 h-4 min-w-[280px]">
                        {statuses[statusIndex]}
                    </p>
                    
                    <div className="flex items-center justify-center gap-1.5 pt-4">
                        {[0, 1, 2, 3, 4].map(i => (
                            <div 
                                key={i}
                                className={`h-1 rounded-full transition-all duration-500 ${
                                    i <= statusIndex ? 'w-4 bg-accent-signature' : 'w-1 bg-white/10'
                                }`}
                            ></div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Bottom Terminal Deco */}
            <div className="absolute bottom-12 left-12 right-12 hidden md:flex justify-between items-end border-t border-white/5 pt-6">
                <div className="text-[8px] font-black text-white/20 uppercase tracking-[0.4em]">
                    Terminal Authorization: ACTIVE<br />
                    System Latency: 4ms
                </div>
                <div className="text-[8px] font-black text-white/20 uppercase tracking-[0.4em] text-right">
                    Relay Node: TRV-01<br />
                    Encryption: AES-256-GCM
                </div>
            </div>
        </div>
    );
};

export default GlobalLoading;
