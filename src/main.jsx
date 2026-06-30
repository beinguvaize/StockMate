import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AuthProvider } from './context/AuthContext'
import { TenantProvider } from './context/TenantContext'
import { NotificationProvider } from './context/NotificationContext'
import { OfflineProvider } from './context/OfflineContext'
import App from './App.jsx'

// Prevent mouse scroll from changing number input values anywhere in the app.
document.addEventListener('wheel', (e) => {
  if (document.activeElement === e.target && e.target.type === 'number') {
    e.target.blur();
  }
}, { passive: true });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <TenantProvider>
        <NotificationProvider>
          <OfflineProvider>
            <App />
          </OfflineProvider>
        </NotificationProvider>
      </TenantProvider>
    </AuthProvider>
  </StrictMode>,
)
