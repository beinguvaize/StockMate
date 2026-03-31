import React, { useState, useEffect, useRef} from 'react';
import { useNavigate} from 'react-router-dom';
import { useAppContext} from '../context/AppContext';
import { ArrowRight} from 'lucide-react';

const SaaSLogin = () => {
 const { login, users} = useAppContext();
 const navigate = useNavigate();
 const [email, setEmail] = useState('');
 const [password, setPassword] = useState('');
 const [mousePos, setMousePos] = useState({ x: 0, y: 0});
 const containerRef = useRef(null);

 const activeUsers = users.filter(u => u.status === 'ACTIVE');

 const handleMouseMove = (e) => {
 const { clientX, clientY} = e;
 const { innerWidth, innerHeight} = window;
 const x = (clientX / innerWidth - 0.5) * 40;
 const y = (clientY / innerHeight - 0.5) * 40;
 setMousePos({ x, y});
};

 const [error, setError] = useState('');

 const handleLogin = async (e) => {
 e.preventDefault();
 setError('');
 const result = await login(email, password);
 if (result.success) {
 navigate('/');
} else {
 setError(result.error || 'Invalid credentials');
}
};

 const handleQuickLogin = async (user) => {
 setEmail(user.email);
 setPassword('password');
 setError('');
 const result = await login(user.email, 'password');
 if (result.success) {
 navigate('/');
} else {
 setError(result.error || 'Quick login failed');
}
};

 return (
 <div 
 ref={containerRef}
 onMouseMove={handleMouseMove}
 className="flex min-h-screen font-inter bg-canvas text-ink-primary overflow-hidden selection:bg-accent-signature/30"
 >
 {/* Premium Matrix Grid Background */}
 <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.85]">
 <div 
 className="absolute inset-[-100px] bg-[linear-gradient(to_right,rgba(0,0,0,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.05)_1px,transparent_1px)] bg-[size:40px_40px]"
 style={{ 
 transform: `translate(${mousePos.x * 0.5}px, ${mousePos.y * 0.5}px)`,
 maskImage: 'radial-gradient(circle at center, black, transparent 80%)'
}}
 ></div>
 {/* Moving Light Sweep */}
 <div className="absolute inset-0 bg-gradient-to-r from-transparent via-accent-signature/10 to-transparent w-[300px] h-[200%] rotate-45 animate-[sweep_8s_infinite] blur-[100px]"></div>
 </div>

 {/* Ambient Luminous Orbs */}
 <div className="absolute inset-0 pointer-events-none">
 <div 
 className="absolute top-[20%] left-[20%] w-[600px] h-[600px] rounded-full bg-accent-signature/10 blur-[150px] transition-transform duration-1000 ease-out"
 style={{ transform: `translate(${mousePos.x * 1.5}px, ${mousePos.y * 1.5}px)`}}
 ></div>
 <div 
 className="absolute bottom-[10%] right-[10%] w-[500px] h-[500px] rounded-full bg-ink-primary/5 blur-[150px] transition-transform duration-1000 ease-out"
 style={{ transform: `translate(${-mousePos.x * 2}px, ${-mousePos.y * 2}px)`}}
 ></div>
 </div>

 <div className="w-full h-full flex items-center justify-center p-6 lg:p-6 relative z-10">
 <div className="w-full max-w-[1200px] grid lg:grid-cols-2 gap-4 items-center">
 
 <div className="flex flex-col items-center lg:items-start text-center lg:text-left space-y-10 animate-in fade-in slide-in-from-left-12 duration-1000">
 <div className="p-6 rounded-bento bg-white border border-black/5 shadow-premium">
 <img src="/images/ledgr_metallic_logo.png" alt="Ledgr Logo" className="h-16 lg:h-20" />
 </div>
 <div>
 <h1 className="text-6xl lg:text-[10rem] font-semibold -0.08em] mb-6 text-ink-primary leading-[0.8]">
 LEDGR<span className="text-accent-signature">.</span> <br /> 
 <span className="text-4xl lg:text-5xl -0.02em] opacity-70">INFRASTRUCTURE</span>
 </h1>
 <p className="text-xl lg:text-2xl text-gray-700 font-medium max-w-lg leading-relaxed opacity-60">
 The high-fidelity operating system for modern enterprise commerce. Precision engineered for scale.
 </p>
 </div>
 <div className="flex items-center gap-4 mt-4">
 <div className="flex -space-x-3">
 {[1, 2, 3, 4].map(i => (
 <div key={i} className="w-10 h-10 rounded-pill border-2 border-canvas bg-white flex items-center justify-center overflow-hidden">
 <div className="w-full h-full bg-accent-signature/20"></div>
 </div>
 ))}
 </div>
 <p className="text-[10px] font-semibold text-gray-600 opacity-80 mb-6 uppercase">Trusted by 500+ Enterprise Teams</p>
 </div>
 </div>

 {/* Form Side */}
 <div className="animate-in fade-in slide-in-from-right-12 duration-1000 delay-200">
 <div className="glass-panel !p-5 lg:!p-16 !rounded-[3rem] border-white/20 shadow-glass relative overflow-hidden group/card">
 <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-white/10 pointer-events-none" />
 <div className="mb-14 relative z-10">
 <div className="text-sm font-semibold text-accent-signature mb-4">Verification Layer 01</div>
 <h2 className="text-4xl lg:text-5xl font-semibold mb-4 text-ink-primary leading-none">Access Control<span className="text-accent-signature">.</span></h2>
 <p className="text-gray-700 font-medium opacity-60">Authorize your organizational identity.</p>
 </div>

 <form onSubmit={handleLogin} className="space-y-10">
 {error && (
 <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm font-medium animate-in fade-in slide-in-from-top-2">
 {error}
 </div>
 )}
 <div className="space-y-4">
 <label className="block text-xs font-semibold text-gray-700 opacity-[0.85] ml-2">Identity Token (Email)</label>
 <input 
 type="email" 
 className="w-full bg-canvas border border-black/5 rounded-lg px-8 py-7 focus:outline-none focus:ring-4 focus:ring-accent-signature/20 focus:border-accent-signature transition-all text-xl placeholder:text-[#747576]/30 font-medium text-ink-primary"
 placeholder="name@organization.com"
 value={email}
 onChange={(e) => setEmail(e.target.value)}
 required
 />
 </div>

 <div className="space-y-4">
 <div className="flex justify-between items-center ml-2">
 <label className="text-xs font-semibold text-gray-700 opacity-[0.85]">Access Key</label>
 <a href="#" className="text-[10px] font-semibold text-gray-700 hover:text-ink-primary transition-colors">Emergency Reset</a>
 </div>
 <input 
 type="password" 
 className="w-full bg-canvas border border-black/5 rounded-lg px-8 py-7 focus:outline-none focus:ring-4 focus:ring-accent-signature/20 focus:border-accent-signature transition-all text-xl placeholder:text-[#747576]/30 font-medium text-ink-primary"
 placeholder="••••••••"
 value={password}
 onChange={(e) => setPassword(e.target.value)}
 required
 />
 </div>

 <div className="pt-6 relative z-10">
 <button 
 type="submit"
 className="btn-signature w-full !py-8 !rounded-[2rem] !justify-center shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all group"
 >
 <span className="text-xl font-semibold">Authorize System Access</span>
 <div className="icon-nest !w-14 !h-14 ml-4">
 <ArrowRight className="w-8 h-8 group-hover:translate-x-1 transition-transform duration-500" />
 </div>
 </button>
 </div>
 </form>

 {/* Rapid Access Ports */}
 <div className="mt-16 pt-12 border-t border-black/5">
 <p className="text-[10px] font-semibold text-gray-600 opacity-80 mb-6 uppercase">Development Access Ports</p>
 <div className="grid grid-cols-2 gap-4">
 {activeUsers.slice(0, 4).map(user => (
 <button 
 key={user.id}
 onClick={() => handleQuickLogin(user)}
 className="p-6 rounded-lg bg-canvas border border-black/5 hover:border-black/10 hover:bg-white hover:shadow-premium transition-all text-left active:scale-95 group"
 >
 <div className="font-bold text-lg text-ink-primary group-hover:text-ink-primary truncate">{user.name}</div>
 <div className="text-sm font-semibold text-gray-700 opacity-60 mt-2 truncate">{user.role}</div>
 </button>
 ))}
 </div>
 </div>
 </div>
 </div>
 </div>
 </div>

 <style dangerouslySetInnerHTML={{ __html: `
 @keyframes sweep {
 0% { transform: translate(-100%, -100%) rotate(45deg);}
 100% { transform: translate(200%, 200%) rotate(45deg);}
}
 `}} />
 </div>
 );
};

export default SaaSLogin;
