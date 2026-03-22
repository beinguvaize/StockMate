import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';

export function ProtectedRoute({ children }) {
  const { session, currentUser, loading } = useAppContext();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#141c1a]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-[#38e0a0]/30 border-t-[#38e0a0] rounded-full animate-spin" />
          <span className="text-[#747576] text-xs font-bold uppercase tracking-widest">Loading...</span>
        </div>
      </div>
    );
  }

  // Backward compatibility with previous Auth patterns
  if (!session && !currentUser) {
      return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
