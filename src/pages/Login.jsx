import React, { useState} from 'react';
import { useNavigate} from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const [credentials, setCredentials] = useState({ email: '', password: ''});
  const [error, setError] = useState('');
  const [btnClicked, setBtnClicked] = useState(false);
  const [markSpin, setMarkSpin] = useState(false);
  const [logoClickCount, setLogoClickCount] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);
  const { login, logout, loading} = useAuth();
  const navigate = useNavigate();

  const handleLogoClick = () => {
    const currentTime = Date.now();
    if (currentTime - lastClickTime < 1000) {
      const newCount = logoClickCount + 1;
      if (newCount === 3) {
        navigate('/nexus-hq');
        setLogoClickCount(0);
      } else {
        setLogoClickCount(newCount);
      }
    } else {
      setLogoClickCount(1);
    }
    setLastClickTime(currentTime);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    setBtnClicked(false);
    setMarkSpin(false);
    setTimeout(() => {
      setBtnClicked(true);
      setMarkSpin(true);
    }, 0);
    setTimeout(() => {
      setBtnClicked(false);
      setMarkSpin(false);
    }, 500);

    setError('');
    const result = await login(credentials.email, credentials.password);
    
    if (result.success) {
      const user = result.user;
      const isGlobalAdmin = user?.roles?.includes('GLOBAL_ADMIN') || user?.user_metadata?.roles?.includes('GLOBAL_ADMIN');
      
      if (isGlobalAdmin) {
        navigate('/nexus-hq');
      } else if (user?.tenant_id) {
        navigate('/');
      } else {
        // Successful auth but NO tenant association
        await logout(); // Ensure session is cleared
        setError('Access Restricted: Your account is not associated with an active workspace. Please contact support.');
      }
    } else {
      setError(result.error || 'Invalid email or password');
    }
  };

 return (
 <div className="flex w-full h-screen overflow-hidden bg-[#141c1a] font-inter select-none">
 {/* Left Panel: Branding */}
 <div className="hidden lg:flex w-1/2 bg-white flex-col items-center justify-center gap-4">
  <img 
  className="w-[420px] max-w-[88%] block cursor-pointer transition-transform active:scale-95" 
  src="/logo.png" 
  alt="Ledgr Pro Logo" 
  onClick={handleLogoClick}
  />
 <p className="text-[13px] text-[#747576] font-medium">
 Digital Asset Management. Reimagined.
 </p>
 </div>

 {/* Right Panel: Login Form */}
 <div className="w-full lg:w-1/2 bg-[#1a2320] flex items-center justify-center relative overflow-hidden">
 {/* Decorative Gradients */}
 <div className="absolute top-0 left-0 w-[160px] h-full bg-gradient-to-r from-white/28 via-white/12 to-transparent pointer-events-none z-0" />
 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] h-[460px] bg-[radial-gradient(ellipse_at_center,rgba(56,224,160,0.16)_0%,rgba(56,224,160,0.08)_28%,rgba(56,224,160,0.03)_55%,transparent_75%)] pointer-events-none z-0" />
 <div className="absolute -top-[80px] left-1/2 -translate-x-1/2 w-[400px] h-[300px] bg-[radial-gradient(ellipse_at_top,rgba(56,224,160,0.07)_0%,transparent_65%)] pointer-events-none z-0" />

 <div className="relative z-1 w-[370px] form-card">
 <h1 className="font-space font-bold text-[26px] text-white text-center mb-[34px]">
 WELCOME BACK
 </h1>

 <form onSubmit={handleSubmit}>
 <div className="mb-[18px]">
 <label className="block text-[#747576] text-[14px] font-medium mb-[7px]">Email Address</label>
 <div className="flex items-center bg-[#0d1411] border-[1.5px] border-[#253028] rounded-[6px] transition-colors focus-within:border-[#38e0a0]/45">
 <span className="pl-[13px] pr-[13px] text-[#747576] flex items-center shrink-0">
 <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
 <rect x="2" y="4" width="20" height="16" rx="2"/>
 <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
 </svg>
 </span>
 <input 
 type="email" 
 placeholder="Email Address" 
 autoComplete="off"
 required
 className="flex-1 bg-transparent border-none outline-none text-[#747576] font-inter text-[14px] pt-[13px] pr-[13px] pb-[13px] pl-0 placeholder:text-gray-700/30"
 value={credentials.email}
 onChange={(e) => setCredentials({ ...credentials, email: e.target.value})}
 />
 </div>
 </div>

 <div className="mb-[18px]">
 <label className="block text-[#747576] text-[14px] font-medium mb-[7px]">Password</label>
 <div className="flex items-center bg-[#0d1411] border-[1.5px] border-[#253028] rounded-[6px] transition-colors focus-within:border-[#38e0a0]/45">
 <span className="pl-[13px] pr-[13px] text-[#747576] flex items-center shrink-0">
 <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
 <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
 <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
 </svg>
 </span>
 <input 
 type="password" 
 placeholder="Password" 
 autoComplete="off"
 required
 className="flex-1 bg-transparent border-none outline-none text-[#747576] font-inter text-[14px] pt-[13px] pr-[13px] pb-[13px] pl-0 placeholder:text-gray-700/30"
 value={credentials.password}
 onChange={(e) => setCredentials({ ...credentials, password: e.target.value})}
 />
 </div>
 <span className="block text-right text-[#747576] text-[12.5px] underline underline-offset-[3px] mt-[9px] cursor-pointer opacity-85">
 Forgot Password?
 </span>
 </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="shrink-0 w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-[11px] font-bold text-red-500/90 uppercase tracking-tight leading-tight">
                {error}
              </p>
            </div>
          )}

 <button 
 type="submit"
 disabled={loading}
 className={`btn-login w-full mt-[26px] bg-white border-none rounded-[6px] cursor-pointer h-[54px] flex items-center justify-center hover:shadow-[0_8px_28px_rgba(0,0,0,0.45)] active:scale-[0.98] ${btnClicked ? 'clicked' : ''}`}
 >
 <img 
 className={`btn-mark ${markSpin ? 'spin' : ''}`}
 src="/mark.png" 
 alt="" 
 />
 <span className="font-arial font-bold text-[15px] text-[#111] relative z-1">LOG IN</span>
 </button>
 </form>
 </div>

 <div className="absolute bottom-[20px] left-1/2 -translate-x-1/2 text-[#747576] text-[11px] font-normal whitespace-nowrap z-1">
 © 2026 LEDGR PRO. ALL RIGHTS RESERVED.
 </div>
 </div>
 </div>
 );
};

export default Login;
