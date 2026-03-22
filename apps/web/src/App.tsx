import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import ChatPage from './pages/ChatPage'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import PermissionPage from './pages/PermissionPage'
import UploadPage from './pages/UploadPage'
import { useAuthStore } from './stores/authStore'

const antdTheme = {
  token: {
    colorPrimary: '#6C5CE7',
    colorSuccess: '#00C48C',
    colorWarning: '#FFB946',
    colorError: '#FF4757',
    colorInfo: '#3B82F6',
    borderRadius: 12,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 14,
    colorBgContainer: '#FFFFFF',
    colorBgLayout: '#F8F9FC',
    colorBorder: '#E8ECF3',
    colorText: '#2D3142',
    colorTextSecondary: '#5F6B7A',
    colorTextTertiary: '#9CA3B4',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
    controlHeight: 40,
  },
  components: {
    Button: { borderRadius: 12, controlHeight: 40, primaryShadow: '0 2px 8px rgba(108, 92, 231, 0.3)' },
    Input: { borderRadius: 12, controlHeight: 40 },
    Select: { borderRadius: 12, controlHeight: 40 },
    Table: { headerBg: '#F8F9FC', headerColor: '#5F6B7A', borderRadius: 12, fontSize: 13 },
    Card: { borderRadiusLG: 16 },
    Menu: { itemBorderRadius: 12, itemSelectedBg: '#F0EEFF', itemSelectedColor: '#6C5CE7' },
  },
}

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { isAuthenticated, user } = useAuthStore()
  if (!isAuthenticated()) return <Navigate to="/login" replace />
  if (adminOnly && user?.role !== 'admin') return <Navigate to="/chat" replace />
  return <AppLayout>{children}</AppLayout>
}

export default function App() {
  return (
    <ConfigProvider theme={antdTheme} locale={zhCN}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/upload"
          element={
            <ProtectedRoute>
              <UploadPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <ChatPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/permissions"
          element={
            <ProtectedRoute adminOnly>
              <PermissionPage />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/chat" replace />} />
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>
    </ConfigProvider>
  )
}
