import { EyeInvisibleOutlined, EyeOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import { useThemeStore } from '../stores/themeStore'

// ── Constants ─────────────────────────────────────────────────────────────────
const MOBIUS_PATH =
  'M24,56 C24,24 56,8 80,40 C104,72 136,56 136,56 C136,56 136,88 112,72 C88,40 56,56 24,56 Z'

const QUICK_USERS = [
  { label: 'Admin',       email: 'admin@metadatahub.local',   password: 'admin123',   color: '#A29BFE' },
  { label: '华东经理',    email: 'manager@metadatahub.local', password: 'manager123', color: '#60A5FA' },
  { label: '渠道专员',    email: 'rep@metadatahub.local',      password: 'rep123',     color: '#00E6A0' },
  { label: '阿里云(伙伴)', email: 'partner@metadatahub.local', password: 'partner123', color: '#FFD166' },
]

const PARTICLE_COLORS = ['#6C5CE7', '#A29BFE', '#00C48C', '#FFB946', '#3B82F6', '#FF6B81']

// ── Particle canvas hook ───────────────────────────────────────────────────────
function useLoginCanvas(canvasRef: React.RefObject<HTMLCanvasElement>, isDark: boolean) {
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    interface P { x: number; y: number; r: number; vx: number; vy: number; op: number; ci: number }
    let particles: P[] = []

    const init = () => {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
      const bg = isDark ? '#080A12' : '#F0EEFF'
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      const count = window.innerWidth < 480 ? 40 : 70
      particles = Array.from({ length: count }, () => ({
        x:  Math.random() * canvas.width,
        y:  Math.random() * canvas.height,
        r:  Math.pow(Math.random(), 2) * 4 + 0.8,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        op: Math.random() * 0.17 + 0.08,
        ci: Math.floor(Math.random() * 6),
      }))
    }

    let animId = 0
    let last   = 0
    const draw = (t: number) => {
      animId = requestAnimationFrame(draw)
      if (t - last < 16) return
      last = t
      const w = canvas.width, h = canvas.height

      ctx.globalAlpha = 0.15
      ctx.fillStyle   = isDark ? '#080A12' : '#F0EEFF'
      ctx.fillRect(0, 0, w, h)
      ctx.globalAlpha = 1

      for (const p of particles) {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0)  { p.x = 0; p.vx *= -1 }
        if (p.x > w)  { p.x = w; p.vx *= -1 }
        if (p.y < 0)  { p.y = 0; p.vy *= -1 }
        if (p.y > h)  { p.y = h; p.vy *= -1 }
        ctx.globalAlpha = p.op
        ctx.fillStyle   = PARTICLE_COLORS[p.ci]
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.strokeStyle = '#6C5CE7'
      ctx.lineWidth   = 0.5
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx   = particles[i].x - particles[j].x
          const dy   = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 100) {
            ctx.globalAlpha = (1 - dist / 100) * 0.04
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.stroke()
          }
        }
      }
      ctx.globalAlpha = 1
    }

    init()
    animId = requestAnimationFrame(draw)
    const onResize = () => init()
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', onResize)
    }
  }, [canvasRef, isDark])
}

// ── Quick-login button ─────────────────────────────────────────────────────────
function QuickBtn({
  user, loading, isDark, onClick,
}: {
  user: typeof QUICK_USERS[0]
  loading: boolean
  isDark: boolean
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={loading}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding:        '10px 12px',
        borderRadius:   12,
        border:         `1px solid ${hovered ? 'rgba(162,155,254,0.3)' : 'rgba(162,155,254,0.08)'}`,
        background:     hovered
          ? isDark ? 'rgba(42,37,80,0.5)' : 'rgba(108,92,231,0.08)'
          : isDark ? 'rgba(15,17,23,0.4)' : 'rgba(255,255,255,0.5)',
        color:          hovered ? (isDark ? '#E8ECF3' : '#1A1D2E') : '#9CA3B4',
        fontSize:       12,
        cursor:         loading ? 'not-allowed' : 'pointer',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            6,
        fontFamily:     'Inter, -apple-system, sans-serif',
        transition:     'all 0.2s',
        opacity:        loading ? 0.5 : 1,
      }}
    >
      <div style={{
        width: 7, height: 7, borderRadius: '50%',
        background: user.color, flexShrink: 0,
        boxShadow: hovered ? `0 0 6px ${user.color}80` : 'none',
        transition: 'box-shadow 0.2s',
      }} />
      {user.label}
    </button>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const navigate              = useNavigate()
  const { theme, toggleTheme } = useThemeStore()
  const isDark                = theme === 'dark'

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [cardAnim, setCardAnim] = useState<'idle' | 'shake' | 'exit'>('idle')
  const [focusEmail, setFocusEmail] = useState(false)
  const [focusPwd,   setFocusPwd]   = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  useLoginCanvas(canvasRef, isDark)

  // ── API logic (unchanged) ──────────────────────────────────────────────────
  const doLogin = async (e: string, p: string) => {
    setLoading(true)
    setError(null)
    try {
      const res   = await authApi.login(e, p)
      const { access_token, expires_in } = res.data
      const { setAuth: _setAuth } = useAuthStore.getState()
      const meRes = await authApi.me()
      _setAuth(access_token, meRes.data, expires_in)
      // Success transition
      setCardAnim('exit')
      setTimeout(() => navigate('/chat'), 600)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? '登录失败，请检查邮箱和密码'
      setError(msg)
      setPassword('')
      setCardAnim('shake')
      setTimeout(() => setCardAnim('idle'), 500)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    doLogin(email, password)
  }

  const quickLogin = (u: typeof QUICK_USERS[0]) => {
    setEmail(u.email)
    setPassword(u.password)
    doLogin(u.email, u.password)
  }

  // ── Theme tokens ──────────────────────────────────────────────────────────
  const bg             = isDark ? '#080A12'                    : '#F0EEFF'
  const cardBg         = isDark ? 'rgba(26,29,46,0.50)'        : 'rgba(255,255,255,0.72)'
  const cardBorder     = isDark ? 'rgba(162,155,254,0.10)'     : 'rgba(108,92,231,0.10)'
  const inputBg        = isDark ? 'rgba(15,17,23,0.60)'        : 'rgba(248,249,252,0.80)'
  const inputBorder    = isDark ? 'rgba(162,155,254,0.12)'     : 'rgba(108,92,231,0.12)'
  const inputFocusBg   = isDark ? 'rgba(15,17,23,0.85)'        : 'rgba(255,255,255,0.95)'
  const inputFocusBorder = isDark ? 'rgba(162,155,254,0.40)'   : 'rgba(108,92,231,0.40)'
  const textPrimary    = isDark ? '#E8ECF3'                    : '#1A1D2E'
  const textSecondary  = isDark ? '#5F6B7A'                    : '#5F6B7A'
  const textTertiary   = isDark ? '#3D4256'                    : '#9CA3B4'
  const labelColor     = isDark ? '#5F6B7A'                    : '#9CA3B4'
  const dividerColor   = isDark ? 'rgba(162,155,254,0.08)'     : 'rgba(108,92,231,0.08)'
  const mobiusTrack    = isDark ? 'rgba(162,155,254,0.12)'     : 'rgba(108,92,231,0.10)'
  const mobiusBall     = isDark ? '#A29BFE'                    : '#6C5CE7'
  const errorBorder    = 'rgba(255,71,87,0.35)'
  const cardAnimation  = cardAnim === 'shake' ? 'login-shake 0.4s ease'
    : cardAnim === 'exit' ? 'login-exit 0.6s ease forwards' : undefined

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Injected keyframes ── */}
      <style>{`
        @keyframes lp-float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-6px); }
        }
        @keyframes orb-1 {
          0%, 100% { opacity: 0.08; } 50% { opacity: 0.20; }
        }
        @keyframes orb-2 {
          0%, 100% { opacity: 0.06; } 50% { opacity: 0.16; }
        }
        @keyframes orb-3 {
          0%, 100% { opacity: 0.05; } 50% { opacity: 0.14; }
        }
        @keyframes login-shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        @keyframes login-exit {
          0%   { transform: scale(1);    opacity: 1;   filter: blur(0px); }
          30%  { transform: scale(0.95); opacity: 0.8; filter: blur(2px); }
          65%  { transform: scale(1.03); opacity: 0.5; filter: blur(5px); }
          100% { transform: scale(0.82); opacity: 0;   filter: blur(14px); }
        }
        @keyframes lp-ball-glow {
          0%, 100% { filter: drop-shadow(0 0 4px ${mobiusBall}80); }
          50%       { filter: drop-shadow(0 0 10px ${mobiusBall}CC); }
        }
        @keyframes lp-trail {
          0%   { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -280; }
        }
        @keyframes lp-move {
          0%   { offset-distance: 0%; }
          100% { offset-distance: 100%; }
        }
        .lp-ball {
          offset-path: path('${MOBIUS_PATH}');
          offset-rotate: 0deg;
          animation:
            lp-move      2.5s ease-in-out infinite,
            lp-ball-glow 2.5s ease-in-out infinite;
        }
        .lp-ball-fast {
          offset-path: path('${MOBIUS_PATH}');
          offset-rotate: 0deg;
          animation:
            lp-move      0.55s ease-in-out infinite,
            lp-ball-glow 0.55s ease-in-out infinite;
        }
        .lp-trail {
          animation: lp-trail 2.5s linear infinite;
        }
        .lp-trail-fast {
          animation: lp-trail 0.55s linear infinite;
        }
      `}</style>

      {/* ── Particle canvas ── */}
      <canvas
        ref={canvasRef}
        style={{
          position:      'fixed',
          inset:         0,
          zIndex:        0,
          pointerEvents: 'none',
          background:    bg,
        }}
      />

      {/* ── Atmosphere orbs ── */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', top: -80, right: -50,
          width: 300, height: 300, borderRadius: '50%',
          background: '#6C5CE7', filter: 'blur(60px)',
          animation: 'orb-1 6s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', bottom: -90, left: -60,
          width: 250, height: 250, borderRadius: '50%',
          background: '#00C48C', filter: 'blur(60px)',
          animation: 'orb-2 8s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', top: '42%', left: '12%',
          width: 200, height: 200, borderRadius: '50%',
          background: '#A29BFE', filter: 'blur(60px)',
          animation: 'orb-3 7s ease-in-out infinite',
        }} />
      </div>

      {/* ── Page layout ── */}
      <div style={{
        position:       'relative',
        zIndex:         10,
        minHeight:      '100vh',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '40px 24px',
      }}>

        {/* ── Möbius hero ── */}
        <div style={{ animation: 'lp-float 4s ease-in-out infinite', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* Glow halo under ring */}
          <div style={{
            position:   'absolute',
            width:      200,
            height:     56,
            marginTop:  72,
            background: 'radial-gradient(ellipse at center, rgba(108,92,231,0.18) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          <svg
            viewBox="0 0 160 112"
            width={160}
            height={112}
            style={{ overflow: 'visible', display: 'block' }}
          >
            {/* Track */}
            <path
              d={MOBIUS_PATH}
              fill="none"
              stroke={mobiusTrack}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            {/* Animated trail */}
            <path
              d={MOBIUS_PATH}
              fill="none"
              stroke={mobiusBall}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="65 215"
              className={loading ? 'lp-trail-fast' : 'lp-trail'}
              style={{ opacity: isDark ? 0.55 : 0.45 }}
            />
            {/* Traveling ball */}
            <circle
              r="6"
              fill={mobiusBall}
              className={loading ? 'lp-ball-fast' : 'lp-ball'}
            />
          </svg>
        </div>

        {/* ── Brand text ── */}
        <div style={{
          animation:   'lp-float 4s ease-in-out 0.3s infinite',
          textAlign:   'center',
          marginTop:   16,
          marginBottom: 32,
        }}>
          <div style={{
            fontSize:    28,
            fontWeight:  600,
            color:       textPrimary,
            letterSpacing: '-0.5px',
            fontFamily:  'Inter, -apple-system, sans-serif',
          }}>
            MetadataHub
          </div>
          <div style={{
            fontSize:    14,
            color:       textSecondary,
            letterSpacing: '0.5px',
            marginTop:   6,
            fontFamily:  'Inter, -apple-system, sans-serif',
          }}>
            AI-powered data analytics
          </div>
        </div>

        {/* ── Login card ── */}
        <div
          style={{
            width:              'min(380px, calc(100vw - 48px))',
            padding:            'clamp(24px, 5vw, 36px)',
            borderRadius:       24,
            background:         cardBg,
            backdropFilter:     'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border:             `1px solid ${cardBorder}`,
            boxShadow:          '0 8px 32px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.04)',
            animation:          cardAnimation,
            position:           'relative',
          }}
        >
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={isDark ? 'Switch to light' : 'Switch to dark'}
            style={{
              position:   'absolute',
              top:        14,
              right:      14,
              background: 'none',
              border:     'none',
              cursor:     'pointer',
              fontSize:   16,
              display:    'flex',
              alignItems: 'center',
              padding:    4,
              borderRadius: 8,
              opacity:    0.7,
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.7' }}
          >
            {isDark
              ? <SunOutlined style={{ color: '#FFB946' }} />
              : <MoonOutlined style={{ color: '#6C5CE7' }} />}
          </button>

          {/* Error banner */}
          {error && (
            <div style={{
              padding:      '10px 14px',
              borderRadius: 12,
              background:   'rgba(255,71,87,0.10)',
              border:       `1px solid ${errorBorder}`,
              color:        '#FF4757',
              fontSize:     13,
              marginBottom: 20,
              fontFamily:   'Inter, -apple-system, sans-serif',
            }}>
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Email */}
            <div>
              <label style={{
                display:       'block',
                fontSize:      11,
                fontWeight:    600,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color:         labelColor,
                marginBottom:  8,
                fontFamily:    'Inter, -apple-system, sans-serif',
              }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                autoComplete="email"
                onFocus={() => setFocusEmail(true)}
                onBlur={() => setFocusEmail(false)}
                style={{
                  width:       '100%',
                  padding:     '14px 16px',
                  borderRadius: 14,
                  border:      `1px solid ${focusEmail ? inputFocusBorder : (error ? errorBorder : inputBorder)}`,
                  background:  focusEmail ? inputFocusBg : inputBg,
                  color:       textPrimary,
                  fontSize:    15,
                  fontFamily:  'Inter, -apple-system, sans-serif',
                  outline:     'none',
                  boxSizing:   'border-box',
                  boxShadow:   focusEmail ? `0 0 0 4px rgba(162,155,254,0.08)` : 'none',
                  transition:  'all 0.25s',
                }}
              />
            </div>

            {/* Password */}
            <div>
              <label style={{
                display:       'block',
                fontSize:      11,
                fontWeight:    600,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color:         labelColor,
                marginBottom:  8,
                fontFamily:    'Inter, -apple-system, sans-serif',
              }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  onFocus={() => setFocusPwd(true)}
                  onBlur={() => setFocusPwd(false)}
                  style={{
                    width:       '100%',
                    padding:     '14px 48px 14px 16px',
                    borderRadius: 14,
                    border:      `1px solid ${focusPwd ? inputFocusBorder : (error ? errorBorder : inputBorder)}`,
                    background:  focusPwd ? inputFocusBg : inputBg,
                    color:       textPrimary,
                    fontSize:    15,
                    fontFamily:  'Inter, -apple-system, sans-serif',
                    outline:     'none',
                    boxSizing:   'border-box',
                    boxShadow:   focusPwd ? `0 0 0 4px rgba(162,155,254,0.08)` : 'none',
                    transition:  'all 0.25s',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  style={{
                    position:   'absolute',
                    right:      14,
                    top:        '50%',
                    transform:  'translateY(-50%)',
                    background: 'none',
                    border:     'none',
                    cursor:     'pointer',
                    color:      labelColor,
                    fontSize:   16,
                    display:    'flex',
                    alignItems: 'center',
                    padding:    0,
                  }}
                >
                  {showPwd ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !email || !password}
              onMouseEnter={(e) => {
                if (!loading && email && password) {
                  const btn = e.currentTarget as HTMLButtonElement
                  btn.style.transform  = 'translateY(-1px)'
                  btn.style.boxShadow  = '0 6px 28px rgba(108,92,231,0.50)'
                }
              }}
              onMouseLeave={(e) => {
                const btn = e.currentTarget as HTMLButtonElement
                btn.style.transform  = 'translateY(0)'
                btn.style.boxShadow  = '0 4px 20px rgba(108,92,231,0.35)'
              }}
              onMouseDown={(e) => {
                const btn = e.currentTarget as HTMLButtonElement
                btn.style.transform  = 'translateY(0)'
                btn.style.boxShadow  = '0 2px 12px rgba(108,92,231,0.30)'
              }}
              style={{
                width:        '100%',
                padding:      '15px',
                borderRadius: 14,
                border:       'none',
                fontSize:     15,
                fontWeight:   500,
                cursor:       loading || !email || !password ? 'not-allowed' : 'pointer',
                color:        '#FFFFFF',
                background:   'linear-gradient(135deg, #6C5CE7 0%, #A29BFE 100%)',
                boxShadow:    loading || !email || !password
                  ? 'none'
                  : '0 4px 20px rgba(108,92,231,0.35)',
                letterSpacing: '0.3px',
                fontFamily:   'Inter, -apple-system, sans-serif',
                transition:   'all 0.25s',
                marginTop:    4,
                opacity:      loading || !email || !password ? 0.65 : 1,
              }}
            >
              {loading ? '正在进入宇宙...' : '进入数据宇宙'}
            </button>
          </form>

          {/* Divider */}
          <div style={{
            display:     'flex',
            alignItems:  'center',
            gap:         10,
            margin:      '22px 0 14px',
          }}>
            <div style={{ flex: 1, height: 1, background: dividerColor }} />
            <span style={{
              fontSize:      11,
              color:         textTertiary,
              letterSpacing: '0.5px',
              textTransform: 'uppercase' as const,
              fontFamily:    'Inter, -apple-system, sans-serif',
              whiteSpace:    'nowrap',
            }}>
              quick access
            </span>
            <div style={{ flex: 1, height: 1, background: dividerColor }} />
          </div>

          {/* Quick login grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {QUICK_USERS.map((u) => (
              <QuickBtn
                key={u.email}
                user={u}
                loading={loading}
                isDark={isDark}
                onClick={() => quickLogin(u)}
              />
            ))}
          </div>

          {/* Tagline */}
          <div style={{
            fontSize:      11,
            color:         textTertiary,
            textAlign:     'center',
            marginTop:     20,
            letterSpacing: '0.3px',
            fontFamily:    'Inter, -apple-system, sans-serif',
          }}>
            Data is the new universe. Start exploring.
          </div>
        </div>
      </div>
    </>
  )
}
