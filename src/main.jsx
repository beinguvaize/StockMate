import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AuthProvider } from './context/AuthContext'
import { TenantProvider } from './context/TenantContext'
import { NotificationProvider } from './context/NotificationContext'
import { OfflineProvider } from './context/OfflineContext'
import App from './App.jsx'

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
