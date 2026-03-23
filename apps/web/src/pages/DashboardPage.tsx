import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  ExpandOutlined,
  FilterOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
} from '@ant-design/icons'
import {
  Button,
  Empty,
  Input,
  Modal,
  Select,
  Space,
  Tabs,
  Tooltip,
  Typography,
  message,
} from 'antd'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ChartWidget from '../components/ChartWidget'
import { dashboardApi, datasetsApi, queryApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import { useChatStore, type RecentQuery } from '../stores/chatStore'
import { useThemeStore } from '../stores/themeStore'
import { useViewStore } from '../stores/useViewStore'
import type {
  ChartType,
  DashboardConfig,
  DashboardDetail,
  DashboardFilter,
  DashboardListItem,
  DashboardWidget,
  Dataset,
  QueryData,
  WidgetResult,
} from '../types'

const { Text } = Typography
const { TextArea } = Input

// ── Constants ─────────────────────────────────────────────────────────────────

const CHART_TYPE_LABEL: Record<string, string> = {
  bar: '柱状图',
  bar_horizontal: '横向柱状图',
  line: '折线图',
  pie: '饼图',
  table: '数据表',
}

const TYPE_LABEL: Record<string, { label: string; color: string }> = {
  fixed: { label: '固定', color: '#6C5CE7' },
  auto: { label: '自动', color: '#00C48C' },
  personal: { label: '个人', color: '#3B82F6' },
}

const GROUP_LABEL: Record<string, string> = {
  fixed: '固定看板',
  auto: '自动生成',
  personal: '个人看板',
}

// ── Injected Styles ───────────────────────────────────────────────────────────

const INJECTED_STYLES = `
@keyframes live-pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
@keyframes db-ping { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(1.65); opacity: 0; } }
@keyframes db-expand { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } }
@keyframes db-ball { 0% { offset-distance: 0%; } 100% { offset-distance: 100%; } }
@keyframes db-trail { 0% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: -280; } }
@keyframes db-glow { 0%,100% { filter: drop-shadow(0 0 3px rgba(255,255,255,0.6)); } 50% { filter: drop-shadow(0 0 8px rgba(255,255,255,0.95)); } }
.db-ball-anim { offset-path: path('M24,56 C24,24 56,8 80,40 C104,72 136,56 136,56 C136,56 136,88 112,72 C88,40 56,56 24,56 Z'); offset-rotate: 0deg; animation: db-ball 2.5s ease-in-out infinite, db-glow 2.5s ease-in-out infinite; }
.db-ball-fast { offset-path: path('M24,56 C24,24 56,8 80,40 C104,72 136,56 136,56 C136,56 136,88 112,72 C88,40 56,56 24,56 Z'); offset-rotate: 0deg; animation: db-ball 0.7s ease-in-out infinite, db-glow 0.7s ease-in-out infinite; }
.db-trail-anim { animation: db-trail 2.5s linear infinite; }
.db-trail-fast { animation: db-trail 0.7s linear infinite; }
`

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatValue(numVal: number): string {
  if (numVal >= 1e8) return `${(numVal / 1e8).toFixed(2)}亿`
  if (numVal >= 1e4) return `${(numVal / 1e4).toFixed(1)}万`
  return String(numVal)
}

// ── KpiCard ───────────────────────────────────────────────────────────────────

function KpiCard({ widget, result, isDark }: { widget: DashboardWidget; result?: WidgetResult; isDark: boolean }) {
  const [hovered, setHovered] = useState(false)

  const cardBase: React.CSSProperties = {
    borderRadius: 18,
    background: hovered
      ? (isDark ? 'rgba(42,37,80,0.35)' : 'rgba(255,255,255,0.82)')
      : (isDark ? 'rgba(26,29,46,0.4)' : 'rgba(255,255,255,0.65)'),
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: hovered
      ? `1px solid rgba(${isDark ? '162,155,254' : '108,92,231'},0.15)`
      : `1px solid rgba(${isDark ? '162,155,254' : '108,92,231'},0.08)`,
    boxShadow: isDark
      ? '0 4px 24px rgba(0,0,0,0.2)'
      : '0 2px 12px rgba(108,92,231,0.04), inset 0 1px 0 rgba(255,255,255,0.8)',
    padding: '18px 22px',
    transition: 'background 0.2s, border-color 0.2s, box-shadow 0.2s',
    cursor: 'default',
  }

  if (!result) {
    return (
      <div
        style={cardBase}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div
          style={{
            height: 11,
            width: '55%',
            borderRadius: 6,
            background: isDark ? 'rgba(162,155,254,0.08)' : 'rgba(0,0,0,0.06)',
            marginBottom: 14,
            animation: 'live-pulse 1.5s ease-in-out infinite',
          }}
        />
        <div
          style={{
            height: 28,
            width: '70%',
            borderRadius: 6,
            background: isDark ? 'rgba(162,155,254,0.08)' : 'rgba(0,0,0,0.06)',
            animation: 'live-pulse 1.5s ease-in-out infinite 0.3s',
          }}
        />
      </div>
    )
  }

  const raw = result.rows[0]?.[0]
  const numVal = typeof raw === 'number' ? raw : parseFloat(String(raw ?? 0))

  let formatted = '—'
  if (!result.error && !isNaN(numVal)) {
    if (widget.format === 'currency') {
      formatted =
        numVal >= 1e8
          ? `¥${(numVal / 1e8).toFixed(2)} 亿`
          : numVal >= 1e4
            ? `¥${(numVal / 1e4).toFixed(2)} 万`
            : `¥${numVal.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`
    } else {
      formatted =
        numVal >= 1e8
          ? `${(numVal / 1e8).toFixed(2)} 亿`
          : numVal >= 1e4
            ? `${(numVal / 1e4).toFixed(2)} 万`
            : numVal.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
    }
  }

  return (
    <div
      style={cardBase}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: '#5F6B7A',
          marginBottom: 10,
          display: 'block',
        }}
      >
        {widget.title}
      </div>
      <div
        style={{
          fontSize: 32,
          fontWeight: 600,
          color: result.error ? '#ff4d4f' : (isDark ? '#E8ECF3' : '#1A1D2E'),
          lineHeight: 1.15,
          letterSpacing: '-0.5px',
        }}
      >
        {result.error ? (
          <Tooltip title={result.error}>
            <span style={{ fontSize: 13, fontWeight: 400 }}>查询失败</span>
          </Tooltip>
        ) : (
          formatted
        )}
      </div>
    </div>
  )
}

// ── RankingCard ───────────────────────────────────────────────────────────────

function RankingCard({
  widget,
  result,
  isDark,
  onRemove,
  onMoveUp,
  onMoveDown,
  canEdit,
  isFirstRow,
  isLastRow,
}: {
  widget: DashboardWidget
  result?: WidgetResult
  isDark: boolean
  onRemove?: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  canEdit?: boolean
  isFirstRow?: boolean
  isLastRow?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const [tooltipRow, setTooltipRow] = useState<number | null>(null)

  const cardBase: React.CSSProperties = {
    borderRadius: 18,
    background: hovered
      ? (isDark ? 'rgba(42,37,80,0.35)' : 'rgba(255,255,255,0.82)')
      : (isDark ? 'rgba(26,29,46,0.4)' : 'rgba(255,255,255,0.65)'),
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: hovered
      ? `1px solid rgba(${isDark ? '162,155,254' : '108,92,231'},0.15)`
      : `1px solid rgba(${isDark ? '162,155,254' : '108,92,231'},0.08)`,
    boxShadow: isDark
      ? '0 4px 24px rgba(0,0,0,0.2)'
      : '0 2px 12px rgba(108,92,231,0.04), inset 0 1px 0 rgba(255,255,255,0.8)',
    padding: '18px 22px',
    height: '100%',
    minHeight: 220,
    display: 'flex',
    flexDirection: 'column',
    transition: 'background 0.2s, border-color 0.2s, box-shadow 0.2s',
  }

  return (
    <div
      style={cardBase}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: isDark ? '#E8ECF3' : '#2D3142', flex: 1 }}>
          {widget.title}
        </span>
        <span
          style={{
            fontSize: 10,
            padding: '2px 8px',
            borderRadius: 10,
            background: 'rgba(162,155,254,0.08)',
            color: '#5F6B7A',
            border: 'none',
          }}
        >
          {CHART_TYPE_LABEL[widget.chart_type ?? ''] ?? ''}
        </span>
        {canEdit && (
          <div style={{ display: 'flex', gap: 2, opacity: hovered ? 1 : 0, transition: 'opacity 0.2s' }}>
            <Tooltip title="上移">
              <Button
                type="text"
                size="small"
                icon={<ArrowUpOutlined />}
                onClick={onMoveUp}
                disabled={isFirstRow}
                style={{ color: isFirstRow ? 'rgba(232,236,243,0.3)' : 'rgba(232,236,243,0.6)' }}
              />
            </Tooltip>
            <Tooltip title="下移">
              <Button
                type="text"
                size="small"
                icon={<ArrowDownOutlined />}
                onClick={onMoveDown}
                disabled={isLastRow}
                style={{ color: isLastRow ? 'rgba(232,236,243,0.3)' : 'rgba(232,236,243,0.6)' }}
              />
            </Tooltip>
            <Tooltip title="移除图表">
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                onClick={onRemove}
                style={{ color: 'rgba(232,236,243,0.6)' }}
              />
            </Tooltip>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0 }}>
      {!result ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              style={{
                height: 18,
                borderRadius: 4,
                background: isDark ? 'rgba(162,155,254,0.06)' : 'rgba(0,0,0,0.05)',
                animation: 'live-pulse 1.5s ease-in-out infinite',
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
      ) : result.error ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#ff4d4f', fontSize: 12 }}>
          {result.error}
        </div>
      ) : (() => {
        const rows = [...result.rows]
          .sort((a, b) => {
            const va = typeof a[1] === 'number' ? a[1] : parseFloat(String(a[1] ?? 0))
            const vb = typeof b[1] === 'number' ? b[1] : parseFloat(String(b[1] ?? 0))
            return vb - va
          })
          .slice(0, 10)
        const maxVal = Math.max(...rows.map((r) => {
          const v = r[1]
          return typeof v === 'number' ? v : parseFloat(String(v ?? 0))
        }), 1)
        const leftRows = rows.slice(0, 5)
        const rightRows = rows.slice(5, 10)

        const renderRow = (r: unknown[], absIdx: number) => {
          const nameVal = String(r[0] ?? '')
          const numRaw = r[1]
          const numV = typeof numRaw === 'number' ? numRaw : parseFloat(String(numRaw ?? 0))
          const pct = Math.max(numV / maxVal, 0)
          const opacity = 1.0 - (absIdx / Math.max(rows.length - 1, 1)) * 0.75
          const isHovered = tooltipRow === absIdx

          return (
            <div
              key={absIdx}
              style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, position: 'relative' }}
              onMouseEnter={() => setTooltipRow(absIdx)}
              onMouseLeave={() => setTooltipRow(null)}
            >
              <span style={{ fontSize: 11, color: '#5F6B7A', width: 24, textAlign: 'right', flexShrink: 0 }}>
                {absIdx + 1}
              </span>
              <div
                style={{
                  flex: 1,
                  height: 18,
                  borderRadius: 4,
                  background: isDark ? 'rgba(162,155,254,0.06)' : 'rgba(108,92,231,0.05)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    height: '100%',
                    width: `${pct * 100}%`,
                    borderRadius: 4,
                    background: 'linear-gradient(90deg, #6C5CE7, #A29BFE)',
                    opacity,
                    transition: 'width 0.5s ease',
                  }}
                />
              </div>
              <span style={{ fontSize: 11, color: '#9CA3B4', width: 48, textAlign: 'right', flexShrink: 0 }}>
                {formatValue(numV)}
              </span>
              {isHovered && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: isDark ? 'rgba(20,22,32,0.95)' : 'rgba(255,255,255,0.97)',
                    border: isDark ? '1px solid rgba(162,155,254,0.15)' : '1px solid rgba(108,92,231,0.12)',
                    borderRadius: 8,
                    padding: '6px 10px',
                    fontSize: 11,
                    color: isDark ? '#E8ECF3' : '#2D3142',
                    whiteSpace: 'nowrap',
                    zIndex: 50,
                    pointerEvents: 'none',
                    backdropFilter: 'blur(12px)',
                  }}
                >
                  {nameVal} · {formatValue(numV)}
                </div>
              )}
            </div>
          )
        }

        if (rows.length <= 5) {
          return (
            <div>
              {leftRows.map((r, i) => renderRow(r, i))}
            </div>
          )
        }

        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <div>{leftRows.map((r, i) => renderRow(r, i))}</div>
            <div>{rightRows.map((r, i) => renderRow(r, i + 5))}</div>
          </div>
        )
      })()}
      </div>
    </div>
  )
}

// ── ChartCard ─────────────────────────────────────────────────────────────────

function ChartCard({
  widget,
  result,
  isDark,
  onRemove,
  onMoveUp,
  onMoveDown,
  canEdit,
  isFirstRow,
  isLastRow,
}: {
  widget: DashboardWidget
  result?: WidgetResult
  isDark: boolean
  onRemove?: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  canEdit?: boolean
  isFirstRow?: boolean
  isLastRow?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const chartTypeLabel = widget.chart_type && CHART_TYPE_LABEL[widget.chart_type]

  const cardBase: React.CSSProperties = {
    borderRadius: 18,
    background: hovered
      ? (isDark ? 'rgba(42,37,80,0.35)' : 'rgba(255,255,255,0.82)')
      : (isDark ? 'rgba(26,29,46,0.4)' : 'rgba(255,255,255,0.65)'),
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: hovered
      ? `1px solid rgba(${isDark ? '162,155,254' : '108,92,231'},0.15)`
      : `1px solid rgba(${isDark ? '162,155,254' : '108,92,231'},0.08)`,
    boxShadow: isDark
      ? '0 4px 24px rgba(0,0,0,0.2)'
      : '0 2px 12px rgba(108,92,231,0.04), inset 0 1px 0 rgba(255,255,255,0.8)',
    padding: '18px 22px',
    height: '100%',
    minHeight: 220,
    display: 'flex',
    flexDirection: 'column',
    transition: 'background 0.2s, border-color 0.2s, box-shadow 0.2s',
  }

  return (
    <div
      style={cardBase}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: isDark ? '#E8ECF3' : '#2D3142', flex: 1 }}>
          {widget.title}
        </span>
        {chartTypeLabel && (
          <span
            style={{
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 10,
              background: 'rgba(162,155,254,0.08)',
              color: '#5F6B7A',
            }}
          >
            {chartTypeLabel}
          </span>
        )}
        {canEdit && (
          <div style={{ display: 'flex', gap: 2, opacity: hovered ? 1 : 0, transition: 'opacity 0.2s' }}>
            <Tooltip title="上移">
              <Button
                type="text"
                size="small"
                icon={<ArrowUpOutlined />}
                onClick={onMoveUp}
                disabled={isFirstRow}
                style={{ color: isFirstRow ? 'rgba(232,236,243,0.3)' : 'rgba(232,236,243,0.6)' }}
              />
            </Tooltip>
            <Tooltip title="下移">
              <Button
                type="text"
                size="small"
                icon={<ArrowDownOutlined />}
                onClick={onMoveDown}
                disabled={isLastRow}
                style={{ color: isLastRow ? 'rgba(232,236,243,0.3)' : 'rgba(232,236,243,0.6)' }}
              />
            </Tooltip>
            <Tooltip title="移除图表">
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                onClick={onRemove}
                style={{ color: 'rgba(232,236,243,0.6)' }}
              />
            </Tooltip>
          </div>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {!result ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                style={{
                  height: 14,
                  borderRadius: 4,
                  background: isDark ? 'rgba(162,155,254,0.06)' : 'rgba(0,0,0,0.05)',
                  animation: 'live-pulse 1.5s ease-in-out infinite',
                  animationDelay: `${i * 0.12}s`,
                  width: `${90 - i * 8}%`,
                }}
              />
            ))}
          </div>
        ) : result.error ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              color: '#ff4d4f',
              fontSize: 12,
            }}
          >
            {result.error}
          </div>
        ) : (
          <ChartWidget
            chartType={(widget.chart_type ?? 'bar') as ChartType}
            columns={result.columns}
            rows={result.rows}
          />
        )}
      </div>
    </div>
  )
}

// ── FilterDrawer ──────────────────────────────────────────────────────────────

function FilterDrawer({
  open,
  onClose,
  filters,
  datasetId,
  values,
  onChange,
  onApply,
  isDark,
}: {
  open: boolean
  onClose: () => void
  filters: DashboardFilter[]
  datasetId: string
  values: Record<string, string>
  onChange: (field: string, val: string) => void
  onApply: () => void
  isDark: boolean
}) {
  const [optionsMap, setOptionsMap] = useState<Record<string, string[] | null>>({})

  useEffect(() => {
    for (const f of filters) {
      setOptionsMap((prev) => ({ ...prev, [f.field]: null }))
      datasetsApi
        .fieldValues(datasetId, f.field)
        .then((r) => setOptionsMap((prev) => ({ ...prev, [f.field]: r.data })))
        .catch(() => setOptionsMap((prev) => ({ ...prev, [f.field]: [] })))
    }
  }, [filters, datasetId])

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 14,
            background: 'transparent',
          }}
          onClick={onClose}
        />
      )}

      {/* Drawer panel */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: open ? 0 : -290,
          width: 280,
          height: '100%',
          zIndex: 15,
          background: isDark ? 'rgba(20,22,32,0.88)' : 'rgba(255,255,255,0.90)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderLeft: '1px solid rgba(162,155,254,0.08)',
          transition: 'right 0.3s cubic-bezier(0.4,0,0.2,1)',
          display: 'flex',
          flexDirection: 'column',
          padding: '20px 20px 24px',
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <span
            style={{
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: '#5F6B7A',
              flex: 1,
              fontWeight: 600,
            }}
          >
            FILTERS
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#5F6B7A',
              fontSize: 16,
              padding: '2px 6px',
              borderRadius: 6,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Filter selects */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {filters.map((f) => {
            const opts = optionsMap[f.field]
            const isLoading = opts === null
            return (
              <div key={f.field}>
                <div style={{ fontSize: 11, color: '#5F6B7A', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {f.label}
                </div>
                <Select
                  allowClear
                  style={{
                    width: '100%',
                  }}
                  placeholder={f.label}
                  value={values[f.field] || undefined}
                  onChange={(v) => onChange(f.field, v ?? '')}
                  loading={isLoading}
                  options={(opts ?? []).map((o) => ({ value: o, label: o }))}
                  size="middle"
                />
              </div>
            )
          })}
        </div>

        {/* Apply button */}
        <Button
          type="primary"
          onClick={() => { onApply(); onClose() }}
          style={{
            background: 'linear-gradient(135deg, #6C5CE7, #A29BFE)',
            border: 'none',
            borderRadius: 10,
            height: 38,
            marginTop: 20,
            fontWeight: 500,
          }}
          block
        >
          应用筛选
        </Button>
      </div>
    </>
  )
}

// ── LiveTimestamp ─────────────────────────────────────────────────────────────

function LiveTimestamp({ lastUpdated, isDark }: { lastUpdated: Date | null; isDark: boolean }) {
  const [display, setDisplay] = useState('just now')

  useEffect(() => {
    const calc = () => {
      if (!lastUpdated) { setDisplay('—'); return }
      const secs = Math.floor((Date.now() - lastUpdated.getTime()) / 1000)
      if (secs < 30) setDisplay('just now')
      else if (secs < 60) setDisplay(`${secs}s ago`)
      else if (secs < 3600) setDisplay(`${Math.floor(secs / 60)}m ago`)
      else setDisplay(`${Math.floor(secs / 3600)}h ago`)
    }
    calc()
    const id = setInterval(calc, 10000)
    return () => clearInterval(id)
  }, [lastUpdated])

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 20,
        left: 20,
        zIndex: 5,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: '#00C48C',
          animation: 'live-pulse 2s ease-in-out infinite',
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: 11,
          color: isDark ? '#9CA3B4' : '#3D4256',
        }}
      >
        Updated {display}
      </span>
    </div>
  )
}

// ── AiBubble ──────────────────────────────────────────────────────────────────

function AiBubble({
  onSubmit,
  disabled,
  bubbleThinking,
  quickInputRef,
  isDark,
}: {
  onSubmit: (q: string) => void
  disabled?: boolean
  bubbleThinking?: boolean
  quickInputRef: React.RefObject<HTMLInputElement>
  isDark: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [input, setInput] = useState('')

  useEffect(() => {
    if (expanded) {
      setTimeout(() => quickInputRef.current?.focus(), 50)
    }
  }, [expanded, quickInputRef])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && expanded) setExpanded(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [expanded])

  // Wire focus-quick-input event
  useEffect(() => {
    const onFocus = () => setExpanded(true)
    window.addEventListener('focus-quick-input', onFocus)
    return () => window.removeEventListener('focus-quick-input', onFocus)
  }, [])

  const handleSubmit = () => {
    if (!input.trim()) return
    onSubmit(input)
    setInput('')
    setExpanded(false)
  }

  const mobiusPath = "M24,56 C24,24 56,8 80,40 C104,72 136,56 136,56 C136,56 136,88 112,72 C88,40 56,56 24,56 Z"
  const ballClass = bubbleThinking ? 'db-ball-fast' : 'db-ball-anim'
  const trailClass = bubbleThinking ? 'db-trail-fast' : 'db-trail-anim'

  if (expanded) {
    return (
      <>
        {/* Click-outside backdrop */}
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 19,
            background: 'transparent',
          }}
          onClick={() => setExpanded(false)}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: 420,
            zIndex: 20,
            transformOrigin: 'bottom right',
            animation: 'db-expand 0.2s cubic-bezier(0.2,0,0,1) both',
          }}
        >
          <div
            style={{
              margin: '0 16px 16px',
              borderRadius: 18,
              background: isDark ? 'rgba(20,22,32,0.92)' : 'rgba(255,255,255,0.96)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: isDark ? '1px solid rgba(162,155,254,0.15)' : '1px solid rgba(108,92,231,0.12)',
              padding: '10px 16px',
              boxShadow: isDark ? '0 8px 40px rgba(108,92,231,0.25)' : '0 4px 24px rgba(108,92,231,0.12)',
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {/* Back button */}
              <button
                onClick={() => setExpanded(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#5F6B7A',
                  padding: '4px 6px',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  flexShrink: 0,
                  transition: 'color 0.15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#A29BFE' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#5F6B7A' }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
              </button>
              {/* Mini möbius */}
              <svg width="24" height="17" viewBox="0 0 160 112" fill="none" style={{ flexShrink: 0 }}>
                <path d={mobiusPath} fill="none" stroke="rgba(162,155,254,0.25)" strokeWidth="10" strokeLinecap="round" />
                <path d={mobiusPath} fill="none" stroke="rgba(162,155,254,0.5)" strokeWidth="10" strokeLinecap="round" strokeDasharray="60 220" className={trailClass} />
                <circle r="7" fill="white" className={ballClass} />
              </svg>
              <input
                ref={quickInputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit()
                  if (e.key === 'Escape') setExpanded(false)
                }}
                placeholder="向 AI 提问数据… Enter 发送"
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  fontSize: 14,
                  color: isDark ? '#E8ECF3' : '#1A1D2E',
                  fontFamily: 'inherit',
                }}
              />
              <button
                onClick={handleSubmit}
                disabled={!input.trim() || disabled}
                style={{
                  background: input.trim() && !disabled ? 'linear-gradient(135deg, #6C5CE7, #A29BFE)' : 'rgba(162,155,254,0.12)',
                  border: 'none',
                  borderRadius: 10,
                  width: 32,
                  height: 32,
                  cursor: input.trim() && !disabled ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'background 0.2s',
                }}
              >
                <SendOutlined style={{ color: input.trim() && !disabled ? 'white' : '#5F6B7A', fontSize: 13 }} />
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 20,
        right: 20,
        zIndex: 20,
        width: 52,
        height: 52,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      title="向 AI 提问数据"
      onClick={() => !disabled && setExpanded(true)}
    >
      {/* Ping ring */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          border: `2px solid ${isDark ? 'rgba(162,155,254,0.3)' : 'rgba(108,92,231,0.25)'}`,
          animation: 'db-ping 2s ease-out infinite',
          pointerEvents: 'none',
        }}
      />
      {/* Main circle */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #6C5CE7, #A29BFE)',
          boxShadow: '0 4px 24px rgba(108,92,231,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <svg width="28" height="20" viewBox="0 0 160 112" fill="none">
          <path
            d={mobiusPath}
            fill="none"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <path
            d={mobiusPath}
            fill="none"
            stroke="rgba(255,255,255,0.7)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray="60 220"
            className={trailClass}
          />
          <circle r="7" fill="white" className={ballClass} />
        </svg>
      </div>
    </div>
  )
}

// ── Dashboard Selector Dropdown ───────────────────────────────────────────────

function DashboardSelector({
  selectedDashboard,
  dashboards,
  onSelect,
  isDark,
}: {
  selectedDashboard: DashboardDetail | null
  dashboards: DashboardListItem[]
  onSelect: (id: string) => void
  isDark: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const fixedDashboards = dashboards.filter((d) => d.dashboard_type === 'fixed')
  const autoDashboards = dashboards.filter((d) => d.dashboard_type === 'auto')
  const personalDashboards = dashboards.filter((d) => d.dashboard_type === 'personal')
  const grouped: Array<{ key: string; items: DashboardListItem[] }> = [
    { key: 'fixed', items: fixedDashboards },
    { key: 'auto', items: autoDashboards },
    { key: 'personal', items: personalDashboards },
  ].filter((g) => g.items.length > 0)

  return (
    <div ref={ref} style={{ position: 'relative', pointerEvents: 'auto' }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          padding: '4px 8px',
          borderRadius: 8,
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(162,155,254,0.08)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: isDark ? '#E8ECF3' : '#1A1D2E',
            transition: 'opacity 0.15s',
          }}
        >
          {selectedDashboard?.name ?? '选择看板'}
        </span>
        <DownOutlined style={{ fontSize: 10, color: '#5F6B7A' }} />
      </div>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            minWidth: 260,
            background: isDark ? 'rgba(20,22,32,0.95)' : 'rgba(255,255,255,0.97)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(162,155,254,0.12)',
            borderRadius: 14,
            boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
            overflow: 'hidden',
            zIndex: 100,
          }}
        >
          {grouped.map((group) => {
            const tl = TYPE_LABEL[group.key]
            return (
              <div key={group.key}>
                <div
                  style={{
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: '#5F6B7A',
                    padding: '10px 14px 4px',
                    fontWeight: 600,
                  }}
                >
                  {GROUP_LABEL[group.key]}
                </div>
                {group.items.map((d) => (
                  <div
                    key={d.id}
                    onClick={() => { onSelect(d.id); setOpen(false) }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 14px',
                      cursor: 'pointer',
                      background: d.id === selectedDashboard?.id
                        ? 'rgba(108,92,231,0.12)'
                        : 'transparent',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (d.id !== selectedDashboard?.id)
                        (e.currentTarget as HTMLDivElement).style.background = 'rgba(162,155,254,0.06)'
                    }}
                    onMouseLeave={(e) => {
                      if (d.id !== selectedDashboard?.id)
                        (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 6,
                        background: `${tl.color}18`,
                        color: tl.color,
                        flexShrink: 0,
                        fontWeight: 500,
                      }}
                    >
                      {tl.label}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        fontSize: 13,
                        color: isDark ? '#E8ECF3' : '#1A1D2E',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {d.name}
                    </span>
                    <span style={{ fontSize: 11, color: '#5F6B7A', flexShrink: 0 }}>
                      {d.widget_count}
                    </span>
                  </div>
                ))}
              </div>
            )
          })}
          {grouped.length === 0 && (
            <div style={{ padding: '20px 14px', fontSize: 12, color: '#5F6B7A', textAlign: 'center' }}>
              暂无看板
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Create Dashboard Modal ────────────────────────────────────────────────────

function CreateDashboardModal({
  open,
  datasets,
  onClose,
  onCreated,
}: {
  open: boolean
  datasets: Dataset[]
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [datasetId, setDatasetId] = useState<string>()
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!name.trim() || !datasetId) return
    setCreating(true)
    try {
      const res = await dashboardApi.create({ name: name.trim(), dataset_id: datasetId })
      message.success('看板已创建')
      onCreated(res.data.id)
      setName('')
      setDatasetId(undefined)
    } catch {
      message.error('创建失败')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal
      open={open}
      title="新建看板"
      onCancel={onClose}
      onOk={handleCreate}
      okText="创建"
      cancelText="取消"
      confirmLoading={creating}
      okButtonProps={{ disabled: !name.trim() || !datasetId }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 0' }}>
        <div>
          <Text style={{ fontSize: 12, color: '#5F6B7A', display: 'block', marginBottom: 6 }}>看板名称</Text>
          <Input
            placeholder="例如：销售分析看板"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <Text style={{ fontSize: 12, color: '#5F6B7A', display: 'block', marginBottom: 6 }}>数据集</Text>
          <Select
            style={{ width: '100%' }}
            placeholder="选择数据集"
            value={datasetId}
            onChange={setDatasetId}
            options={datasets.map((d) => ({ value: d.id, label: d.name }))}
          />
        </div>
      </div>
    </Modal>
  )
}

// ── Add Chart Modal ───────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-glass)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  borderRadius: 20,
  padding: '20px 24px',
  boxShadow: 'var(--bg-glass-shadow)',
  border: '1px solid var(--bg-glass-border)',
}

function AddChartModal({
  open,
  onClose,
  dashboard,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  dashboard: DashboardDetail
  onAdded: () => void
}) {
  const { recentQueries } = useChatStore()
  const [customSql, setCustomSql] = useState('')
  const [customTitle, setCustomTitle] = useState('')
  const [customChartType, setCustomChartType] = useState<ChartType>('bar')
  const [previewResult, setPreviewResult] = useState<QueryData | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)

  // Only show queries compatible with this dashboard's dataset
  const compatibleQueries = recentQueries.filter((q) => q.dataset_id === dashboard.dataset_id)

  const handleAddFromHistory = async (q: RecentQuery) => {
    setAdding(q.id)
    try {
      const tablePrefix = `dataset_${q.dataset_id.replace(/-/g, '')}`
      const sqlWithPlaceholder = q.sql.replace(tablePrefix, '{table}')
      await dashboardApi.addWidget(dashboard.id, {
        type: 'chart',
        chart_type: q.chart_type,
        title: q.title,
        query: sqlWithPlaceholder,
      })
      message.success('图表已添加')
      onAdded()
    } catch {
      message.error('添加失败')
    } finally {
      setAdding(null)
    }
  }

  const handlePreviewCustom = async () => {
    if (!customSql.trim()) return
    setPreviewLoading(true)
    setPreviewResult(null)
    try {
      const res = await queryApi.preview({ dataset_id: dashboard.dataset_id, sql: customSql })
      setPreviewResult(res.data)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'SQL 执行失败'
      message.error(detail)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleAddCustom = async () => {
    if (!customSql.trim() || !customTitle.trim()) return
    setAdding('custom')
    try {
      // Normalize SQL: replace concrete table name with {table} if present
      const tablePrefix = `dataset_${dashboard.dataset_id.replace(/-/g, '')}`
      const sqlWithPlaceholder = customSql.replace(tablePrefix, '{table}')
      await dashboardApi.addWidget(dashboard.id, {
        type: 'chart',
        chart_type: customChartType,
        title: customTitle.trim(),
        query: sqlWithPlaceholder,
      })
      message.success('图表已添加')
      setCustomSql('')
      setCustomTitle('')
      setPreviewResult(null)
      onAdded()
    } catch {
      message.error('添加失败')
    } finally {
      setAdding(null)
    }
  }

  return (
    <Modal
      open={open}
      title="添加图表"
      onCancel={onClose}
      footer={null}
      width={680}
      destroyOnClose
    >
      <Tabs
        defaultActiveKey="history"
        items={[
          {
            key: 'history',
            label: '历史查询',
            children: (
              <div style={{ minHeight: 200 }}>
                {compatibleQueries.length === 0 ? (
                  <Empty
                    description={
                      recentQueries.length === 0
                        ? '暂无历史查询，请先在对话页面进行查询'
                        : '没有与此看板数据集匹配的历史查询'
                    }
                    style={{ padding: '40px 0' }}
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {compatibleQueries.map((q) => (
                      <div
                        key={q.id}
                        style={{
                          ...cardStyle,
                          padding: '12px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>
                            {q.title}
                          </div>
                          <div style={{ fontSize: 12, color: '#9CA3B4' }}>
                            {CHART_TYPE_LABEL[q.chart_type] ?? q.chart_type} · {q.row_count} 条数据
                          </div>
                        </div>
                        <Button
                          size="small"
                          type="primary"
                          loading={adding === q.id}
                          onClick={() => handleAddFromHistory(q)}
                          style={{ background: '#6C5CE7', border: 'none', flexShrink: 0 }}
                        >
                          添加
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'custom',
            label: '自定义 SQL',
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Input
                    placeholder="图表标题"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <Select
                    value={customChartType}
                    onChange={setCustomChartType}
                    style={{ width: 120 }}
                    options={Object.entries(CHART_TYPE_LABEL)
                      .filter(([k]) => k !== 'table')
                      .map(([k, v]) => ({ value: k, label: v }))}
                  />
                </div>
                <TextArea
                  rows={6}
                  placeholder={`SELECT 字段 FROM {table} GROUP BY 字段\n\n提示：使用 {table} 作为表名占位符`}
                  value={customSql}
                  onChange={(e) => setCustomSql(e.target.value)}
                  style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 13 }}
                />
                <Space>
                  <Button onClick={handlePreviewCustom} loading={previewLoading} disabled={!customSql.trim()}>
                    执行预览
                  </Button>
                  <Button
                    type="primary"
                    disabled={!previewResult || !customTitle.trim()}
                    loading={adding === 'custom'}
                    onClick={handleAddCustom}
                    style={{ background: '#6C5CE7', border: 'none' }}
                  >
                    添加到看板
                  </Button>
                </Space>
                {previewResult && (
                  <div
                    style={{
                      background: '#FAFBFD',
                      borderRadius: 12,
                      padding: 12,
                      maxHeight: 220,
                      overflow: 'auto',
                    }}
                  >
                    <div style={{ fontSize: 11, color: '#9CA3B4', marginBottom: 8 }}>
                      预览：{previewResult.row_count} 行 · {previewResult.execution_time_ms.toFixed(0)}ms
                    </div>
                    <ChartWidget
                      chartType={customChartType}
                      columns={previewResult.columns}
                      rows={previewResult.rows}
                      height={160}
                    />
                  </div>
                )}
              </div>
            ),
          },
        ]}
      />
    </Modal>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [searchParams] = useSearchParams()
  const { user } = useAuthStore()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const isAdmin = user?.role === 'admin'

  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [dashboards, setDashboards] = useState<DashboardListItem[]>([])
  const [selectedDashboard, setSelectedDashboard] = useState<DashboardDetail | null>(null)
  const [widgetResults, setWidgetResults] = useState<Record<string, WidgetResult>>({})
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [pendingFilters, setPendingFilters] = useState<Record<string, string>>({})
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>({})
  const [showCreate, setShowCreate] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [showAddChart, setShowAddChart] = useState(false)
  const [showRename, setShowRename] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameSaving, setRenameSaving] = useState(false)
  const [showFilterDrawer, setShowFilterDrawer] = useState(false)
  const [pageHovered, setPageHovered] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [showDashboardDropdown] = useState(false)
  const quickInputRef = useRef<HTMLInputElement>(null)
  const { viewState: transitionState, startTransition, setLoading: setTransitionLoading, setExploding, setRevealing, setChatResult, setError: setTransitionError, finishReturn } = useViewStore()
  const initRef = useRef(false)

  // Esc key: close filter drawer
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowFilterDrawer(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // After returning animation, restore normal dashboard state
  useEffect(() => {
    if (transitionState !== 'returning') return
    const t = setTimeout(() => finishReturn(), 600)
    return () => clearTimeout(t)
  }, [transitionState, finishReturn])

  const submitQuickQuery = (q: string) => {
    if (!q.trim() || !selectedDashboard) return
    const datasetId = selectedDashboard.dataset_id
    startTransition(q, datasetId)

    // t=600ms: card fly-out done → show Möbius loader
    setTimeout(() => setTransitionLoading(), 600)

    // t=700ms: fire API after cards are fully gone
    setTimeout(() => {
      queryApi
        .ask(q, datasetId)
        .then((res) => {
          const { sql, chart_type, data: qd } = res.data
          // API done → Möbius explodes + particles burst
          setExploding({
            query:      q,
            chartType:  chart_type as import('../types').ChartType,
            columns:    qd.columns,
            rows:       qd.rows,
            sql,
            dataset_id: datasetId,
          })
          // +150ms: chart blur-to-clear reveal (faster after explode)
          setTimeout(() => {
            setRevealing()
            // +700ms: fully interactive
            setTimeout(() => setChatResult(), 700)
          }, 150)
        })
        .catch((err) => {
          setTransitionError(err?.response?.data?.detail ?? '查询失败')
        })
    }, 700)
  }

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    datasetsApi.list().then((r) => setDatasets(r.data)).catch(() => {})
    dashboardApi
      .list()
      .then((r) => {
        setDashboards(r.data)
        // Support ?dashboard=<id> from save-to-dashboard link
        const targetId = searchParams.get('dashboard')
        const first = targetId ? r.data.find((d) => d.id === targetId) ?? r.data[0] : r.data[0]
        if (first) loadDashboard(first.id)
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadDashboard = async (id: string) => {
    setLoading(true)
    setWidgetResults({})
    setPendingFilters({})
    setAppliedFilters({})
    setEditMode(false)
    try {
      const res = await dashboardApi.get(id)
      setSelectedDashboard(res.data)
      await runWidgetQueries(res.data, {})
      setLastUpdated(new Date())
    } catch {
      message.error('看板加载失败')
    } finally {
      setLoading(false)
    }
  }

  const runWidgetQueries = async (dashboard: DashboardDetail, activeFilters: Record<string, string>) => {
    setLoading(true)
    try {
      const f = Object.fromEntries(Object.entries(activeFilters).filter(([, v]) => v !== ''))
      const res = await dashboardApi.query(dashboard.id, Object.keys(f).length ? f : undefined)
      setWidgetResults(res.data.widgets)
      setLastUpdated(new Date())
    } catch {
      message.error('数据加载失败')
    } finally {
      setLoading(false)
    }
  }

  const handleAutoGenerate = async (datasetId: string) => {
    setGenerating(true)
    try {
      await dashboardApi.autoGenerate(datasetId)
      const listRes = await dashboardApi.list()
      setDashboards(listRes.data)
      const newDash = listRes.data.find((d) => d.dataset_id === datasetId && d.dashboard_type === 'auto')
      if (newDash) await loadDashboard(newDash.id)
      message.success('看板已生成')
    } catch {
      message.error('生成失败，请重试')
    } finally {
      setGenerating(false)
    }
  }

  const handleRemoveWidget = async (widgetId: string) => {
    if (!selectedDashboard) return
    try {
      await dashboardApi.removeWidget(selectedDashboard.id, widgetId)
      const res = await dashboardApi.get(selectedDashboard.id)
      setSelectedDashboard(res.data)
      await runWidgetQueries(res.data, appliedFilters)
    } catch {
      message.error('移除失败')
    }
  }

  const handleMoveRow = async (rowKey: number, direction: 'up' | 'down') => {
    if (!selectedDashboard) return
    const sortedRowKeys = Object.keys(widgetsByRow).map(Number).sort((a, b) => a - b)
    const idx = sortedRowKeys.indexOf(rowKey)
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx === sortedRowKeys.length - 1) return

    const targetRow = direction === 'up' ? sortedRowKeys[idx - 1] : sortedRowKeys[idx + 1]
    const updatedWidgets = selectedDashboard.config.widgets.map((w) => {
      if (w.position.row === rowKey) return { ...w, position: { ...w.position, row: targetRow } }
      if (w.position.row === targetRow) return { ...w, position: { ...w.position, row: rowKey } }
      return w
    })

    try {
      const updatedConfig: DashboardConfig = { ...selectedDashboard.config, widgets: updatedWidgets }
      const res = await dashboardApi.update(selectedDashboard.id, { config: updatedConfig })
      setSelectedDashboard(res.data)
    } catch {
      message.error('操作失败')
    }
  }

  const handleRename = async () => {
    if (!selectedDashboard || !renameValue.trim()) return
    setRenameSaving(true)
    try {
      const res = await dashboardApi.update(selectedDashboard.id, { name: renameValue.trim() })
      setSelectedDashboard(res.data)
      const listRes = await dashboardApi.list()
      setDashboards(listRes.data)
      setShowRename(false)
      message.success('已重命名')
    } catch {
      message.error('重命名失败')
    } finally {
      setRenameSaving(false)
    }
  }

  const handleDeleteDashboard = () => {
    if (!selectedDashboard) return
    Modal.confirm({
      title: `确认删除「${selectedDashboard.name}」？`,
      content: '删除后无法恢复，看板内所有图表将一并删除。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await dashboardApi.deleteDashboard(selectedDashboard.id)
        const listRes = await dashboardApi.list()
        setDashboards(listRes.data)
        if (listRes.data.length > 0) {
          await loadDashboard(listRes.data[0].id)
        } else {
          setSelectedDashboard(null)
        }
        message.success('看板已删除')
      },
    })
  }

  // ── Computed ────────────────────────────────────────────────────────────────

  const widgetsByRow: Record<number, DashboardWidget[]> = {}
  if (selectedDashboard) {
    for (const w of selectedDashboard.config.widgets) {
      const row = w.position.row
      if (!widgetsByRow[row]) widgetsByRow[row] = []
      widgetsByRow[row].push(w)
    }
  }

  const sortedRowKeys = Object.keys(widgetsByRow).map(Number).sort((a, b) => a - b)
  const dashboardFilters: DashboardFilter[] = selectedDashboard?.config.filters ?? []
  const canEdit =
    !!selectedDashboard &&
    (isAdmin || selectedDashboard.dashboard_type === 'personal')
  const isEmptyDashboard = selectedDashboard != null && selectedDashboard.config.widgets.length === 0

  const bubbleThinking = transitionState === 'loading' || transitionState === 'exploding'

  const actionBtnStyle: React.CSSProperties = {
    width: 32,
    height: 32,
    borderRadius: 10,
    background: isDark ? 'rgba(26,29,46,0.6)' : 'rgba(255,255,255,0.75)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: isDark ? '1px solid rgba(162,155,254,0.08)' : '1px solid rgba(108,92,231,0.10)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'opacity 0.2s, background 0.2s',
    color: isDark ? '#9CA3B4' : '#5F6B7A',
    fontSize: 14,
  }

  // Suppress unused variable warning for showDashboardDropdown
  void showDashboardDropdown

  return (
    <div
      style={{
        position: 'relative',
        height: '100vh',
        overflow: 'hidden',
        background: isDark ? 'transparent' : '#F4F3FF',
      }}
      onMouseEnter={() => setPageHovered(true)}
      onMouseLeave={() => setPageHovered(false)}
    >
      {/* Inject keyframe styles */}
      <style>{INJECTED_STYLES}</style>

      {/* ── Top floating bar ── */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          pointerEvents: 'none',
          background: isDark
            ? 'linear-gradient(180deg, rgba(8,10,18,0.45) 0%, transparent 100%)'
            : 'linear-gradient(180deg, rgba(244,243,255,0.80) 0%, transparent 100%)',
          height: 72,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            height: 52,
            padding: '0 16px',
          }}
        >
          {/* Left: status dot + dashboard selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'auto' }}>
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#00C48C',
                animation: 'live-pulse 2s ease-in-out infinite',
                flexShrink: 0,
              }}
            />
            <DashboardSelector
              selectedDashboard={selectedDashboard}
              dashboards={dashboards}
              onSelect={loadDashboard}
              isDark={isDark}
            />
          </div>

          {/* Edit mode indicator badge */}
          {editMode && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: '#FFB946',
                background: 'rgba(255,185,70,0.12)',
                borderRadius: 8,
                padding: '2px 8px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                pointerEvents: 'none',
              }}
            >
              编辑中
            </span>
          )}

          {/* Right action buttons */}
          <div
            style={{
              marginLeft: 'auto',
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              pointerEvents: 'auto',
              opacity: pageHovered ? 1 : 0.55,
              transition: 'opacity 0.3s',
            }}
          >
            {dashboardFilters.length > 0 && (
              <Tooltip title="筛选">
                <div
                  style={{
                    ...actionBtnStyle,
                    background: showFilterDrawer ? 'rgba(108,92,231,0.25)' : actionBtnStyle.background,
                    color: showFilterDrawer ? '#A29BFE' : actionBtnStyle.color,
                  }}
                  onClick={() => setShowFilterDrawer((v) => !v)}
                >
                  <FilterOutlined />
                </div>
              </Tooltip>
            )}

            {canEdit && (
              <Tooltip title={editMode ? '完成编辑' : '编辑'}>
                <div
                  style={{
                    ...actionBtnStyle,
                    background: editMode ? 'rgba(108,92,231,0.25)' : actionBtnStyle.background,
                    color: editMode ? '#A29BFE' : actionBtnStyle.color,
                  }}
                  onClick={() => setEditMode((v) => !v)}
                >
                  <EditOutlined />
                </div>
              </Tooltip>
            )}

            <Tooltip title="刷新">
              <div
                style={actionBtnStyle}
                onClick={() => selectedDashboard && runWidgetQueries(selectedDashboard, appliedFilters)}
              >
                <ReloadOutlined style={{ animation: loading ? 'db-ball 1s linear infinite' : 'none' }} />
              </div>
            </Tooltip>

            <Tooltip title="新建看板">
              <div
                style={actionBtnStyle}
                onClick={() => setShowCreate(true)}
              >
                <PlusOutlined />
              </div>
            </Tooltip>

            {canEdit && editMode && (
              <Tooltip title="添加图表">
                <div
                  style={{ ...actionBtnStyle, color: '#A29BFE' }}
                  onClick={() => setShowAddChart(true)}
                >
                  <ExpandOutlined />
                </div>
              </Tooltip>
            )}

            {canEdit && (
              <>
                <Tooltip title="重命名">
                  <div
                    style={actionBtnStyle}
                    onClick={() => {
                      setRenameValue(selectedDashboard?.name ?? '')
                      setShowRename(true)
                    }}
                  >
                    <EditOutlined style={{ fontSize: 12 }} />
                  </div>
                </Tooltip>
                <Tooltip title="删除看板">
                  <div
                    style={{ ...actionBtnStyle, color: '#ff6b6b' }}
                    onClick={handleDeleteDashboard}
                  >
                    <DeleteOutlined style={{ fontSize: 12 }} />
                  </div>
                </Tooltip>
              </>
            )}

            {isAdmin && (
              <Select
                style={{ width: 180 }}
                placeholder="为数据集生成看板"
                loading={generating}
                value={null}
                onChange={handleAutoGenerate}
                options={datasets.map((d) => ({ value: d.id, label: d.name }))}
                size="small"
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Filter Drawer ── */}
      {selectedDashboard && dashboardFilters.length > 0 && (
        <FilterDrawer
          open={showFilterDrawer}
          onClose={() => setShowFilterDrawer(false)}
          filters={dashboardFilters}
          datasetId={selectedDashboard.dataset_id}
          values={pendingFilters}
          onChange={(field, val) => setPendingFilters((prev) => ({ ...prev, [field]: val }))}
          onApply={() => {
            if (!selectedDashboard) return
            setAppliedFilters(pendingFilters)
            runWidgetQueries(selectedDashboard, pendingFilters)
          }}
          isDark={isDark}
        />
      )}

      {/* ── Scrollable content area ── */}
      <div
        style={{
          height: '100%',
          overflowY: 'auto',
          padding: '16px 20px',
          paddingTop: 56,
          paddingBottom: 80,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* No dashboards at all */}
        {!selectedDashboard && !loading && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '70%',
            }}
          >
            <div
              style={{
                borderRadius: 20,
                background: isDark ? 'rgba(26,29,46,0.4)' : 'rgba(255,255,255,0.65)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(162,155,254,0.08)',
                padding: '48px 56px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 13, color: '#5F6B7A', marginBottom: 20 }}>
                {isAdmin
                  ? '暂无看板，点击"新建"创建，或在右上角选择数据集自动生成'
                  : '暂无看板，点击"新建"创建个人看板'}
              </div>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setShowCreate(true)}
                style={{ background: 'linear-gradient(135deg, #6C5CE7, #A29BFE)', border: 'none', borderRadius: 10 }}
              >
                新建看板
              </Button>
            </div>
          </div>
        )}

        {selectedDashboard && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* Applied filter indicator */}
            {Object.values(appliedFilters).some(Boolean) && (
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: '#A29BFE', background: 'rgba(108,92,231,0.12)', borderRadius: 10, padding: '2px 10px' }}>
                  已筛选
                </span>
              </div>
            )}

            {/* Empty dashboard state */}
            {isEmptyDashboard ? (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    borderRadius: 20,
                    background: isDark ? 'rgba(26,29,46,0.4)' : 'rgba(255,255,255,0.65)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    border: '1px solid rgba(162,155,254,0.08)',
                    padding: '48px 56px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 13, color: '#5F6B7A', marginBottom: 20 }}>此看板暂无图表</div>
                  <Space>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => { setEditMode(true); setShowAddChart(true) }}
                      style={{ background: 'linear-gradient(135deg, #6C5CE7, #A29BFE)', border: 'none', borderRadius: 10 }}
                    >
                      从对话历史添加
                    </Button>
                    {isAdmin && (
                      <Button
                        icon={<ReloadOutlined />}
                        onClick={() => handleAutoGenerate(selectedDashboard.dataset_id)}
                        loading={generating}
                        style={{ borderRadius: 10 }}
                      >
                        自动生成图表
                      </Button>
                    )}
                  </Space>
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
                {sortedRowKeys.map((rowKey, rowIdx) => {
                  const rowWidgets = widgetsByRow[rowKey].sort((a, b) => a.position.col - b.position.col)
                  const isKpiRow = rowWidgets.every((w) => w.type === 'kpi')
                  const isFirstRow = rowIdx === 0
                  const isLastRow = rowIdx === sortedRowKeys.length - 1

                  return (
                    <div
                      key={rowKey}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: isKpiRow
                          ? 'repeat(auto-fit, minmax(180px, 1fr))'
                          : rowWidgets.map((w) => `${w.position.width}fr`).join(' '),
                        gap: isKpiRow ? 12 : 16,
                        flex: isKpiRow ? 'none' : 1,
                        minHeight: isKpiRow ? undefined : 0,
                        ...(transitionState === 'collapsing' ? {
                          animation: `card-fly-out 0.5s cubic-bezier(0.55,0,1,0.8) ${rowIdx * 80}ms both`,
                        } : transitionState === 'returning' ? {
                          animation: `card-fly-in 0.5s cubic-bezier(0.2,0,0,1) ${rowIdx * 60}ms both`,
                        } : transitionState !== 'dashboard' ? {
                          // stay hidden after fly-out (avoid snap-back on state change)
                          opacity: 0,
                          transform: 'translateX(-220px) scale(0.82)',
                          filter: 'blur(6px)',
                          transition: 'none',
                        } : {}),
                      }}
                    >
                      {rowWidgets.map((widget) =>
                        widget.type === 'kpi' ? (
                          <KpiCard key={widget.id} widget={widget} result={widgetResults[widget.id]} isDark={isDark} />
                        ) : widget.chart_type === 'bar_horizontal' && (widgetResults[widget.id]?.rows?.length ?? 0) > 3 ? (
                          <RankingCard
                            key={widget.id}
                            widget={widget}
                            result={widgetResults[widget.id]}
                            isDark={isDark}
                            canEdit={canEdit && editMode}
                            isFirstRow={isFirstRow}
                            isLastRow={isLastRow}
                            onRemove={() => handleRemoveWidget(widget.id)}
                            onMoveUp={() => handleMoveRow(rowKey, 'up')}
                            onMoveDown={() => handleMoveRow(rowKey, 'down')}
                          />
                        ) : (
                          <ChartCard
                            key={widget.id}
                            widget={widget}
                            result={widgetResults[widget.id]}
                            isDark={isDark}
                            canEdit={canEdit && editMode}
                            isFirstRow={isFirstRow}
                            isLastRow={isLastRow}
                            onRemove={() => handleRemoveWidget(widget.id)}
                            onMoveUp={() => handleMoveRow(rowKey, 'up')}
                            onMoveDown={() => handleMoveRow(rowKey, 'down')}
                          />
                        ),
                      )}
                    </div>
                  )
                })}

                {/* Edit mode: add chart button at bottom */}
                {editMode && (
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
                    <Button
                      type="dashed"
                      icon={<PlusOutlined />}
                      onClick={() => setShowAddChart(true)}
                      style={{ borderColor: 'rgba(162,155,254,0.3)', color: '#A29BFE', width: 200, borderRadius: 10 }}
                    >
                      添加图表
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── LiveTimestamp ── */}
      <LiveTimestamp lastUpdated={lastUpdated} isDark={isDark} />

      {/* ── AiBubble ── */}
      <AiBubble
        onSubmit={submitQuickQuery}
        disabled={!selectedDashboard}
        bubbleThinking={bubbleThinking}
        quickInputRef={quickInputRef}
        isDark={isDark}
      />

      {/* ── Modals ── */}
      <CreateDashboardModal
        open={showCreate}
        datasets={datasets}
        onClose={() => setShowCreate(false)}
        onCreated={async (id) => {
          setShowCreate(false)
          const listRes = await dashboardApi.list()
          setDashboards(listRes.data)
          await loadDashboard(id)
        }}
      />

      {selectedDashboard && (
        <AddChartModal
          open={showAddChart}
          onClose={() => setShowAddChart(false)}
          dashboard={selectedDashboard}
          onAdded={async () => {
            setShowAddChart(false)
            const res = await dashboardApi.get(selectedDashboard.id)
            setSelectedDashboard(res.data)
            await runWidgetQueries(res.data, appliedFilters)
          }}
        />
      )}

      <Modal
        open={showRename}
        title="重命名看板"
        onCancel={() => setShowRename(false)}
        onOk={handleRename}
        okText="保存"
        cancelText="取消"
        confirmLoading={renameSaving}
        okButtonProps={{ disabled: !renameValue.trim() }}
      >
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          placeholder="输入新名称"
          style={{ marginTop: 16 }}
          onPressEnter={handleRename}
        />
      </Modal>
    </div>
  )
}
