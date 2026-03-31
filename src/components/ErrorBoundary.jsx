import React from 'react';
import { AlertTriangle, RefreshCcw, Home} from 'lucide-react';

class ErrorBoundary extends React.Component {
 constructor(props) {
 super(props);
 this.state = { hasError: false, error: null};
}

 static getDerivedStateFromError(error) {
 return { hasError: true, error};
}

 componentDidCatch(error, errorInfo) {
 console.error("❌ App Crash Detected:", error, errorInfo);
}

 handleReload = () => {
 window.location.reload();
};

 handleReset = () => {
 localStorage.clear();
 window.location.href = '/login';
};

 render() {
 if (this.state.hasError) {
 return (
 <div className="min-h-screen bg-canvas flex items-center justify-center p-6 text-center selection:bg-red-500/20">
 <div className="max-w-md w-full animate-in fade-in zoom-in duration-500">
 <div className="bg-white rounded-[2.5rem] border border-black/5 shadow-premium p-5 relative overflow-hidden group">
 {/* Abstract decorative background */}
 <div className="absolute -top-24 -right-24 w-48 h-48 bg-red-500/5 rounded-full blur-3xl group-hover:bg-red-500/10 transition-colors duration-700"></div>
 
 <div className="w-20 h-20 bg-red-50 rounded-xl flex items-center justify-center mx-auto mb-8 shadow-sm">
 <AlertTriangle className="w-10 h-10 text-red-500" strokeWidth={1.5} />
 </div>

 <h1 className="text-3xl font-semibold text-ink-primary mb-4">
 System Resilience <br /> Triggered.
 </h1>
 
 <p className="text-[10px] font-semibold text-gray-600 opacity-80 mb-6 uppercase">
 A critical rendering exception was intercepted. This security measure prevents data corruption and allows for a clean recovery.
 </p>

 <div className="space-y-4 relative z-10">
 <button 
 onClick={this.handleReload}
 className="w-full flex items-center justify-center gap-3 bg-ink-primary text-white font-semibold py-2 rounded-lg hover:bg-ink-secondary transition-all shadow-xl hover:shadow-2xl active:scale-95 text-xs"
 >
 <RefreshCcw className="w-4 h-4" />
 Repair Infrastructure
 </button>
 
 <div className="grid grid-cols-2 gap-4">
 <button 
 onClick={() => window.location.href = '/dashboard'}
 className="flex items-center justify-center gap-2 bg-gray-50 text-ink-primary font-bold py-2 rounded-lg hover:bg-gray-100 transition-all text-xs"
 >
 <Home className="w-4 h-4" />
 Bypass
 </button>
 <button 
 onClick={this.handleReset}
 className="flex items-center justify-center gap-2 bg-red-50 text-red-600 font-bold py-2 rounded-lg hover:bg-red-100 transition-all text-xs"
 >
 Reset Session
 </button>
 </div>
 </div>

 <div className="mt-10 pt-8 border-t border-black/5">
 <p className="text-[10px] font-semibold text-ink-tertiary">
 Error Code: <span className="text-red-500 font-mono ml-1">
 {this.state.error?.name || 'GENERIC_RUNTIME_EXCEPTION'}
 </span>
 </p>
 </div>
 </div>
 </div>
 </div>
 );
}

 return this.props.children;
}
}

export default ErrorBoundary;
