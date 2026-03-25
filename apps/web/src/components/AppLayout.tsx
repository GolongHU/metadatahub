import {
  AppstoreOutlined,
  DashboardOutlined,
  LockOutlined,
  MessageOutlined,
  MoonOutlined,
  SettingOutlined,
  ShopOutlined,
  SunOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { authApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import { useThemeStore } from '../stores/themeStore'
import { useBrandingStore } from '../stores/brandingStore'
import ParticleBackground, { type ParticleSystemRef } from './ParticleBackground'
import TransitionOverlay from './TransitionOverlay'
import { useViewStore } from '../stores/useViewStore'

const ROLE_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  admin:   { label: '管理员',   bg: 'rgba(108,92,231,0.15)', color: '#A29BFE' },
  analyst: { label: '分析师',   bg: 'rgba(59,130,246,0.15)', color: '#60A5FA' },
  viewer:  { label: '查看者',   bg: 'rgba(0,196,140,0.15)',  color: '#00C48C' },
  partner: { label: '合作伙伴', bg: 'rgba(249,115,22,0.15)', color: '#FB923C' },
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()
  const { platformName, logoLightUrl, logoDarkUrl } = useBrandingStore()
  const particleRef = useRef<ParticleSystemRef>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const viewState            = useViewStore((s) => s.viewState)
  const isDashboardFullscreen = useViewStore((s) => s.isDashboardFullscreen)

  const isDark = theme === 'dark'
  const role   = user?.role ?? ''
  const roleCfg = ROLE_CONFIG[role] ?? { label: role, bg: 'rgba(100,100,100,0.1)', color: '#9CA3B4' }
  const isAdmin    = role === 'admin'
  const canUpload  = role === 'admin' || role === 'analyst'
  const initial    = user?.name?.[0]?.toUpperCase() ?? 'U'

  // Sync theme to particle system
  useEffect(() => {
    particleRef.current?.setTheme(theme)
  }, [theme])

  // Sync viewState → particle mode
  useEffect(() => {
    if (viewState === 'collapsing') particleRef.current?.setMode('converge')
    if (viewState === 'exploding')  particleRef.current?.setMode('explode')
    if (viewState === 'dashboard' || viewState === 'returning') particleRef.current?.setMode('drift')
  }, [viewState])

  // Global keyboard shortcuts
  const { reset: resetView } = useViewStore()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      // Cmd/Ctrl+D → toggle theme
      if (mod && e.key === 'd') {
        e.preventDefault()
        toggleTheme()
      }
      // Esc → return to dashboard if in result overlay
      if (e.key === 'Escape' && viewState !== 'dashboard' && viewState !== 'returning') {
        resetView()
      }
      // Cmd/Ctrl+K → focus floating input (dispatches custom event)
      if (mod && e.key === 'k') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('focus-quick-input'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewState, toggleTheme, resetView])

  const MENU_GROUPS = [
    {
      label: 'MENU',
      items: [
        { key: '/upload',      icon: <UploadOutlined />,    label: '上传数据',   enabled: canUpload,  visible: canUpload },
        { key: '/chat',        icon: <MessageOutlined />,   label: '数据对话',   enabled: true,       visible: true },
        { key: '/dashboard',   icon: <DashboardOutlined />, label: '数据看板',   enabled: true,       visible: true },
      ],
    },
    {
      label: 'SETTINGS',
      items: [
        { key: '/permissions', icon: <LockOutlined />,      label: '权限管理', enabled: isAdmin, visible: isAdmin },
        { key: '/templates',   icon: <AppstoreOutlined />,  label: '看板模板', enabled: isAdmin, visible: isAdmin },
        { key: '/settings',    icon: <SettingOutlined />,   label: '平台设置', enabled: isAdmin, visible: isAdmin },
        { key: '/marketplace', icon: <ShopOutlined />,      label: '看板市场', enabled: true,    visible: true },
      ],
    },
  ]

  const handleLogout = async () => {
    try { await authApi.logout() } catch { /* ignore */ }
    logout()
    navigate('/login')
  }

  // CSS-variable-based sidebar colors
  const sidebarBg     = isExpanded
    ? 'var(--sidebar-bg-expanded)'
    : 'var(--sidebar-bg-collapsed)'
  const sidebarBorder = isDark ? 'rgba(162,155,254,0.06)'  : 'rgba(0,0,0,0.06)'
  const textPrimary   = isDark ? '#E8ECF3' : '#1A1D2E'
  const textSecondary = isDark ? '#9CA3B4' : '#5F6B7A'
  const textTertiary  = isDark ? '#5F6B7A' : '#9CA3B4'
  const activeItemBg  = isDark ? 'rgba(162,155,254,0.12)' : '#F0EEFF'
  const activeItemColor = isDark ? '#A29BFE' : '#6C5CE7'
  const hoverBg       = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'
  const dividerColor  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
  const primaryColor  = isDark ? '#A29BFE' : '#6C5CE7'

  // Transition style for collapsible text elements
  const labelStyle = (extraStyle?: React.CSSProperties): React.CSSProperties => ({
    maxWidth:    isExpanded ? 180 : 0,
    overflow:    'hidden',
    opacity:     isExpanded ? 1 : 0,
    whiteSpace:  'nowrap',
    transition:  isExpanded
      ? 'max-width 0.25s cubic-bezier(0.4,0,0.2,1), opacity 0.15s ease 0.08s'
      : 'max-width 0.2s cubic-bezier(0.4,0,0.2,1), opacity 0.1s ease',
    flexShrink: 0,
    ...extraStyle,
  })

  return (
    <>
      {/* ── Particle canvas (fixed, z-index 0) ── */}
      <ParticleBackground ref={particleRef} />

      {/* ── Transition overlay (fixed, z-index 200) ── */}
      <TransitionOverlay />

      {/* ── Overlay when sidebar is expanded ── */}
      {isExpanded && !isDashboardFullscreen && (
        <div
          style={{
            position:   'fixed',
            left:       64,
            right:      0,
            top:        0,
            bottom:     0,
            zIndex:     99,
            background: 'var(--sidebar-overlay)',
            cursor:     'default',
          }}
          onClick={() => setIsExpanded(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <div
        style={{
          position:   'fixed',
          left:       isDashboardFullscreen ? -64 : 0,
          top:        0,
          bottom:     0,
          width:      isExpanded ? 240 : 64,
          transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1), left 0.3s cubic-bezier(0.4,0,0.2,1)',
          background:    sidebarBg,
          backdropFilter: isExpanded ? 'blur(20px)' : 'blur(12px)',
          WebkitBackdropFilter: isExpanded ? 'blur(20px)' : 'blur(12px)',
          borderRight: `1px solid ${sidebarBorder}`,
          zIndex:     100,
          display:    'flex',
          flexDirection: 'column',
          overflow:   'hidden',
        }}
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
      >
        {/* Logo */}
        <div
          style={{
            height:     60,
            display:    'flex',
            alignItems: 'center',
            padding:    '0 18px',
            gap:        10,
            flexShrink: 0,
            borderBottom: `1px solid ${dividerColor}`,
          }}
        >
          {(isDark ? logoDarkUrl : logoLightUrl) ? (
            <img
              src={isDark ? logoDarkUrl! : logoLightUrl!}
              alt="logo"
              style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }}
            />
          ) : (
            <div
              style={{
                width:          28,
                height:         28,
                borderRadius:   8,
                background:     'linear-gradient(135deg, var(--primary-500, #6C5CE7) 0%, var(--primary-300, #A29BFE) 100%)',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                color:          '#fff',
                fontSize:       13,
                fontWeight:     700,
                flexShrink:     0,
                boxShadow:      '0 2px 8px rgba(108,92,231,0.35)',
              }}
            >
              {platformName[0]?.toUpperCase() ?? 'M'}
            </div>
          )}
          <span
            style={{
              ...labelStyle({ fontSize: 15, fontWeight: 600, color: textPrimary }),
            }}
          >
            {platformName}
          </span>
        </div>

        {/* Nav */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingTop: 8, paddingBottom: 8 }}>
          {MENU_GROUPS.map((group) => (
            <div key={group.label}>
              {/* Group label */}
              <div
                style={{
                  ...labelStyle({
                    padding:       '14px 20px 6px',
                    display:       'block',
                    fontSize:      10,
                    fontWeight:    600,
                    color:         textTertiary,
                    textTransform: 'uppercase',
                    letterSpacing: '0.8px',
                  }),
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
                    title={!isExpanded ? item.label : undefined}
                    style={{
                      height:         44,
                      margin:         '1px 8px',
                      padding:        isExpanded ? '0 12px' : '0',
                      borderRadius:   12,
                      display:        'flex',
                      alignItems:     'center',
                      justifyContent: isExpanded ? 'flex-start' : 'center',
                      gap:            isExpanded ? 10 : 0,
                      cursor:         item.enabled ? 'pointer' : 'not-allowed',
                      background:     active ? activeItemBg : 'transparent',
                      color:          active ? activeItemColor : item.enabled ? textSecondary : textTertiary,
                      fontWeight:     active ? 500 : 400,
                      fontSize:       14,
                      position:       'relative',
                      transition:     'background 0.15s, color 0.15s',
                      userSelect:     'none',
                    }}
                    onMouseEnter={(e) => {
                      if (!active && item.enabled)
                        (e.currentTarget as HTMLDivElement).style.background = hoverBg
                    }}
                    onMouseLeave={(e) => {
                      if (!active)
                        (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                    }}
                  >
                    {/* Active left-bar indicator */}
                    {active && isExpanded && (
                      <div
                        style={{
                          position:     'absolute',
                          left:         0,
                          top:          '18%',
                          bottom:       '18%',
                          width:        3,
                          borderRadius: '0 3px 3px 0',
                          background:   primaryColor,
                        }}
                      />
                    )}
                    {/* Active dot indicator (collapsed) */}
                    {active && !isExpanded && (
                      <div
                        style={{
                          position:     'absolute',
                          bottom:       6,
                          left:         '50%',
                          transform:    'translateX(-50%)',
                          width:        4,
                          height:       4,
                          borderRadius: '50%',
                          background:   primaryColor,
                        }}
                      />
                    )}
                    <span style={{ fontSize: 15, flexShrink: 0, lineHeight: 1 }}>{item.icon}</span>
                    <span style={labelStyle({ flex: 1 })}>{item.label}</span>
                    {!item.enabled && (
                      <span
                        style={{
                          ...labelStyle({
                            fontSize:   10,
                            color:      textTertiary,
                            background: isDark ? 'rgba(255,255,255,0.06)' : '#F1F3F9',
                            borderRadius: 4,
                            padding:    '1px 6px',
                          }),
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

        {/* Bottom: theme toggle + user */}
        <div
          style={{
            borderTop: `1px solid ${dividerColor}`,
            padding:   '8px 8px 12px',
            flexShrink: 0,
          }}
        >
          {/* Theme toggle */}
          <div
            onClick={toggleTheme}
            title={!isExpanded ? (isDark ? '切换亮色' : '切换暗色') : undefined}
            style={{
              height:         40,
              padding:        isExpanded ? '0 12px' : '0',
              borderRadius:   12,
              display:        'flex',
              alignItems:     'center',
              justifyContent: isExpanded ? 'flex-start' : 'center',
              gap:            isExpanded ? 10 : 0,
              cursor:         'pointer',
              color:          textSecondary,
              fontSize:       13,
              marginBottom:   4,
              transition:     'background 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = hoverBg }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
          >
            <span style={{ fontSize: 15, flexShrink: 0 }}>
              {isDark ? <SunOutlined style={{ color: '#FFB946' }} /> : <MoonOutlined style={{ color: '#6C5CE7' }} />}
            </span>
            <span style={labelStyle()}>{isDark ? '切换亮色' : '切换暗色'}</span>
          </div>

          {/* User info */}
          <div
            style={{
              display:    'flex',
              alignItems: 'center',
              gap:        10,
              padding:    '6px 6px 0',
              borderTop:  `1px solid ${dividerColor}`,
              marginTop:  4,
            }}
          >
            <div
              style={{
                width:          32,
                height:         32,
                borderRadius:   '50%',
                background:     'linear-gradient(135deg, #6C5CE7 0%, #A29BFE 100%)',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                color:          '#fff',
                fontSize:       13,
                fontWeight:     600,
                flexShrink:     0,
                cursor:         'default',
                boxShadow:      '0 2px 6px rgba(108,92,231,0.3)',
              }}
            >
              {initial}
            </div>

            <div style={labelStyle({ flex: 1, minWidth: 0 })}>
              <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.name ?? 'User'}
              </div>
              <div style={{ fontSize: 10, color: textTertiary, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <span
                  style={{
                    background:   roleCfg.bg,
                    color:        roleCfg.color,
                    borderRadius: 10,
                    padding:      '1px 6px',
                    fontSize:     10,
                    fontWeight:   500,
                  }}
                >
                  {roleCfg.label}
                </span>
              </div>
            </div>

            <button
              onClick={handleLogout}
              style={{
                ...labelStyle({
                  background:   'none',
                  border:       'none',
                  cursor:       'pointer',
                  color:        textTertiary,
                  fontSize:     11,
                  padding:      '3px 6px',
                  borderRadius: 6,
                  flexShrink:   0,
                }) as React.CSSProperties,
              }}
            >
              退出
            </button>
          </div>
        </div>
      </div>

      {/* ── Main content (always offset 64px) ── */}
      <div
        style={{
          marginLeft: isDashboardFullscreen ? 0 : 64,
          minHeight:  '100vh',
          position:   'relative',
          zIndex:     1,
          transition: 'margin-left 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {children}
      </div>
    </>
  )
}
