import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Select, message, Spin, Switch } from 'antd'
import { templateApi } from '../services/templateApi'
import type { TemplateDetail, WidgetConfig, WidgetLibraryItem } from '../types/template'
import { useThemeStore } from '../stores/themeStore'

// ── Helpers ────────────────────────────────────────────────────────────────────

function deepMerge<T>(base: T, patch: Partial<T>): T {
  return { ...base, ...patch }
}

const ROLE_OPTIONS = [
  { value: 'admin',   label: '管理员' },
  { value: 'analyst', label: '区域主管' },
  { value: 'viewer',  label: '伙伴经理' },
  { value: 'partner', label: '合作伙伴' },
]

// ── SVG Icons ─────────────────────────────────────────────────────────────────

const WidgetIcons: Record<string, (color: string) => JSX.Element> = {
  kpi_card: (c) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5">
      <rect x="3" y="8" width="18" height="8" rx="2"/>
      <path d="M7 12h2m4 0h4"/>
    </svg>
  ),
  line_chart: (c) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5">
      <polyline points="4 18 8 12 12 14 16 8 20 10"/>
    </svg>
  ),
  bar_chart: (c) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5">
      <rect x="4" y="10" width="4" height="8" rx="1"/>
      <rect x="10" y="6" width="4" height="12" rx="1"/>
      <rect x="16" y="3" width="4" height="15" rx="1"/>
    </svg>
  ),
  pie_chart: (c) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5">
      <circle cx="12" cy="12" r="8"/>
      <path d="M12 4v8l5.7 5.7"/>
    </svg>
  ),
  radar_chart: (c) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5">
      <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/>
    </svg>
  ),
  ranking_table: (c) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5">
      <path d="M4 6h16M4 10h12M4 14h14M4 18h10"/>
    </svg>
  ),
  alert_list: (c) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5">
      <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>
  ),
  action_items: (c) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5">
      <path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
    </svg>
  ),
}

const WIDGET_STYLE: Record<string, { bg: string; color: string }> = {
  kpi_card:      { bg: 'rgba(162,155,254,0.08)', color: '#A29BFE' },
  line_chart:    { bg: 'rgba(59,130,246,0.08)',  color: '#60A5FA' },
  bar_chart:     { bg: 'rgba(0,200,140,0.08)',   color: '#00C48C' },
  pie_chart:     { bg: 'rgba(255,185,70,0.08)',  color: '#FFB946' },
  radar_chart:   { bg: 'rgba(108,92,231,0.08)',  color: '#6C5CE7' },
  ranking_table: { bg: 'rgba(0,200,140,0.08)',   color: '#00C48C' },
  alert_list:    { bg: 'rgba(255,71,87,0.08)',   color: '#FF6B81' },
  action_items:  { bg: 'rgba(59,130,246,0.08)',  color: '#60A5FA' },
}

function getWidgetSvg(type: string, size = 15): JSX.Element {
  const style = WIDGET_STYLE[type] ?? { bg: 'rgba(162,155,254,0.08)', color: '#A29BFE' }
  const fn = WidgetIcons[type]
  return fn ? fn(style.color) : (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={style.color} strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
    </svg>
  )
}

// ── Widget Preview ─────────────────────────────────────────────────────────────

function WidgetPreview({ type, isDark }: { type: string; isDark: boolean }) {
  const dimColor = isDark ? 'rgba(162,155,254,' : 'rgba(108,92,231,'

  if (type === 'kpi_card') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 52, gap: 2 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: isDark ? 'rgba(232,236,243,0.4)' : 'rgba(26,29,46,0.35)', lineHeight: 1 }}>
          45
        </div>
        <div style={{ fontSize: 9, color: isDark ? '#3D4256' : 'rgba(108,92,231,0.25)', letterSpacing: '0.03em' }}>
          partners
        </div>
      </div>
    )
  }

  if (type === 'bar_chart') {
    const bars = [55, 80, 45, 95, 65]
    return (
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 3, height: 52, padding: '6px 8px 2px' }}>
        {bars.map((h, i) => (
          <div key={i} style={{
            flex: 1,
            height: `${h}%`,
            borderRadius: '2px 2px 0 0',
            background: `${dimColor}${0.12 + i * 0.04})`,
          }} />
        ))}
      </div>
    )
  }

  if (type === 'line_chart') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 52 }}>
        <svg width="80" height="36" viewBox="0 0 80 36" fill="none">
          <polyline
            points="0,28 16,18 32,22 48,10 64,14 80,8"
            stroke={isDark ? 'rgba(162,155,254,0.4)' : 'rgba(108,92,231,0.35)'}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    )
  }

  if (type === 'pie_chart' || type === 'radar_chart') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 52 }}>
        <svg width="38" height="38" viewBox="0 0 38 38">
          <circle cx="19" cy="19" r="14" fill="none" stroke={`${dimColor}0.08)`} strokeWidth="8"/>
          <circle cx="19" cy="19" r="14" fill="none"
            stroke={`${dimColor}0.30)`} strokeWidth="8"
            strokeDasharray="35 53" strokeDashoffset="0"
            strokeLinecap="round"/>
          <circle cx="19" cy="19" r="14" fill="none"
            stroke={`${dimColor}0.18)`} strokeWidth="8"
            strokeDasharray="20 68" strokeDashoffset="-35"
            strokeLinecap="round"/>
        </svg>
      </div>
    )
  }

  if (type === 'ranking_table') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5, height: 52, padding: '4px 8px' }}>
        {[80, 60, 40].map((w, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, fontSize: 7, color: isDark ? '#3D4256' : 'rgba(108,92,231,0.25)', textAlign: 'right', flexShrink: 0 }}>
              {i + 1}
            </div>
            <div style={{ height: 5, width: `${w}%`, borderRadius: 2, background: `${dimColor}${0.14 - i * 0.03})` }} />
          </div>
        ))}
      </div>
    )
  }

  if (type === 'alert_list') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5, height: 52, padding: '4px 8px' }}>
        {[1, 2].map((i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,71,87,0.35)', flexShrink: 0 }} />
            <div style={{ height: 4, flex: 1, borderRadius: 2, background: isDark ? 'rgba(255,71,87,0.08)' : 'rgba(255,71,87,0.06)' }} />
          </div>
        ))}
      </div>
    )
  }

  if (type === 'action_items') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5, height: 52, padding: '4px 8px' }}>
        {[90, 65, 75].map((w, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: 2, border: `1px solid ${isDark ? 'rgba(59,130,246,0.3)' : 'rgba(59,130,246,0.25)'}`, flexShrink: 0 }} />
            <div style={{ height: 4, width: `${w}%`, borderRadius: 2, background: isDark ? 'rgba(59,130,246,0.10)' : 'rgba(59,130,246,0.08)' }} />
          </div>
        ))}
      </div>
    )
  }

  // fallback
  return (
    <div style={{ height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 20, borderRadius: 4, background: `${dimColor}0.06)` }} />
    </div>
  )
}

// ── CanvasWidget ───────────────────────────────────────────────────────────────

interface CanvasWidgetProps {
  widget: WidgetConfig
  index: number
  isSelected: boolean
  isDark: boolean
  onSelect: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}

function CanvasWidget({ widget, index: _index, isSelected, isDark, onSelect, onMoveUp, onMoveDown, onRemove }: CanvasWidgetProps) {
  const [hovered, setHovered] = useState(false)
  const style = WIDGET_STYLE[widget.type] ?? { bg: 'rgba(162,155,254,0.08)', color: '#A29BFE' }

  const border = isSelected
    ? '1.5px solid #6C5CE7'
    : isDark
      ? `1px solid ${hovered ? 'rgba(162,155,254,0.18)' : 'rgba(162,155,254,0.06)'}`
      : `1px solid ${hovered ? 'rgba(108,92,231,0.20)' : 'rgba(108,92,231,0.07)'}`

  const bg = isSelected
    ? isDark ? 'rgba(108,92,231,0.10)' : 'rgba(108,92,231,0.05)'
    : isDark ? 'rgba(26,29,46,0.45)' : 'rgba(255,255,255,0.65)'

  const shadow = isSelected ? '0 0 0 3px rgba(108,92,231,0.12)' : 'none'

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        gridColumn: `span ${widget.position.col_span}`,
        borderRadius: 14,
        background: bg,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border,
        boxShadow: shadow,
        padding: '10px 10px 8px',
        position: 'relative',
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
        minHeight: 80,
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
        <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          {getWidgetSvg(widget.type, 12)}
        </span>
        <span style={{ fontSize: 11, fontWeight: 500, color: isDark ? '#C8CDD8' : '#2D3142', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {widget.title || widget.type}
        </span>

        {/* Action buttons — hidden until hover */}
        <div style={{ display: 'flex', gap: 2, opacity: hovered ? 1 : 0, transition: 'opacity 0.15s', flexShrink: 0 }}>
          {[
            {
              title: '上移',
              icon: <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 7l3-4 3 4"/></svg>,
              onClick: (e: React.MouseEvent) => { e.stopPropagation(); onMoveUp() },
              danger: false,
            },
            {
              title: '下移',
              icon: <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3l3 4 3-4"/></svg>,
              onClick: (e: React.MouseEvent) => { e.stopPropagation(); onMoveDown() },
              danger: false,
            },
            {
              title: '删除',
              icon: <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 2l6 6M8 2L2 8"/></svg>,
              onClick: (e: React.MouseEvent) => { e.stopPropagation(); onRemove() },
              danger: true,
            },
          ].map((btn, i) => (
            <button
              key={i}
              title={btn.title}
              onClick={btn.onClick}
              style={{
                width: 22, height: 22, borderRadius: 6, border: 'none',
                background: 'transparent',
                color: isDark ? '#5F6B7A' : '#9CA3B4',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0,
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget
                el.style.background = btn.danger ? 'rgba(255,71,87,0.12)' : 'rgba(162,155,254,0.10)'
                el.style.color = btn.danger ? '#FF6B81' : '#A29BFE'
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget
                el.style.background = 'transparent'
                el.style.color = isDark ? '#5F6B7A' : '#9CA3B4'
              }}
            >
              {btn.icon}
            </button>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div style={{ borderRadius: 6, background: isDark ? 'rgba(162,155,254,0.03)' : 'rgba(108,92,231,0.03)', overflow: 'hidden' }}>
        <WidgetPreview type={widget.type} isDark={isDark} />
      </div>

      {/* Footer */}
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 9, color: isDark ? '#2E3450' : 'rgba(108,92,231,0.25)', letterSpacing: '0.02em' }}>
          span {widget.position.col_span}
        </span>
        {widget.type !== 'kpi_card' && (
          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: `${style.bg}`, color: style.color, opacity: 0.7 }}>
            {widget.type.replace('_', ' ')}
          </span>
        )}
      </div>
    </div>
  )
}

// ── PropRow helper ─────────────────────────────────────────────────────────────

function PropLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, color: '#5F6B7A', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 6 }}>
      {children}
    </div>
  )
}

// ── Main Editor ────────────────────────────────────────────────────────────────

export default function TemplateEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  const [_template, setTemplate] = useState<TemplateDetail | null>(null)
  const [name, setName] = useState('')
  const [assignedRoles, setAssignedRoles] = useState<string[]>([])
  const [widgets, setWidgets] = useState<WidgetConfig[]>([])
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null)
  const [widgetLibrary, setWidgetLibrary] = useState<WidgetLibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        if (id !== 'new') {
          const res = await templateApi.get(id!)
          const t = res.data
          setTemplate(t)
          setName(t.name)
          setAssignedRoles(t.assigned_roles ?? [])
          setWidgets(t.config?.widgets ?? [])
        }
        const libRes = await templateApi.widgetLibrary()
        setWidgetLibrary(libRes.data)
      } catch {
        message.error('加载失败')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const handleAddWidget = useCallback((item: WidgetLibraryItem) => {
    setWidgets(prev => {
      const maxRow = prev.length > 0 ? Math.max(...prev.map(w => w.position.row)) : -1
      const defaultSpan: Record<string, number> = {
        kpi_card: 2, ranking_table: 6, bar_chart: 3, line_chart: 3, pie_chart: 2, radar_chart: 3,
      }
      const newWidget: WidgetConfig = {
        id: crypto.randomUUID(),
        type: item.id,
        title: item.name,
        config: item.default_config ?? {},
        position: { row: maxRow + 1, col: 0, col_span: defaultSpan[item.id] ?? 3, row_span: 1 },
      }
      return [...prev, newWidget]
    })
  }, [])

  const moveWidget = useCallback((index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= widgets.length) return
    setWidgets(prev => {
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }, [widgets.length])

  const removeWidget = useCallback((wid: string) => {
    setWidgets(prev => prev.filter(w => w.id !== wid))
    setSelectedWidgetId(prev => (prev === wid ? null : prev))
  }, [])

  const updateWidget = useCallback((wid: string, patch: Partial<WidgetConfig>) => {
    setWidgets(prev => prev.map(w => w.id === wid ? deepMerge(w, patch) : w))
  }, [])

  const handleSave = async () => {
    if (!name.trim()) { message.error('请输入模板名称'); return }
    setSaving(true)
    try {
      const configData = { layout: { columns: 6, row_height: 160 }, widgets, filters: [] }
      if (id === 'new') {
        const r = await templateApi.create({ name, config: configData, assigned_roles: assignedRoles })
        message.success('模板已创建')
        navigate(`/templates/${r.data.id}`)
      } else {
        await templateApi.update(id!, { name, config: configData, assigned_roles: assignedRoles })
        message.success('模板已保存')
      }
    } catch {
      message.error('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0c14' }}>
        <Spin size="large" />
      </div>
    )
  }

  const selectedWidget = widgets.find(w => w.id === selectedWidgetId) ?? null
  const selectedLibraryItem = selectedWidget
    ? widgetLibrary.find(item => item.id === selectedWidget.type) ?? null
    : null
  const hasQueryField = selectedLibraryItem
    ? 'query' in (selectedLibraryItem.config_schema?.properties as Record<string, unknown> ?? {})
    : false

  // Panel colors
  const panelBg    = isDark ? 'rgba(11,13,20,0.85)' : 'rgba(255,255,255,0.82)'
  const panelBorder = isDark ? 'rgba(162,155,254,0.05)' : 'rgba(108,92,231,0.07)'
  const topbarBg   = isDark ? 'rgba(15,17,26,0.70)' : 'rgba(255,255,255,0.75)'
  const canvasBg   = isDark ? 'rgba(8,10,18,0.50)' : 'rgba(244,243,255,0.50)'
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: `1px solid ${isDark ? 'rgba(162,155,254,0.10)' : 'rgba(108,92,231,0.12)'}`,
    background: isDark ? 'rgba(15,17,23,0.6)' : 'rgba(248,249,252,0.8)',
    color: isDark ? '#E8ECF3' : '#1A1D2E',
    fontSize: 12, fontFamily: 'inherit', outline: 'none',
    marginBottom: 12, boxSizing: 'border-box' as const,
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
      background: isDark ? '#080A12' : '#F4F3FF',
      zIndex: 300,
    }}>
      {/* ── Topbar ── */}
      <div style={{
        height: 52, flexShrink: 0,
        background: topbarBg,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${panelBorder}`,
        padding: '0 16px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {/* Back */}
        <button
          onClick={() => navigate('/templates')}
          style={{
            width: 32, height: 32, borderRadius: 9, border: `1px solid ${panelBorder}`,
            background: isDark ? 'rgba(162,155,254,0.06)' : 'rgba(108,92,231,0.06)',
            color: isDark ? '#9CA3B4' : '#5F6B7A',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M5 12l7-7M5 12l7 7"/>
          </svg>
        </button>

        {/* Name input */}
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="模板名称"
          style={{
            width: 220, padding: '6px 10px', borderRadius: 8,
            border: `1px solid ${isDark ? 'rgba(162,155,254,0.10)' : 'rgba(108,92,231,0.12)'}`,
            background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.7)',
            color: isDark ? '#E8ECF3' : '#1A1D2E',
            fontSize: 13, fontFamily: 'inherit', outline: 'none',
          }}
        />

        {/* Role selector */}
        <Select
          mode="multiple"
          value={assignedRoles}
          onChange={setAssignedRoles}
          options={ROLE_OPTIONS}
          placeholder="分配角色"
          style={{ width: 180 }}
          size="small"
        />

        <div style={{ flex: 1 }} />

        {/* Widget count */}
        <span style={{ fontSize: 11, color: isDark ? '#3D4256' : 'rgba(108,92,231,0.35)' }}>
          {widgets.length} 个组件
        </span>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            height: 32, padding: '0 16px', borderRadius: 9, border: 'none',
            background: 'linear-gradient(135deg, #6C5CE7, #A29BFE)',
            color: '#fff', fontSize: 12, fontWeight: 500,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
            display: 'flex', alignItems: 'center', gap: 6,
            boxShadow: '0 2px 10px rgba(108,92,231,0.28)',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
          </svg>
          {saving ? '保存中…' : '保存'}
        </button>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Left: Widget Palette ── */}
        <div style={{
          width: 200, flexShrink: 0,
          background: panelBg,
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRight: `1px solid ${panelBorder}`,
          overflowY: 'auto',
          paddingBottom: 12,
        }}>
          <div style={{ padding: '14px 14px 10px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#5F6B7A' }}>
            组件库
          </div>

          {widgetLibrary.map(item => {
            const wStyle = WIDGET_STYLE[item.id] ?? { bg: 'rgba(162,155,254,0.08)', color: '#A29BFE' }
            return (
              <div
                key={item.id}
                onClick={() => handleAddWidget(item)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 14px', margin: '0 6px 2px',
                  borderRadius: 10, cursor: 'pointer',
                  border: '1px solid transparent',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLDivElement
                  el.style.background = isDark ? 'rgba(162,155,254,0.05)' : 'rgba(108,92,231,0.04)'
                  el.style.borderColor = isDark ? 'rgba(162,155,254,0.08)' : 'rgba(108,92,231,0.08)'
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLDivElement
                  el.style.background = 'transparent'
                  el.style.borderColor = 'transparent'
                }}
              >
                {/* Icon block */}
                <div style={{
                  width: 30, height: 30, borderRadius: 8, background: wStyle.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {WidgetIcons[item.id]?.(wStyle.color)}
                </div>
                {/* Text */}
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: isDark ? '#C8CDD8' : '#2D3142', lineHeight: 1.3 }}>
                    {item.name}
                  </div>
                  {item.description && (
                    <div style={{ fontSize: 10, color: '#5F6B7A', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.description}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Center: Canvas ── */}
        <div style={{ flex: 1, overflowY: 'auto', background: canvasBg, padding: 16 }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: 8,
            minHeight: 300,
            alignContent: 'start',
          }}>
            {widgets.map((widget, index) => (
              <CanvasWidget
                key={widget.id}
                widget={widget}
                index={index}
                isSelected={selectedWidgetId === widget.id}
                isDark={isDark}
                onSelect={() => setSelectedWidgetId(widget.id)}
                onMoveUp={() => moveWidget(index, -1)}
                onMoveDown={() => moveWidget(index, 1)}
                onRemove={() => removeWidget(widget.id)}
              />
            ))}

            {widgets.length === 0 && (
              <div style={{
                gridColumn: 'span 6', height: 240,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
                color: isDark ? '#2E3450' : 'rgba(108,92,231,0.25)',
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                  <rect x="3" y="3" width="8" height="5" rx="1.5"/>
                  <rect x="13" y="3" width="8" height="5" rx="1.5"/>
                  <rect x="3" y="11" width="18" height="5" rx="1.5"/>
                  <rect x="3" y="19" width="8" height="2" rx="1"/>
                  <rect x="13" y="19" width="8" height="2" rx="1"/>
                </svg>
                <div style={{ fontSize: 13 }}>点击左侧组件添加到画布</div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Properties Panel ── */}
        <div style={{
          width: 240, flexShrink: 0,
          background: panelBg,
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderLeft: `1px solid ${panelBorder}`,
          overflowY: 'auto',
        }}>
          <div style={{
            padding: '14px 14px 10px',
            fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#5F6B7A',
            borderBottom: `1px solid ${panelBorder}`,
            marginBottom: 14,
          }}>
            属性
          </div>

          {!selectedWidget ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={isDark ? '#2E3450' : 'rgba(108,92,231,0.2)'} strokeWidth="1" style={{ marginBottom: 10 }}>
                <rect x="3" y="5" width="18" height="14" rx="2"/>
                <path d="M9 9h6M9 13h4"/>
              </svg>
              <div style={{ fontSize: 12, color: isDark ? '#3D4256' : 'rgba(108,92,231,0.3)', lineHeight: 1.7 }}>
                点击画布中的组件<br />以编辑属性
              </div>
            </div>
          ) : (
            <div style={{ padding: '0 14px 14px' }}>

              {/* Title */}
              <div style={{ marginBottom: 12 }}>
                <PropLabel>标题</PropLabel>
                <input
                  value={selectedWidget.title}
                  onChange={e => updateWidget(selectedWidget.id, { title: e.target.value })}
                  style={inputStyle}
                />
              </div>

              {/* Col span buttons */}
              <div style={{ marginBottom: 12 }}>
                <PropLabel>列宽</PropLabel>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[1, 2, 3, 4, 6].map(n => {
                    const active = selectedWidget.position.col_span === n
                    return (
                      <button
                        key={n}
                        onClick={() => updateWidget(selectedWidget.id, { position: { ...selectedWidget.position, col_span: n } })}
                        style={{
                          width: 30, height: 28, borderRadius: 6, cursor: 'pointer',
                          border: `1px solid ${active ? '#6C5CE7' : isDark ? 'rgba(162,155,254,0.10)' : 'rgba(108,92,231,0.12)'}`,
                          background: active
                            ? 'rgba(108,92,231,0.12)'
                            : isDark ? 'transparent' : 'rgba(248,249,252,0.6)',
                          color: active ? '#A29BFE' : isDark ? '#5F6B7A' : '#9CA3B4',
                          fontSize: 11, fontFamily: 'inherit',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {n}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* SQL */}
              {hasQueryField && (
                <div style={{ marginBottom: 12 }}>
                  <PropLabel>SQL 查询</PropLabel>
                  <textarea
                    value={String(selectedWidget.config.query ?? '')}
                    onChange={e => updateWidget(selectedWidget.id, { config: { ...selectedWidget.config, query: e.target.value } })}
                    rows={6}
                    style={{
                      width: '100%', padding: '8px 10px', borderRadius: 8,
                      border: `1px solid ${isDark ? 'rgba(162,155,254,0.10)' : 'rgba(108,92,231,0.12)'}`,
                      background: isDark ? 'rgba(8,10,18,0.80)' : '#1A1D2E',
                      color: '#A29BFE', fontSize: 11,
                      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                      outline: 'none', resize: 'vertical',
                      lineHeight: 1.6, boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ fontSize: 10, color: isDark ? '#2E3450' : 'rgba(108,92,231,0.30)', marginTop: -8, marginBottom: 4 }}>
                    Use {'{table}'} for dataset table
                  </div>
                </div>
              )}

              {/* Format (kpi_card) */}
              {selectedWidget.type === 'kpi_card' && (
                <div style={{ marginBottom: 12 }}>
                  <PropLabel>格式</PropLabel>
                  <select
                    value={String(selectedWidget.config.format ?? 'number')}
                    onChange={e => updateWidget(selectedWidget.id, { config: { ...selectedWidget.config, format: e.target.value } })}
                    style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
                  >
                    <option value="number">数字</option>
                    <option value="currency">货币 (¥)</option>
                    <option value="percent">百分比 (%)</option>
                    <option value="decimal">小数</option>
                  </select>
                </div>
              )}

              {/* Smooth (line_chart) */}
              {selectedWidget.type === 'line_chart' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 11, color: isDark ? '#9CA3B4' : '#5F6B7A' }}>平滑曲线</span>
                  <Switch
                    size="small"
                    checked={!!selectedWidget.config.smooth}
                    onChange={v => updateWidget(selectedWidget.id, { config: { ...selectedWidget.config, smooth: v } })}
                  />
                </div>
              )}

              {/* Donut (pie_chart) */}
              {selectedWidget.type === 'pie_chart' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 11, color: isDark ? '#9CA3B4' : '#5F6B7A' }}>环形图</span>
                  <Switch
                    size="small"
                    checked={!!selectedWidget.config.donut}
                    onChange={v => updateWidget(selectedWidget.id, { config: { ...selectedWidget.config, donut: v } })}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
