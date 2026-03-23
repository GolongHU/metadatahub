import { ConfigProvider, theme as antdTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import ChatPage from './pages/ChatPage'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import PermissionPage from './pages/PermissionPage'
import UploadPage from './pages/UploadPage'
import { authApi } from './services/api'
import { useAuthStore } from './stores/authStore'
import { useThemeStore } from './stores/themeStore'
import axios from 'axios'

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { isAuthenticated, user } = useAuthStore()
  if (!isAuthenticated()) return <Navigate to="/login" replace />
  if (adminOnly && user?.role !== 'admin') return <Navigate to="/chat" replace />
  return <AppLayout>{children}</AppLayout>
}

export default function App() {
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const { setAuth } = useAuthStore()
  const [bootstrapped, setBootstrapped] = useState(false)

  // Sync theme to DOM
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Silent refresh on page load — restore session from httpOnly cookie
  useEffect(() => {
    const restore = async () => {
      try {
        const res = await axios.post<{ access_token: string; expires_in: number }>(
          '/api/v1/auth/refresh', {}, { withCredentials: true }
        )
        const meRes = await authApi.me()
        const u = meRes.data
        setAuth(res.data.access_token, {
          user_id: u.user_id, name: u.name, email: u.email,
          role: u.role, region: u.region, partner_id: u.partner_id,
        }, res.data.expires_in)
      } catch {
        // No valid session — let ProtectedRoute redirect to /login
      } finally {
        setBootstrapped(true)
      }
    }
    restore()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!bootstrapped) return null  // Wait before rendering routes

  const lightTokens = {
    colorPrimary: '#6C5CE7',
    colorSuccess: '#00C48C',
    colorWarning: '#FFB946',
    colorError: '#FF4757',
    colorInfo: '#3B82F6',
    borderRadius: 12,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 14,
    colorBgContainer: '#FFFFFF',
    colorBgLayout: 'transparent',
    colorBorder: '#E8ECF3',
    colorText: '#2D3142',
    colorTextSecondary: '#5F6B7A',
    colorTextTertiary: '#9CA3B4',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
    controlHeight: 40,
  }

  const darkTokens = {
    colorPrimary: '#A29BFE',
    colorSuccess: '#00E0A3',
    colorWarning: '#FFC95A',
    colorError: '#FF6B81',
    colorInfo: '#60A5FA',
    borderRadius: 12,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 14,
    colorBgContainer: '#1A1D2E',
    colorBgLayout: 'transparent',
    colorBgElevated: '#1E2130',
    colorBgSpotlight: '#2D3142',
    colorBorder: '#2D3142',
    colorBorderSecondary: '#2D3142',
    colorText: '#E8ECF3',
    colorTextSecondary: '#9CA3B4',
    colorTextTertiary: '#5F6B7A',
    colorTextQuaternary: '#3D4255',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
    controlHeight: 40,
  }

  const componentOverrides = {
    Button:  { borderRadius: 12, controlHeight: 40, primaryShadow: '0 2px 8px rgba(108, 92, 231, 0.3)' },
    Input:   { borderRadius: 12, controlHeight: 40 },
    Select:  { borderRadius: 12, controlHeight: 40 },
    Table:   { headerBg: isDark ? '#1E2130' : '#F8F9FC', headerColor: isDark ? '#9CA3B4' : '#5F6B7A', borderRadius: 12, fontSize: 13 },
    Card:    { borderRadiusLG: 16 },
    Menu:    { itemBorderRadius: 12, itemSelectedBg: isDark ? '#2A2550' : '#F0EEFF', itemSelectedColor: isDark ? '#A29BFE' : '#6C5CE7' },
    Modal:   { contentBg: isDark ? '#1A1D2E' : '#FFFFFF', headerBg: isDark ? '#1A1D2E' : '#FFFFFF' },
    Dropdown: { colorBgElevated: isDark ? '#1E2130' : '#FFFFFF' },
  }

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: isDark ? darkTokens : lightTokens,
        components: componentOverrides,
      }}
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/upload"      element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
        <Route path="/chat"        element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
        <Route path="/dashboard"   element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/permissions" element={<ProtectedRoute adminOnly><PermissionPage /></ProtectedRoute>} />
        <Route path="/"  element={<Navigate to="/dashboard" replace />} />
        <Route path="*"  element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </ConfigProvider>
  )
}
