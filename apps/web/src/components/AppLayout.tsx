import {
  DashboardOutlined,
  LockOutlined,
  MessageOutlined,
  ShopOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { Typography } from 'antd'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { authApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'

const { Text } = Typography

const ROLE_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  admin:   { label: '管理员',   bg: '#F0EEFF', color: '#6C5CE7' },
  analyst: { label: '分析师',   bg: '#EFF6FF', color: '#3B82F6' },
  viewer:  { label: '查看者',   bg: '#F0FDF4', color: '#00C48C' },
  partner: { label: '合作伙伴', bg: '#FFF7ED', color: '#F97316' },
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()

  const role = user?.role ?? ''
  const roleCfg = ROLE_CONFIG[role] ?? { label: role, bg: '#F1F3F9', color: '#5F6B7A' }
  const isAdmin = role === 'admin'
  const canUpload = role === 'admin' || role === 'analyst'

  const MENU_GROUPS = [
    {
      label: 'MENU',
      items: [
        { key: '/upload', icon: <UploadOutlined />, label: '上传数据', enabled: canUpload, visible: canUpload },
        { key: '/chat', icon: <MessageOutlined />, label: '数据对话', enabled: true, visible: true },
        { key: '/dashboard', icon: <DashboardOutlined />, label: '看板', enabled: true, visible: true },
      ],
    },
    {
      label: 'SETTINGS',
      items: [
        { key: '/permissions', icon: <LockOutlined />, label: '权限管理', enabled: isAdmin, visible: isAdmin },
        { key: '/marketplace', icon: <ShopOutlined />, label: '看板市场', enabled: false, visible: true },
      ],
    },
  ]

  const handleLogout = async () => {
    try { await authApi.logout() } catch { /* ignore */ }
    logout()
    navigate('/login')
  }

  const initial = user?.name?.[0]?.toUpperCase() ?? 'U'

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* ── Sidebar ── */}
      <div
        style={{
          width: 240,
          flexShrink: 0,
          background: '#FFFFFF',
          borderRight: '1px solid #E8ECF3',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Logo */}
        <div style={{ padding: '20px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: '#6C5CE7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            M
          </div>
          <Text style={{ fontSize: 16, fontWeight: 600, color: '#2D3142' }}>MetadataHub</Text>
        </div>

        {/* Nav */}
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
          {MENU_GROUPS.map((group) => (
            <div key={group.label}>
              <div
                style={{
                  padding: '16px 16px 8px',
                  fontSize: 11,
                  fontWeight: 500,
                  color: '#9CA3B4',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                {group.label}
              </div>
              {group.items.filter((i) => i.visible).map((item) => {
                const active = location.pathname === item.key
                return (
                  <div
                    key={item.key}
                    onClick={() => item.enabled && navigate(item.key)}
                    style={{
                      height: 42,
                      margin: '0 8px 2px',
                      padding: '0 12px',
                      borderRadius: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: item.enabled ? 'pointer' : 'not-allowed',
                      background: active ? '#F0EEFF' : 'transparent',
                      color: active ? '#6C5CE7' : item.enabled ? '#5F6B7A' : '#C4CBD6',
                      fontWeight: active ? 500 : 400,
                      fontSize: 14,
                      position: 'relative',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (!active && item.enabled)
                        (e.currentTarget as HTMLDivElement).style.background = '#F8F9FC'
                    }}
                    onMouseLeave={(e) => {
                      if (!active)
                        (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                    }}
                  >
                    {active && (
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: '20%',
                          bottom: '20%',
                          width: 3,
                          borderRadius: '0 3px 3px 0',
                          background: '#6C5CE7',
                        }}
                      />
                    )}
                    <span style={{ fontSize: 16 }}>{item.icon}</span>
                    <span>{item.label}</span>
                    {!item.enabled && (
                      <span
                        style={{
                          marginLeft: 'auto',
                          fontSize: 10,
                          color: '#C4CBD6',
                          background: '#F1F3F9',
                          borderRadius: 4,
                          padding: '1px 6px',
                        }}
                      >
                        即将上线
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* User */}
        <div
          style={{
            borderTop: '1px solid #E8ECF3',
            padding: 16,
          }}
        >
          {/* Role tag */}
          <div style={{ marginBottom: 10 }}>
            <span
              style={{
                display: 'inline-block',
                padding: '2px 10px',
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 500,
                background: roleCfg.bg,
                color: roleCfg.color,
              }}
            >
              {roleCfg.label}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: '#6C5CE7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {initial}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#2D3142',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {user?.name ?? 'User'}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: '#9CA3B4',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {user?.email ?? ''}
              </div>
            </div>
            <button
              onClick={handleLogout}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#9CA3B4',
                fontSize: 12,
                padding: '4px 6px',
                borderRadius: 6,
                flexShrink: 0,
              }}
            >
              退出
            </button>
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ marginLeft: 240, flex: 1, background: '#F8F9FC', minHeight: '100vh' }}>
        {children}
      </div>
    </div>
  )
}
