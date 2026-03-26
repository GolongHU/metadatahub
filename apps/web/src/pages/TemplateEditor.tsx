import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Select, message, Spin } from 'antd'
import { templateApi } from '../services/templateApi'
import type { TemplateDetail, WidgetConfig, WidgetLibraryItem } from '../types/template'
import { useThemeStore } from '../stores/themeStore'

// ── Helpers ────────────────────────────────────────────────────────────────────

// genId() requires HTTPS (secure context). Use Math.random fallback.
function genId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 64, gap: 4 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: isDark ? 'rgba(232,236,243,0.4)' : 'rgba(26,29,46,0.35)', lineHeight: 1 }}>
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
        padding: '12px 12px 10px',
        position: 'relative',
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
        minHeight: 100,
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

// ── PropPanel sub-components ───────────────────────────────────────────────────

type PropTab = 'data' | 'style' | 'layout'

const COLOR_PALETTES = [
  { id: 'purple', c: ['#6C5CE7', '#A29BFE'] },
  { id: 'blue',   c: ['#3B82F6', '#60A5FA'] },
  { id: 'green',  c: ['#00C48C', '#34D399'] },
  { id: 'gold',   c: ['#F59E0B', '#FBBF24'] },
  { id: 'pink',   c: ['#EC4899', '#F472B6'] },
  { id: 'teal',   c: ['#14B8A6', '#2DD4BF'] },
]

function MobiusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#A29BFE" strokeWidth="1.8">
      <path d="M12 12c-2-2.5-4-4-6-4a4 4 0 000 8c2 0 4-1.5 6-4z"/>
      <path d="M12 12c2 2.5 4 4 6 4a4 4 0 000-8c-2 0-4 1.5-6 4z"/>
    </svg>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!checked)} style={{
      width: 30, height: 17, borderRadius: 9, flexShrink: 0, cursor: 'pointer',
      background: checked ? '#6C5CE7' : 'rgba(255,255,255,0.12)',
      position: 'relative', transition: 'background 0.2s',
    }}>
      <div style={{
        position: 'absolute', width: 13, height: 13, borderRadius: '50%',
        background: '#fff', top: 2, left: checked ? 15 : 2,
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </div>
  )
}

function SliderRow({ label, value, min, max, step = 1, unit = '', onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string;
  onChange: (v: number) => void
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: '#9CA3B4' }}>{label}</span>
        <span style={{ fontSize: 11, color: '#A29BFE', fontVariantNumeric: 'tabular-nums' }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#6C5CE7', cursor: 'pointer' }}
      />
    </div>
  )
}

function TypeGroup({ options, value, onChange }: { options: { id: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
      {options.map(opt => {
        const active = value === opt.id
        return (
          <button key={opt.id} onClick={() => onChange(opt.id)} style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
            border: `1px solid ${active ? '#6C5CE7' : 'rgba(162,155,254,0.15)'}`,
            background: active ? 'rgba(108,92,231,0.18)' : 'transparent',
            color: active ? '#A29BFE' : '#9CA3B4', fontFamily: 'inherit',
          }}>{opt.label}</button>
        )
      })}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, color: '#5F6B7A', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>{children}</div>
}

// ── PropPanel ──────────────────────────────────────────────────────────────────

interface PropPanelProps {
  widget: WidgetConfig
  onUpdate: (wid: string, patch: Partial<WidgetConfig>) => void
  isDark: boolean
  panelBorder: string
}

function PropPanel({ widget, onUpdate, isDark, panelBorder }: PropPanelProps) {
  const [activeTab, setActiveTab] = useState<PropTab>('data')
  const [aiOpen, setAiOpen] = useState(false)
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState('')

  const cfg = widget.config
  const textColor = isDark ? '#E8ECF3' : '#1A1D2E'
  const inputBg = isDark ? 'rgba(15,17,23,0.6)' : 'rgba(248,249,252,0.9)'
  const inputBorder = isDark ? 'rgba(162,155,254,0.10)' : 'rgba(108,92,231,0.12)'

  const baseInput: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 8,
    border: `1px solid ${inputBorder}`, background: inputBg,
    color: textColor, fontSize: 12, fontFamily: 'inherit',
    outline: 'none', boxSizing: 'border-box',
  }

  function upd(patch: Record<string, unknown>) {
    onUpdate(widget.id, { config: { ...cfg, ...patch } })
  }

  function SwitchRow({ label, configKey }: { label: string; configKey: string }) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
        <span style={{ fontSize: 11, color: isDark ? '#9CA3B4' : '#5F6B7A' }}>{label}</span>
        <Toggle checked={!!cfg[configKey]} onChange={v => upd({ [configKey]: v })} />
      </div>
    )
  }

  async function handleAiGenerate() {
    if (!aiInput.trim()) return
    setAiLoading(true); setAiResult('')
    try {
      const res = await templateApi.generateWidgetSql({
        description: aiInput, widget_type: widget.type,
        current_sql: String(cfg.query ?? ''),
      })
      setAiResult(res.data.sql)
    } catch {
      setAiResult('-- AI 生成失败，请手动输入 SQL')
    } finally {
      setAiLoading(false)
    }
  }

  // ── Data Tab ─────────────────────────────────────────────────────────────────
  const renderData = () => (
    <div style={{ padding: '14px 14px 20px' }}>
      <div style={{ marginBottom: 14 }}>
        <SectionLabel>标题</SectionLabel>
        <input value={widget.title} onChange={e => onUpdate(widget.id, { title: e.target.value })} style={baseInput} />
      </div>

      <div style={{ marginBottom: 6 }}>
        <SectionLabel>SQL 查询</SectionLabel>
        <div style={{ position: 'relative' }}>
          <textarea
            value={String(cfg.query ?? '')}
            onChange={e => upd({ query: e.target.value })}
            rows={7}
            style={{
              width: '100%', padding: '8px 10px', paddingBottom: 38, borderRadius: 8,
              border: `1px solid ${isDark ? 'rgba(162,155,254,0.10)' : 'rgba(108,92,231,0.12)'}`,
              background: isDark ? 'rgba(8,10,18,0.90)' : '#1A1D2E',
              color: '#A29BFE', fontSize: 11,
              fontFamily: '"JetBrains Mono","Fira Code",monospace',
              outline: 'none', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box',
            }}
          />
          {/* AI assist bar */}
          <div onClick={() => setAiOpen(v => !v)} style={{
            position: 'absolute', bottom: 6, left: 6, right: 6,
            display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 7,
            background: aiOpen ? 'rgba(108,92,231,0.18)' : 'rgba(108,92,231,0.10)',
            border: '1px solid rgba(108,92,231,0.20)', cursor: 'pointer', transition: 'background 0.15s',
          }}>
            <MobiusIcon />
            <span style={{ flex: 1, fontSize: 10, color: '#A29BFE' }}>用自然语言描述，AI 生成 SQL…</span>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#A29BFE" strokeWidth="2.5">
              <path d={aiOpen ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'}/>
            </svg>
          </div>
        </div>

        {/* AI box */}
        {aiOpen && (
          <div style={{ marginTop: 6, padding: '10px', borderRadius: 10, background: 'rgba(108,92,231,0.06)', border: '1px solid rgba(108,92,231,0.12)' }}>
            <div style={{ fontSize: 10, color: '#A29BFE', fontWeight: 600, marginBottom: 6 }}>AI SQL 助手</div>
            <input
              value={aiInput} onChange={e => setAiInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAiGenerate()}
              placeholder="例：各区域合作伙伴平均得分，只看活跃伙伴"
              style={{
                width: '100%', padding: '6px 8px', borderRadius: 6, outline: 'none',
                border: '1px solid rgba(108,92,231,0.20)',
                background: 'rgba(10,12,20,0.55)', color: '#E8ECF3',
                fontSize: 11, fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
            <button onClick={handleAiGenerate} disabled={aiLoading || !aiInput.trim()} style={{
              marginTop: 6, width: '100%', padding: '5px 0', borderRadius: 6, border: 'none',
              background: aiLoading ? 'rgba(108,92,231,0.12)' : 'rgba(108,92,231,0.28)',
              color: '#A29BFE', fontSize: 11, cursor: aiLoading ? 'wait' : 'pointer', fontFamily: 'inherit',
            }}>
              {aiLoading ? '生成中…' : '生成 SQL →'}
            </button>
            {aiResult && (
              <div style={{ marginTop: 6, padding: '7px 8px', borderRadius: 7, background: 'rgba(0,196,140,0.06)', border: '1px solid rgba(0,196,140,0.14)' }}>
                <pre style={{ fontSize: 10, color: '#00C48C', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6 }}>{aiResult}</pre>
                <button onClick={() => { upd({ query: aiResult }); setAiOpen(false); setAiInput(''); setAiResult('') }} style={{
                  marginTop: 6, width: '100%', padding: '4px 0', borderRadius: 5, border: 'none',
                  background: 'rgba(0,196,140,0.16)', color: '#00C48C', fontSize: 10,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>✓ 采纳此 SQL</button>
              </div>
            )}
          </div>
        )}
        <div style={{ fontSize: 10, color: isDark ? '#2E3450' : 'rgba(108,92,231,0.28)', marginTop: 5 }}>
          使用 {'{table}'} 引用数据集表名
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <div style={{ flex: 1 }}>
          <SectionLabel>排序</SectionLabel>
          <select value={String(cfg.sort ?? 'desc')} onChange={e => upd({ sort: e.target.value })}
            style={{ ...baseInput, appearance: 'none', cursor: 'pointer', padding: '6px 8px' }}>
            <option value="desc">降序</option>
            <option value="asc">升序</option>
            <option value="none">不排序</option>
          </select>
        </div>
        <div style={{ width: 64 }}>
          <SectionLabel>上限</SectionLabel>
          <input type="number" min={1} max={500} value={Number(cfg.limit ?? 50)} onChange={e => upd({ limit: Number(e.target.value) })}
            style={{ ...baseInput, padding: '6px 8px', textAlign: 'center' }} />
        </div>
      </div>
    </div>
  )

  // ── Style Tab ─────────────────────────────────────────────────────────────────
  const renderStyle = () => {
    const palette = String(cfg.color_palette ?? 'purple')
    const divider = <div style={{ height: 1, background: 'rgba(162,155,254,0.06)', margin: '10px 0' }} />

    const colorPicker = (
      <div style={{ marginBottom: 12 }}>
        <SectionLabel>配色方案</SectionLabel>
        <div style={{ display: 'flex', gap: 7 }}>
          {COLOR_PALETTES.map(p => (
            <div key={p.id} onClick={() => upd({ color_palette: p.id })} style={{
              width: 26, height: 26, borderRadius: 8, cursor: 'pointer',
              background: `linear-gradient(135deg,${p.c[0]},${p.c[1]})`,
              outline: palette === p.id ? `2px solid ${p.c[0]}` : '2px solid transparent',
              outlineOffset: 2, transition: 'outline 0.15s',
            }} />
          ))}
        </div>
      </div>
    )

    if (widget.type === 'bar_chart') return (
      <div style={{ padding: '14px 14px 20px' }}>
        <SectionLabel>图表子类型</SectionLabel>
        <TypeGroup
          options={[{id:'vertical',label:'纵向'},{id:'horizontal',label:'横向'},{id:'stacked',label:'堆叠'},{id:'grouped',label:'分组'}]}
          value={String(cfg.bar_type ?? 'vertical')} onChange={v => upd({ bar_type: v })} />
        {colorPicker}
        <SectionLabel>颜色模式</SectionLabel>
        <TypeGroup
          options={[{id:'single',label:'单色'},{id:'gradient',label:'渐变'},{id:'byValue',label:'按值'},{id:'byCategory',label:'按分类'}]}
          value={String(cfg.color_mode ?? 'single')} onChange={v => upd({ color_mode: v })} />
        {divider}
        <SliderRow label="圆角" value={Number(cfg.bar_radius ?? 4)} min={0} max={12} unit="px" onChange={v => upd({ bar_radius: v })} />
        <SliderRow label="柱宽" value={Number(cfg.bar_width ?? 28)} min={10} max={60} unit="px" onChange={v => upd({ bar_width: v })} />
        <SliderRow label="间距" value={Number(cfg.bar_gap ?? 8)} min={2} max={30} unit="px" onChange={v => upd({ bar_gap: v })} />
        {divider}
        <SwitchRow label="显示数值标签" configKey="show_values" />
        <SwitchRow label="显示网格线" configKey="show_grid" />
        <SwitchRow label="显示坐标轴" configKey="show_axis" />
        <SwitchRow label="显示图例" configKey="show_legend" />
        <SwitchRow label="入场动画" configKey="animate" />
      </div>
    )

    if (widget.type === 'line_chart') return (
      <div style={{ padding: '14px 14px 20px' }}>
        <SectionLabel>线条样式</SectionLabel>
        <TypeGroup
          options={[{id:'smooth',label:'平滑'},{id:'straight',label:'直线'},{id:'step',label:'阶梯'}]}
          value={String(cfg.line_style ?? 'smooth')} onChange={v => upd({ line_style: v })} />
        {colorPicker}
        {divider}
        <SliderRow label="线宽" value={Number(cfg.line_width ?? 2.5)} min={1} max={5} step={0.5} unit="px" onChange={v => upd({ line_width: v })} />
        <SliderRow label="数据点大小" value={Number(cfg.point_size ?? 0)} min={0} max={8} unit="px" onChange={v => upd({ point_size: v })} />
        <SliderRow label="填充透明度" value={Number(cfg.area_opacity ?? 8)} min={0} max={30} unit="%" onChange={v => upd({ area_opacity: v })} />
        {divider}
        <SwitchRow label="显示面积填充" configKey="show_area" />
        <SwitchRow label="显示数据点" configKey="show_points" />
        <SwitchRow label="显示网格线" configKey="show_grid" />
        <SwitchRow label="显示图例" configKey="show_legend" />
        <SwitchRow label="入场动画" configKey="animate" />
      </div>
    )

    if (widget.type === 'pie_chart') return (
      <div style={{ padding: '14px 14px 20px' }}>
        <SectionLabel>图表类型</SectionLabel>
        <TypeGroup
          options={[{id:'donut',label:'环形'},{id:'full',label:'实心'},{id:'nightingale',label:'南丁格尔'}]}
          value={String(cfg.pie_type ?? 'donut')} onChange={v => upd({ pie_type: v })} />
        {colorPicker}
        {divider}
        <SliderRow label="内径" value={Number(cfg.inner_radius ?? 45)} min={0} max={70} unit="%" onChange={v => upd({ inner_radius: v })} />
        <SliderRow label="外径" value={Number(cfg.outer_radius ?? 72)} min={50} max={90} unit="%" onChange={v => upd({ outer_radius: v })} />
        <SliderRow label="边框宽度" value={Number(cfg.border_width ?? 2)} min={0} max={6} unit="px" onChange={v => upd({ border_width: v })} />
        {divider}
        <SwitchRow label="显示标签" configKey="show_labels" />
        <SwitchRow label="显示百分比" configKey="show_percentages" />
        <SwitchRow label="显示中心文字" configKey="show_center_text" />
        <SwitchRow label="显示图例" configKey="show_legend" />
        <SwitchRow label="入场动画" configKey="animate" />
      </div>
    )

    if (widget.type === 'kpi_card') return (
      <div style={{ padding: '14px 14px 20px' }}>
        <SectionLabel>数值格式</SectionLabel>
        <TypeGroup
          options={[{id:'number',label:'数字'},{id:'currency',label:'¥ 金额'},{id:'percent',label:'% 百分比'},{id:'custom',label:'自定义'}]}
          value={String(cfg.format ?? 'number')} onChange={v => upd({ format: v })} />
        {colorPicker}
        {divider}
        <SwitchRow label="显示趋势箭头" configKey="show_trend" />
        <SwitchRow label="显示迷你折线" configKey="show_sparkline" />
        <SwitchRow label="阈值高亮" configKey="threshold_highlight" />
        {!!cfg.threshold_highlight && (
          <div style={{ marginTop: 8, padding: '10px 10px 6px', borderRadius: 8, background: 'rgba(162,155,254,0.04)', border: '1px solid rgba(162,155,254,0.06)' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: '#FF6B81', marginBottom: 4 }}>危险低于</div>
                <input type="number" value={String(cfg.danger_threshold ?? '')} onChange={e => upd({ danger_threshold: e.target.value })}
                  style={{ ...baseInput, padding: '5px 8px', fontSize: 11 }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: '#FFB946', marginBottom: 4 }}>警告低于</div>
                <input type="number" value={String(cfg.warning_threshold ?? '')} onChange={e => upd({ warning_threshold: e.target.value })}
                  style={{ ...baseInput, padding: '5px 8px', fontSize: 11 }} />
              </div>
            </div>
          </div>
        )}
      </div>
    )

    if (widget.type === 'radar_chart') return (
      <div style={{ padding: '14px 14px 20px' }}>
        {colorPicker}
        {divider}
        <SliderRow label="填充透明度" value={Number(cfg.fill_opacity ?? 20)} min={5} max={50} unit="%" onChange={v => upd({ fill_opacity: v })} />
        <SliderRow label="线宽" value={Number(cfg.line_width ?? 2)} min={1} max={4} unit="px" onChange={v => upd({ line_width: v })} />
        {divider}
        <SwitchRow label="显示全网均值对比" configKey="show_benchmark" />
        <SwitchRow label="填充面积" configKey="fill_area" />
        <SwitchRow label="显示数值" configKey="show_values" />
        <SwitchRow label="入场动画" configKey="animate" />
      </div>
    )

    if (widget.type === 'ranking_table') return (
      <div style={{ padding: '14px 14px 20px' }}>
        {colorPicker}
        {divider}
        <SwitchRow label="条件配色" configKey="conditional_color" />
        <SwitchRow label="显示排名序号" configKey="show_rank" />
        <SwitchRow label="显示奖牌图标" configKey="show_medal" />
        <SwitchRow label="显示层级标签" configKey="show_tier_label" />
        <SwitchRow label="斑马纹" configKey="striped" />
        <SwitchRow label="显示边框" configKey="show_border" />
        {divider}
        <SliderRow label="每页行数" value={Number(cfg.page_size ?? 15)} min={5} max={30} unit="行" onChange={v => upd({ page_size: v })} />
      </div>
    )

    // alert_list / action_items / fallback
    return (
      <div style={{ padding: '14px 14px 20px' }}>
        {colorPicker}
        {divider}
        <SwitchRow label="显示图标" configKey="show_icon" />
        <SwitchRow label="显示时间戳" configKey="show_timestamp" />
      </div>
    )
  }

  // ── Layout Tab ────────────────────────────────────────────────────────────────
  const renderLayout = () => (
    <div style={{ padding: '14px 14px 20px' }}>
      <div style={{ marginBottom: 16 }}>
        <SectionLabel>列宽（Col Span）</SectionLabel>
        <div style={{ display: 'flex', gap: 5 }}>
          {[1, 2, 3, 4, 6].map(n => {
            const active = widget.position.col_span === n
            return (
              <button key={n} onClick={() => onUpdate(widget.id, { position: { ...widget.position, col_span: n } })} style={{
                flex: 1, height: 32, borderRadius: 7, cursor: 'pointer',
                border: `1px solid ${active ? '#6C5CE7' : 'rgba(162,155,254,0.15)'}`,
                background: active ? 'rgba(108,92,231,0.18)' : 'transparent',
                color: active ? '#A29BFE' : '#9CA3B4',
                fontSize: 12, fontWeight: active ? 600 : 400, fontFamily: 'inherit',
              }}>{n}</button>
            )
          })}
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <SectionLabel>行高</SectionLabel>
        <div style={{ display: 'flex', gap: 5 }}>
          {([{v:1,l:'1x'},{v:2,l:'2x'},{v:3,l:'3x'}] as {v:number;l:string}[]).map(({v, l}) => {
            const active = (widget.position.row_span ?? 1) === v
            return (
              <button key={v} onClick={() => onUpdate(widget.id, { position: { ...widget.position, row_span: v } })} style={{
                flex: 1, height: 32, borderRadius: 7, cursor: 'pointer',
                border: `1px solid ${active ? '#6C5CE7' : 'rgba(162,155,254,0.15)'}`,
                background: active ? 'rgba(108,92,231,0.18)' : 'transparent',
                color: active ? '#A29BFE' : '#9CA3B4',
                fontSize: 12, fontWeight: active ? 600 : 400, fontFamily: 'inherit',
              }}>{l}</button>
            )
          })}
        </div>
      </div>
      <SliderRow label="内边距" value={Number(cfg.padding ?? 16)} min={8} max={32} unit="px" onChange={v => upd({ padding: v })} />
    </div>
  )

  const tabs: { id: PropTab; label: string }[] = [
    { id: 'data', label: 'Data' }, { id: 'style', label: 'Style' }, { id: 'layout', label: 'Layout' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${panelBorder}`, flexShrink: 0 }}>
        {tabs.map(tab => (
          <div key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            flex: 1, padding: '11px 4px', textAlign: 'center', fontSize: 11, cursor: 'pointer',
            color: activeTab === tab.id ? '#A29BFE' : '#5F6B7A',
            borderBottom: `2px solid ${activeTab === tab.id ? '#6C5CE7' : 'transparent'}`,
            transition: 'color 0.15s, border-color 0.15s', userSelect: 'none',
          }}>{tab.label}</div>
        ))}
      </div>
      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {activeTab === 'data'   && renderData()}
        {activeTab === 'style'  && renderStyle()}
        {activeTab === 'layout' && renderLayout()}
      </div>
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
    const newId = genId()
    setWidgets(prev => {
      const maxRow = prev.length > 0 ? Math.max(...prev.map(w => w.position.row)) : -1
      const defaultSpan: Record<string, number> = {
        kpi_card: 2, ranking_table: 6, bar_chart: 3, line_chart: 3, pie_chart: 2, radar_chart: 3,
      }
      const newWidget: WidgetConfig = {
        id: newId,
        type: item.id,
        title: item.name,
        config: item.default_config ?? {},
        position: { row: maxRow + 1, col: 0, col_span: defaultSpan[item.id] ?? 3, row_span: 1 },
      }
      return [...prev, newWidget]
    })
    setSelectedWidgetId(newId)
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

  // Panel colors
  const panelBg    = isDark ? 'rgba(11,13,20,0.85)' : 'rgba(255,255,255,0.82)'
  const panelBorder = isDark ? 'rgba(162,155,254,0.05)' : 'rgba(108,92,231,0.07)'
  const topbarBg   = isDark ? 'rgba(15,17,26,0.70)' : 'rgba(255,255,255,0.75)'
  const canvasBg   = isDark ? 'rgba(8,10,18,0.50)' : 'rgba(244,243,255,0.50)'
  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
      background: isDark ? '#080A12' : '#F4F3FF',
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
        flexWrap: 'nowrap', overflow: 'hidden',
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
          maxTagCount={1}
          maxTagTextLength={6}
          maxTagPlaceholder={(omitted) => `+${omitted.length}`}
          popupMatchSelectWidth={false}
          style={{ width: 160, flexShrink: 0 }}
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
          width: 220, flexShrink: 0,
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
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', margin: '0 6px 3px',
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
                  width: 36, height: 36, borderRadius: 9, background: wStyle.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {WidgetIcons[item.id]?.(wStyle.color)}
                </div>
                {/* Text */}
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: isDark ? '#C8CDD8' : '#2D3142', lineHeight: 1.3 }}>
                    {item.name}
                  </div>
                  {item.description && (
                    <div style={{ fontSize: 11, color: '#5F6B7A', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.description}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Center: Canvas ── */}
        <div style={{ flex: 1, overflowY: 'auto', background: canvasBg, padding: 20 }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: 10,
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
          width: 280, flexShrink: 0,
          background: panelBg,
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderLeft: `1px solid ${panelBorder}`,
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
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
            <PropPanel widget={selectedWidget} onUpdate={updateWidget} isDark={isDark} panelBorder={panelBorder} />
          )}
        </div>
      </div>
    </div>
  )
}
