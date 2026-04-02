import {
  ClockCircleOutlined,
  CodeOutlined,
  DeleteOutlined,
  DownOutlined,
  LockOutlined,
  MessageOutlined,
  PlusOutlined,
  PushpinOutlined,
  TableOutlined,
  UploadOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { Collapse, Input, Modal, Select, Skeleton, message } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import ChartWidget from '../components/ChartWidget'
import { conversationApi, dashboardApi, datasetsApi, queryApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import { useChatStore } from '../stores/chatStore'
import { useThemeStore } from '../stores/themeStore'
import { useViewStore } from '../stores/useViewStore'
import type {
  ChatMessage,
  ChartType,
  ColumnInfo,
  ConversationListItem,
  DashboardListItem,
  Dataset,
  User,
} from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2)
}

function computeScopeText(user: User | null): string {
  if (!user) return ''
  if (user.role === 'admin') return '全部数据'
  if (user.partner_id) return `仅限 ${user.partner_id}`
  if (user.region) return `${user.region} 区域`
  return '受限范围'
}

const NUM_TYPES = ['int', 'float', 'double', 'decimal', 'numeric', 'bigint', 'smallint', 'real']

function generateSuggestions(columns: ColumnInfo[]): string[] {
  const numeric = columns.filter((c) => NUM_TYPES.some((t) => c.type.toLowerCase().includes(t)))
  const category = columns.filter((c) => {
    const t = c.type.toLowerCase()
    return (t.includes('varchar') || t === 'string' || t.includes('text'))
      && c.distinct_count > 0 && c.distinct_count <= 30
  })
  const dates = columns.filter((c) => {
    const t = c.type.toLowerCase(), n = c.name.toLowerCase()
    return t.includes('date') || t.includes('timestamp')
      || n.includes('date') || n.includes('month') || n.includes('year')
  })
  const names = columns.filter((c) => {
    const t = c.type.toLowerCase()
    return (t.includes('varchar') || t === 'string' || t.includes('text')) && c.distinct_count > 30
  })

  const out: string[] = []
  if (category.length && numeric.length)
    out.push(`各${category[0].name}的${numeric[0].name}对比`)
  if (dates.length && numeric.length)
    out.push(`${numeric[0].name}随时间的变化趋势`)
  if (names.length && numeric.length)
    out.push(`${numeric[0].name}最高的前10名`)
  if (category.length >= 2 && numeric.length)
    out.push(`按${category[1].name}分组的${numeric[0].name}分布`)
  else if (category.length && numeric.length >= 2)
    out.push(`各${category[0].name}的${numeric[1].name}汇总`)

  const defaults = ['数据总量和关键指标概览', '各维度汇总统计', '最近数据整体趋势', '数据分布情况分析']
  while (out.length < 4 && defaults.length) out.push(defaults.shift()!)
  return out.slice(0, 4)
}

// ── Möbius path (reused from login) ──────────────────────────────────────────
const MP = 'M24,56 C24,24 56,8 80,40 C104,72 136,56 136,56 C136,56 136,88 112,72 C88,40 56,56 24,56 Z'

function MobiusAvatar({ size = 28, isDark }: { size?: number; isDark: boolean }) {
  const color = isDark ? '#A29BFE' : '#6C5CE7'
  const w = size, h = Math.round(size * 0.7)
  return (
    <div style={{
      width: w + 6, height: h + 6, borderRadius: 8, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: isDark ? 'rgba(162,155,254,0.08)' : 'rgba(108,92,231,0.06)',
      border: `1px solid ${isDark ? 'rgba(162,155,254,0.14)' : 'rgba(108,92,231,0.1)'}`,
    }}>
      <svg viewBox="0 0 160 112" width={w} height={h}>
        <path d={MP} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" opacity={0.35} />
        <path d={MP} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray="55 225" opacity={0.95} />
      </svg>
    </div>
  )
}

// ── Loading dots ──────────────────────────────────────────────────────────────
function ThinkingDots() {
  return (
    <div style={{ display: 'flex', gap: 5, padding: '2px 0' }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          width: 5, height: 5, borderRadius: '50%', background: '#A29BFE',
          animation: 'dot-pulse 1.2s ease-in-out infinite',
          animationDelay: `${i * 0.2}s`,
        }} />
      ))}
    </div>
  )
}

// ── Dataset file icon ─────────────────────────────────────────────────────────
function DatasetFileIcon({ type }: { type: string }) {
  const lower = type.toLowerCase()
  const bg    = lower === 'xlsx' || lower === 'xls' ? 'rgba(0,196,140,0.10)'
    : lower === 'csv' ? 'rgba(59,130,246,0.10)'
    : 'rgba(162,155,254,0.10)'
  const color = lower === 'xlsx' || lower === 'xls' ? '#00C48C'
    : lower === 'csv' ? '#3B82F6'
    : '#A29BFE'
  const label = lower.toUpperCase().slice(0, 4)
  return (
    <div style={{
      width: 40, height: 40, borderRadius: 12, flexShrink: 0,
      background: bg, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: 0.5, fontFamily: 'monospace' }}>
        {label}
      </span>
    </div>
  )
}

// ── User bubble ───────────────────────────────────────────────────────────────
function UserBubble({ msg, isDark }: { msg: ChatMessage; isDark: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
      <div style={{
        maxWidth: '65%',
        background:   isDark ? 'rgba(108,92,231,0.15)' : 'rgba(108,92,231,0.08)',
        border:       `1px solid ${isDark ? 'rgba(108,92,231,0.25)' : 'rgba(108,92,231,0.14)'}`,
        borderRadius: '18px 18px 4px 18px',
        padding:      '10px 18px',
        fontSize:     14,
        lineHeight:   1.6,
        color:        isDark ? '#E8ECF3' : '#1A1D2E',
      }}>
        {msg.content}
      </div>
    </div>
  )
}

// ── Assistant bubble ──────────────────────────────────────────────────────────
function AssistantBubble({ msg, onSave, isDark }: {
  msg: ChatMessage; onSave?: () => void; isDark: boolean
}) {
  const [chartHover, setChartHover] = useState(false)

  const cardStyle: React.CSSProperties = {
    flex:               1,
    maxWidth:           '90%',
    borderRadius:       '4px 20px 20px 20px',
    padding:            '20px 24px',
    background:         isDark ? 'rgba(26,29,46,0.55)' : 'rgba(255,255,255,0.72)',
    backdropFilter:     'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border:             `1px solid ${isDark ? 'rgba(162,155,254,0.08)' : 'rgba(108,92,231,0.08)'}`,
    boxShadow:          isDark
      ? '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(162,155,254,0.04)'
      : '0 4px 16px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.8)',
  }

  if (msg.loading) {
    return (
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'flex-start' }}>
        <MobiusAvatar isDark={isDark} />
        <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', padding: '14px 20px' }}>
          <ThinkingDots />
          <Skeleton active paragraph={{ rows: 0 }} title={{ width: 80 }}
            style={{ marginLeft: 12, display: 'inline-block' }} />
        </div>
      </div>
    )
  }

  if (msg.error) {
    return (
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'flex-start' }}>
        <MobiusAvatar isDark={isDark} />
        <div style={{
          ...cardStyle,
          padding: '14px 18px',
          background: 'rgba(255,71,87,0.08)',
          border: '1px solid rgba(255,71,87,0.2)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <WarningOutlined style={{ color: '#FF4757', fontSize: 16, flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: isDark ? '#FF6B81' : '#E03040' }}>{msg.error}</span>
        </div>
      </div>
    )
  }

  const chartLabel =
    msg.chart_type === 'bar'            ? '柱状图'
    : msg.chart_type === 'bar_horizontal' ? '条形图'
    : msg.chart_type === 'line'         ? '折线图'
    : msg.chart_type === 'pie'          ? '饼图'
    : '数据表'

  const labelBg    = isDark ? 'rgba(162,155,254,0.10)' : 'rgba(108,92,231,0.07)'
  const labelColor = isDark ? '#A29BFE' : '#6C5CE7'
  const chartBg    = isDark ? 'rgba(15,17,23,0.4)' : 'rgba(248,249,252,0.9)'

  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'flex-start' }}>
      <MobiusAvatar isDark={isDark} />
      <div style={cardStyle}>
        {msg.explanation && (
          <p style={{
            marginBottom: 16, color: isDark ? '#C8D0DC' : '#2D3142',
            fontSize: 14, lineHeight: 1.75, margin: '0 0 16px',
          }}>
            {msg.explanation}
          </p>
        )}

        {msg.data && msg.chart_type && msg.chart_type !== 'table' && (
          <div style={{ marginBottom: 8 }}>
            {/* Meta tag */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 8 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: labelBg, color: labelColor,
                borderRadius: 20, padding: '4px 12px',
                fontSize: 12, fontWeight: 500,
              }}>
                <TableOutlined />
                {chartLabel} · {msg.data.row_count.toLocaleString()} 行 · {msg.data.execution_time_ms.toFixed(0)}ms
              </span>
            </div>

            {/* Chart */}
            <div
              style={{ position: 'relative' }}
              onMouseEnter={() => setChartHover(true)}
              onMouseLeave={() => setChartHover(false)}
            >
              {msg.sql && onSave && (
                <div style={{
                  position: 'absolute', top: 8, right: 8, zIndex: 10,
                  opacity: chartHover ? 1 : 0, transition: 'opacity 0.15s',
                }}>
                  <button onClick={onSave} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', borderRadius: 10,
                    background: isDark ? 'rgba(162,155,254,0.15)' : '#F0EEFF',
                    border: `1px solid ${isDark ? 'rgba(162,155,254,0.25)' : '#D9D5FE'}`,
                    color: labelColor, fontSize: 12, cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}>
                    <PushpinOutlined />
                    保存到看板
                  </button>
                </div>
              )}
              <div style={{ background: chartBg, borderRadius: 14, padding: 16 }}>
                <ChartWidget
                  chartType={msg.chart_type}
                  columns={msg.data.columns}
                  rows={msg.data.rows}
                />
              </div>
            </div>
          </div>
        )}

        <Collapse ghost size="small" style={{ marginTop: msg.chart_type !== 'table' ? 8 : 0 }}
          items={[
            ...(msg.data ? [{
              key: 'table',
              label: (
                <span style={{ fontSize: 12, color: isDark ? '#5F6B7A' : '#9CA3B4', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <TableOutlined />
                  查看数据（{msg.data.row_count} 行）
                </span>
              ),
              children: (
                <ChartWidget chartType="table" columns={msg.data.columns} rows={msg.data.rows} height={300} />
              ),
            }] : []),
            ...(msg.sql ? [{
              key: 'sql',
              label: (
                <span style={{ fontSize: 12, color: isDark ? '#5F6B7A' : '#9CA3B4', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CodeOutlined />
                  查看 SQL
                </span>
              ),
              children: (
                <pre style={{
                  background: '#1A1D2E', color: '#E8ECF3',
                  borderRadius: 12, padding: '16px',
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  fontSize: 13, lineHeight: 1.6, overflowX: 'auto', margin: 0,
                }}>
                  {msg.sql}
                </pre>
              ),
            }] : []),
          ]}
        />
      </div>
    </div>
  )
}

// ── Save to Dashboard Modal (API logic unchanged) ─────────────────────────────
function SaveToDashboardModal({
  open, onClose, msg, datasetId,
}: {
  open: boolean; onClose: () => void; msg: ChatMessage; datasetId: string
}) {
  const [dashboards, setDashboards] = useState<DashboardListItem[]>([])
  const [selectedId, setSelectedId] = useState('__new__')
  const [newName,    setNewName]    = useState('我的分析')
  const [title,      setTitle]      = useState('')
  const [saving,     setSaving]     = useState(false)

  useEffect(() => {
    if (open) {
      setTitle(msg.explanation?.slice(0, 30) ?? '分析结果')
      dashboardApi.list().then((r) => setDashboards(r.data)).catch(() => {})
    }
  }, [open, msg.explanation])

  const handleSave = async () => {
    if (!msg.sql || !title.trim()) return
    setSaving(true)
    try {
      const res = await queryApi.saveToDashboard({
        dashboard_id:       selectedId !== '__new__' ? selectedId : undefined,
        new_dashboard_name: selectedId === '__new__'  ? newName   : undefined,
        dataset_id: datasetId,
        title:      title.trim(),
        sql:        msg.sql,
        chart_type: msg.chart_type ?? 'bar',
        explanation: msg.explanation,
      })
      const dashId = res.data.dashboard_id
      message.success(
        <span>
          已保存到「{res.data.dashboard_name}」{' '}
          <a href={`/dashboards?dashboard=${dashId}`} style={{ color: '#6C5CE7', fontWeight: 500 }}>
            去查看 →
          </a>
        </span>
      )
      onClose()
    } catch {
      message.error('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} title="保存到看板" onCancel={onClose} onOk={handleSave}
      okText="保存" cancelText="取消" confirmLoading={saving}
      okButtonProps={{ disabled: !title.trim() || (selectedId === '__new__' && !newName.trim()) }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 0' }}>
        <div>
          <p style={{ fontSize: 12, color: '#5F6B7A', marginBottom: 6 }}>图表标题</p>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="给这个图表起个名字" />
        </div>
        <div>
          <p style={{ fontSize: 12, color: '#5F6B7A', marginBottom: 6 }}>目标看板</p>
          <Select style={{ width: '100%' }} value={selectedId} onChange={setSelectedId}
            options={[
              { value: '__new__', label: '+ 新建个人看板' },
              ...dashboards.map((d) => ({ value: d.id, label: `${d.name}（${d.widget_count} 个图表）` })),
            ]}
          />
        </div>
        {selectedId === '__new__' && (
          <div>
            <p style={{ fontSize: 12, color: '#5F6B7A', marginBottom: 6 }}>新看板名称</p>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="例如：我的销售分析" />
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── State A: Dataset Selector ─────────────────────────────────────────────────
function DatasetSelectorView({
  datasets, loading, onSelect, isDark,
}: {
  datasets: Dataset[]; loading: boolean; onSelect: (id: string) => void; isDark: boolean
}) {
  const navigate = useNavigate()
  const [hovered, setHovered] = useState<string | null>(null)

  const cardBg     = isDark ? 'rgba(26,29,46,0.45)'   : 'rgba(255,255,255,0.72)'
  const cardBorder = isDark ? 'rgba(162,155,254,0.08)' : 'rgba(108,92,231,0.08)'
  const hoverBorder = isDark ? 'rgba(162,155,254,0.28)' : 'rgba(108,92,231,0.25)'

  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px',
    }}>
      <div style={{ width: 'min(480px, 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
        {/* Icon */}
        <div style={{
          width: 56, height: 56, borderRadius: 18, marginBottom: 20,
          background: isDark ? 'rgba(162,155,254,0.08)' : 'rgba(108,92,231,0.06)',
          border: `1px solid ${isDark ? 'rgba(162,155,254,0.12)' : 'rgba(108,92,231,0.1)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg viewBox="0 0 24 24" width={28} height={28} fill="none"
            stroke={isDark ? '#A29BFE' : '#6C5CE7'} strokeWidth="1.5" strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="3" y1="15" x2="21" y2="15" />
            <line x1="9" y1="3" x2="9" y2="21" />
            <line x1="15" y1="3" x2="15" y2="21" />
          </svg>
        </div>

        {/* Title */}
        <h2 style={{
          fontSize: 22, fontWeight: 500, margin: '0 0 10px',
          color: isDark ? '#E8ECF3' : '#1A1D2E',
          fontFamily: 'Inter, -apple-system, sans-serif',
          textAlign: 'center',
        }}>
          选择一个数据集开始探索
        </h2>
        <p style={{
          fontSize: 14, color: isDark ? '#5F6B7A' : '#9CA3B4',
          textAlign: 'center', maxWidth: 360, lineHeight: 1.6,
          margin: '0 0 28px',
          fontFamily: 'Inter, -apple-system, sans-serif',
        }}>
          选择下方数据集，或上传新文件开始分析
        </p>

        {/* Dataset list */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading ? (
            [0, 1].map((i) => (
              <div key={i} style={{
                height: 72, borderRadius: 16,
                background: cardBg, border: `1px solid ${cardBorder}`,
                animation: 'dot-pulse 1.5s ease-in-out infinite',
                animationDelay: `${i * 0.2}s`,
              }} />
            ))
          ) : datasets.map((ds) => (
            <div key={ds.id}
              onClick={() => onSelect(ds.id)}
              onMouseEnter={() => setHovered(ds.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 18px',
                borderRadius: 16,
                border: `1px solid ${hovered === ds.id ? hoverBorder : cardBorder}`,
                background: hovered === ds.id
                  ? isDark ? 'rgba(42,37,80,0.45)' : 'rgba(255,255,255,0.9)'
                  : cardBg,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                cursor: 'pointer',
                transform: hovered === ds.id ? 'translateY(-1px)' : 'translateY(0)',
                transition: 'all 0.2s',
                boxShadow: hovered === ds.id
                  ? isDark ? '0 6px 20px rgba(0,0,0,0.3)' : '0 4px 16px rgba(108,92,231,0.12)'
                  : 'none',
              }}
            >
              <DatasetFileIcon type={ds.source_type} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 14, fontWeight: 500,
                  color: isDark ? '#E8ECF3' : '#1A1D2E',
                  marginBottom: 3,
                  fontFamily: 'Inter, -apple-system, sans-serif',
                }}>
                  {ds.name}
                </div>
                <div style={{ fontSize: 12, color: isDark ? '#5F6B7A' : '#9CA3B4', fontFamily: 'Inter, -apple-system, sans-serif' }}>
                  {ds.row_count.toLocaleString()} 行 · {ds.column_count} 字段 · {ds.source_type.toUpperCase()}
                </div>
              </div>
              <svg viewBox="0 0 16 16" width={16} height={16} fill="none"
                stroke={hovered === ds.id ? (isDark ? '#A29BFE' : '#6C5CE7') : (isDark ? '#3D4256' : '#C4CBD6')}
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ flexShrink: 0, transition: 'stroke 0.2s' }}
              >
                <path d="M6 3l5 5-5 5" />
              </svg>
            </div>
          ))}

          {/* Upload button */}
          <div
            onClick={() => navigate('/upload')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '14px 18px',
              borderRadius: 16,
              border: `1px dashed ${isDark ? 'rgba(162,155,254,0.15)' : 'rgba(108,92,231,0.15)'}`,
              background: 'transparent',
              cursor: 'pointer',
              transition: 'all 0.2s',
              color: isDark ? '#5F6B7A' : '#9CA3B4',
              fontSize: 13,
              fontFamily: 'Inter, -apple-system, sans-serif',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLDivElement
              el.style.borderColor = isDark ? 'rgba(162,155,254,0.35)' : 'rgba(108,92,231,0.3)'
              el.style.color = isDark ? '#A29BFE' : '#6C5CE7'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLDivElement
              el.style.borderColor = isDark ? 'rgba(162,155,254,0.15)' : 'rgba(108,92,231,0.15)'
              el.style.color = isDark ? '#5F6B7A' : '#9CA3B4'
            }}
          >
            <UploadOutlined style={{ fontSize: 15 }} />
            上传新数据集
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Welcome (empty chat state) ────────────────────────────────────────────────
function WelcomeView({
  suggestions, onSend, sending, isDark,
}: {
  suggestions: string[]; onSend: (q: string) => void; sending: boolean; isDark: boolean
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const mobiusW = 80, mobiusH = 56

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      paddingTop: 80, paddingBottom: 40,
    }}>
      {/* Möbius icon */}
      <div style={{
        width: mobiusW, height: mobiusH,
        borderRadius: 16, marginBottom: 20,
        background: isDark ? 'rgba(162,155,254,0.07)' : 'rgba(108,92,231,0.05)',
        border: `1px solid ${isDark ? 'rgba(162,155,254,0.12)' : 'rgba(108,92,231,0.1)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg viewBox="0 0 160 112" width={mobiusW - 16} height={mobiusH - 12}>
          <path d={MP} fill="none" stroke={isDark ? '#A29BFE' : '#6C5CE7'}
            strokeWidth="5" strokeLinecap="round" opacity={0.35} />
          <path d={MP} fill="none" stroke={isDark ? '#A29BFE' : '#6C5CE7'}
            strokeWidth="5" strokeLinecap="round" strokeDasharray="55 225" opacity={0.9} />
        </svg>
      </div>

      <h3 style={{
        fontSize: 16, fontWeight: 500, margin: '0 0 8px',
        color: isDark ? '#E8ECF3' : '#1A1D2E',
        fontFamily: 'Inter, -apple-system, sans-serif',
      }}>
        想探索什么？
      </h3>
      <p style={{
        fontSize: 13, color: isDark ? '#5F6B7A' : '#9CA3B4',
        maxWidth: 380, textAlign: 'center', lineHeight: 1.6,
        margin: '0 0 28px',
        fontFamily: 'Inter, -apple-system, sans-serif',
      }}>
        用自然语言提问，AI 会生成查询、执行并可视化结果
      </p>

      {/* Suggestion chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 560 }}>
        {suggestions.map((q, i) => (
          <button key={q}
            onClick={() => onSend(q)}
            disabled={sending}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            style={{
              padding: '8px 16px', borderRadius: 20,
              border: `1px solid ${hovered === i
                ? isDark ? 'rgba(162,155,254,0.30)' : 'rgba(108,92,231,0.22)'
                : isDark ? 'rgba(162,155,254,0.10)' : 'rgba(108,92,231,0.10)'}`,
              background: hovered === i
                ? isDark ? 'rgba(42,37,80,0.4)' : 'rgba(240,238,255,0.7)'
                : isDark ? 'rgba(26,29,46,0.4)' : 'rgba(255,255,255,0.7)',
              backdropFilter: 'blur(8px)',
              color: hovered === i
                ? isDark ? '#E8ECF3' : '#1A1D2E'
                : isDark ? '#9CA3B4' : '#5F6B7A',
              fontSize: 13, cursor: sending ? 'not-allowed' : 'pointer',
              fontFamily: 'Inter, -apple-system, sans-serif',
              transition: 'all 0.18s',
              opacity: sending ? 0.5 : 1,
            }}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Command Bar ───────────────────────────────────────────────────────────────
function CommandBar({
  value, onChange, onSubmit, onKeyDown, sending, disabled, isDark,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  sending: boolean
  disabled: boolean
  isDark: boolean
}) {
  const [focused, setFocused] = useState(false)
  const barBg = isDark ? 'rgba(26,29,46,0.65)' : 'rgba(255,255,255,0.75)'
  const barBorder = focused
    ? isDark ? 'rgba(162,155,254,0.35)' : 'rgba(108,92,231,0.30)'
    : isDark ? 'rgba(162,155,254,0.10)' : 'rgba(108,92,231,0.10)'
  const barShadow = focused
    ? isDark
      ? '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(162,155,254,0.15)'
      : '0 8px 24px rgba(108,92,231,0.15)'
    : isDark ? '0 8px 32px rgba(0,0,0,0.3)' : '0 4px 20px rgba(0,0,0,0.08)'

  return (
    /* Full-width fixed wrapper, transparent, pointer-events none */
    <div style={{
      position: 'fixed', bottom: 0, left: 64, right: 0,
      padding: '0 24px 24px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      pointerEvents: 'none', zIndex: 10,
    }}>
      {/* Actual bar */}
      <div style={{
        width: 'min(640px, 100%)',
        pointerEvents: 'all',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '6px 6px 6px 20px',
          borderRadius: 16,
          background: barBg,
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: `1px solid ${barBorder}`,
          boxShadow: barShadow,
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={disabled ? '请先选择数据集…' : '询问关于数据的任何问题…'}
            disabled={disabled || sending}
            rows={1}
            style={{
              flex: 1, border: 'none', outline: 'none', resize: 'none',
              background: 'transparent',
              color: isDark ? '#E8ECF3' : '#1A1D2E',
              fontSize: 14, lineHeight: 1.6,
              fontFamily: 'Inter, -apple-system, sans-serif',
              maxHeight: 120, overflowY: 'auto',
              padding: 0,
            }}
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = Math.min(el.scrollHeight, 120) + 'px'
            }}
          />
          {/* Send button */}
          <button
            onClick={onSubmit}
            disabled={!value.trim() || disabled || sending}
            style={{
              width: 40, height: 40, borderRadius: 12, flexShrink: 0,
              background: !value.trim() || disabled || sending
                ? isDark ? 'rgba(162,155,254,0.12)' : 'rgba(108,92,231,0.10)'
                : 'linear-gradient(135deg, #6C5CE7 0%, #A29BFE 100%)',
              border: 'none', cursor: !value.trim() || disabled || sending ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s',
            }}
          >
            {sending ? (
              <ThinkingDots />
            ) : (
              <svg viewBox="0 0 16 16" width={16} height={16} fill="none"
                stroke={!value.trim() || disabled ? '#5F6B7A' : '#FFFFFF'}
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 8h12M8 3l6 5-6 5" />
              </svg>
            )}
          </button>
        </div>

        {/* Hint */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          marginTop: 8, fontSize: 11,
          color: isDark ? '#2D3142' : '#C4CBD6',
          fontFamily: 'Inter, -apple-system, sans-serif',
        }}>
          <span style={{
            padding: '1px 6px', borderRadius: 5,
            background: isDark ? 'rgba(162,155,254,0.06)' : 'rgba(108,92,231,0.05)',
            fontSize: 10,
          }}>Enter</span>
          发送
          <span style={{ margin: '0 2px' }}>·</span>
          <span style={{
            padding: '1px 6px', borderRadius: 5,
            background: isDark ? 'rgba(162,155,254,0.06)' : 'rgba(108,92,231,0.05)',
            fontSize: 10,
          }}>Shift+Enter</span>
          换行
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const [searchParams]       = useSearchParams()
  const initDatasetId         = searchParams.get('dataset_id') ?? null
  const initQ                 = searchParams.get('q')
  const { user }              = useAuthStore()
  const { addQuery }          = useChatStore()
  const { theme }             = useThemeStore()
  const isDark                = theme === 'dark'
  const scopeText             = computeScopeText(user)

  const [datasets,          setDatasets]          = useState<Dataset[]>([])
  const [datasetsLoading,   setDatasetsLoading]   = useState(true)
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(initDatasetId)
  const [messages,          setMessages]          = useState<ChatMessage[]>([])
  const [inputValue,        setInputValue]        = useState('')
  const [sending,           setSending]           = useState(false)
  const [suggestions,       setSuggestions]       = useState<string[]>([])
  const [saveTarget,        setSaveTarget]        = useState<ChatMessage | null>(null)

  // ── Conversation history ───────────────────────────────────────────────
  const [historyOpen,      setHistoryOpen]      = useState(false)
  const [conversations,    setConversations]    = useState<ConversationListItem[]>([])
  const [currentConvId,    setCurrentConvId]    = useState<string | null>(null)
  const [historyLoading,   setHistoryLoading]   = useState(false)
  const currentConvIdRef = useRef<string | null>(null)  // stable ref to avoid stale closure

  const bottomRef     = useRef<HTMLDivElement>(null)
  const autoQueryRef  = useRef(false)

  // ── Load conversation list ────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await conversationApi.list()
      setConversations(res.data)
    } catch { /* ignore */ } finally {
      setHistoryLoading(false)
    }
  }, [])

  // Load a specific conversation into the chat
  const loadConversation = useCallback(async (convId: string, datasetId: string | null) => {
    try {
      const res = await conversationApi.get(convId)
      _setCurrentConvId(convId)
      if (datasetId) setSelectedDatasetId(datasetId)
      setMessages(res.data.messages.map((m) => ({
        id:         m.id,
        role:       m.role as 'user' | 'assistant',
        content:    m.content,
        sql:        m.query_sql ?? undefined,
        chart_type: (m.chart_type ?? undefined) as ChartType | undefined,
        data:       m.data ? { ...m.data, execution_time_ms: 0 } : undefined,
        dataset_id: datasetId ?? undefined,
      })))
      setHistoryOpen(false)
    } catch { message.error('加载对话失败') }
  }, [])

  // Load datasets
  useEffect(() => {
    datasetsApi.list()
      .then((res) => {
        setDatasets(res.data)
        setDatasetsLoading(false)
        if (initQ && !autoQueryRef.current) {
          autoQueryRef.current = true
          const dsId = initDatasetId ?? res.data[0]?.id
          if (!dsId) return
          setSelectedDatasetId(dsId)

          // If coming from dashboard with a pre-fetched result, reuse it — no extra API call
          const sr = useViewStore.getState().result
          if (sr && sr.query === initQ && sr.dataset_id === dsId) {
            const userMsg:  ChatMessage = { id: genId(), role: 'user',      content: initQ }
            const assistantMsg: ChatMessage = {
              id:          genId(),
              role:        'assistant',
              content:     sr.explanation || initQ,
              sql:         sr.sql,
              explanation: sr.explanation || '',
              chart_type:  sr.chartType as ChartType,
              data:        { columns: sr.columns, rows: sr.rows, row_count: sr.rows.length, execution_time_ms: 0 },
              dataset_id:  dsId,
            }
            setMessages([userMsg, assistantMsg])
            useViewStore.getState().reset()
          } else {
            setTimeout(() => sendMessageWithId(initQ, dsId), 120)
          }
        }
      })
      .catch(() => {
        message.error('数据集加载失败，请刷新重试')
        setDatasetsLoading(false)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load schema for suggestions when dataset selected
  useEffect(() => {
    if (!selectedDatasetId) { setSuggestions([]); return }
    datasetsApi.get(selectedDatasetId)
      .then((res) => setSuggestions(generateSuggestions(res.data.schema_info?.columns ?? [])))
      .catch(() => setSuggestions(['数据总量和关键指标概览', '各维度汇总统计', '最近数据整体趋势', '数据分布情况分析']))
  }, [selectedDatasetId])

  // Scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Core send (explicit dsId to avoid stale closure) ──────────────────────
  const sendMessageWithId = useCallback(async (question: string, dsId: string) => {
    if (!question.trim() || sending) return
    const userMsg:    ChatMessage = { id: genId(), role: 'user',      content: question }
    const loadingMsg: ChatMessage = { id: genId(), role: 'assistant', content: '', loading: true }
    setMessages((prev) => [...prev, userMsg, loadingMsg])
    setInputValue('')
    setSending(true)
    try {
      const res = await queryApi.ask(question, dsId)
      const { sql, explanation, chart_type, data } = res.data
      setMessages((prev) => prev.map((m) =>
        m.id === loadingMsg.id
          ? { ...m, loading: false, content: explanation, sql, explanation, chart_type: chart_type as ChartType, data, dataset_id: dsId }
          : m
      ))
      addQuery({
        id:         loadingMsg.id,
        title:      explanation.slice(0, 40) || question.slice(0, 40),
        sql,
        chart_type: chart_type as ChartType,
        dataset_id: dsId,
        row_count:  data.row_count,
        created_at: new Date().toISOString(),
      })

      // Save to conversation history (fire-and-forget, use ref to avoid stale closure)
      const saveMessages = [
        { role: 'user', content: question },
        { role: 'assistant', content: explanation, query_sql: sql, chart_type,
          data: data ? { columns: data.columns, rows: data.rows.slice(0, 200), row_count: data.row_count } : undefined },
      ]
      const convId = currentConvIdRef.current
      if (convId) {
        conversationApi.addMessages(convId, saveMessages)
          .then(() => loadConversations())
          .catch(() => {})
      } else {
        conversationApi.create({ dataset_id: dsId, title: question.slice(0, 80) })
          .then((r) => {
            _setCurrentConvId(r.data.id)
            return conversationApi.addMessages(r.data.id, saveMessages)
          })
          .then(() => loadConversations())
          .catch(() => {})
      }
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? '查询失败，请重试'
      setMessages((prev) => prev.map((m) =>
        m.id === loadingMsg.id ? { ...m, loading: false, error: detail } : m
      ))
    } finally {
      setSending(false)
    }
  }, [sending, addQuery, loadConversations])

  const sendMessage = useCallback((question: string) => {
    if (!selectedDatasetId) { message.warning('请先选择一个数据集'); return }
    sendMessageWithId(question, selectedDatasetId)
  }, [selectedDatasetId, sendMessageWithId])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(inputValue) }
  }

  // Keep ref in sync with state
  const _setCurrentConvId = (id: string | null) => {
    currentConvIdRef.current = id
    setCurrentConvId(id)
  }

  const handleSelectDataset = (id: string) => {
    setSelectedDatasetId(id)
    setMessages([])
    _setCurrentConvId(null)
  }

  const handleNewConversation = () => {
    setMessages([])
    _setCurrentConvId(null)
    setHistoryOpen(false)
  }

  const handleDeleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await conversationApi.delete(convId)
      if (currentConvId === convId) { setMessages([]); setCurrentConvId(null) }
      setConversations((prev) => prev.filter((c) => c.id !== convId))
    } catch { message.error('删除失败') }
  }

  const selectedDataset = datasets.find((d) => d.id === selectedDatasetId)

  // ── State A: No dataset selected ──────────────────────────────────────────
  if (!selectedDatasetId) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'transparent' }}>
        <DatasetSelectorView
          datasets={datasets}
          loading={datasetsLoading}
          onSelect={handleSelectDataset}
          isDark={isDark}
        />
      </div>
    )
  }

  // ── Conversation grouping ─────────────────────────────────────────────────
  const groupConversations = (list: ConversationListItem[]) => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 6)
    const monthStart = new Date(todayStart); monthStart.setDate(monthStart.getDate() - 29)
    const groups: { label: string; items: ConversationListItem[] }[] = [
      { label: '今天', items: [] },
      { label: '最近 7 天', items: [] },
      { label: '最近 30 天', items: [] },
      { label: '更早', items: [] },
    ]
    for (const c of list) {
      const d = new Date(c.updated_at)
      if (d >= todayStart)  groups[0].items.push(c)
      else if (d >= weekStart)  groups[1].items.push(c)
      else if (d >= monthStart) groups[2].items.push(c)
      else                      groups[3].items.push(c)
    }
    return groups.filter((g) => g.items.length > 0)
  }

  // ── State B: Chat interface ────────────────────────────────────────────────
  const topGrad = isDark
    ? 'linear-gradient(180deg, rgba(8,10,18,0.96) 0%, rgba(8,10,18,0.3) 70%, transparent 100%)'
    : 'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.3) 70%, transparent 100%)'

  const chipBg     = isDark ? 'rgba(162,155,254,0.10)' : 'rgba(108,92,231,0.08)'
  const chipBorder = isDark ? 'rgba(162,155,254,0.14)' : 'rgba(108,92,231,0.12)'
  const chipColor  = isDark ? '#A29BFE' : '#6C5CE7'

  const convGroups = groupConversations(conversations)

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'transparent', position: 'relative' }}>

      {/* ── History sidebar backdrop ── */}
      {historyOpen && (
        <div
          onClick={() => setHistoryOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(2px)' }}
        />
      )}

      {/* ── History sidebar panel ── */}
      <div style={{
        position: 'fixed', left: historyOpen ? 64 : -300, top: 0, bottom: 0, width: 280,
        zIndex: 31,
        background: isDark ? 'rgba(14,16,26,0.97)' : 'rgba(255,255,255,0.97)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderRight: isDark ? '1px solid rgba(162,155,254,0.10)' : '1px solid rgba(108,92,231,0.10)',
        display: 'flex', flexDirection: 'column',
        transition: 'left 0.28s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: historyOpen ? '4px 0 32px rgba(0,0,0,0.18)' : 'none',
      }}>
        {/* Sidebar header */}
        <div style={{
          padding: '18px 16px 12px',
          borderBottom: isDark ? '1px solid rgba(162,155,254,0.06)' : '1px solid rgba(108,92,231,0.06)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <ClockCircleOutlined style={{ color: '#A29BFE', fontSize: 14 }} />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: isDark ? '#E8ECF3' : '#1A1D2E' }}>对话历史</span>
          <button
            onClick={handleNewConversation}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
              borderRadius: 8, border: '1px solid rgba(108,92,231,0.25)',
              background: 'rgba(108,92,231,0.10)', cursor: 'pointer',
              fontSize: 12, color: '#A29BFE', fontWeight: 500,
            }}
          >
            <PlusOutlined style={{ fontSize: 11 }} />新对话
          </button>
        </div>

        {/* Conversation list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {historyLoading && (
            <div style={{ padding: '20px 8px' }}>
              {[1,2,3,4].map(i => <Skeleton key={i} active paragraph={{ rows: 1 }} style={{ marginBottom: 8 }} />)}
            </div>
          )}
          {!historyLoading && convGroups.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#5F6B7A', fontSize: 13 }}>
              暂无对话记录
            </div>
          )}
          {convGroups.map((group) => (
            <div key={group.label}>
              <div style={{
                padding: '10px 8px 4px',
                fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
                color: isDark ? '#5F6B7A' : '#9CA3B4',
                textTransform: 'uppercase',
              }}>
                {group.label}
              </div>
              {group.items.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => loadConversation(conv.id, conv.dataset_id)}
                  style={{
                    padding: '9px 10px',
                    borderRadius: 10,
                    marginBottom: 2,
                    cursor: 'pointer',
                    background: currentConvId === conv.id
                      ? (isDark ? 'rgba(108,92,231,0.18)' : 'rgba(108,92,231,0.08)')
                      : 'transparent',
                    border: currentConvId === conv.id
                      ? '1px solid rgba(108,92,231,0.22)'
                      : '1px solid transparent',
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    transition: 'background 0.15s',
                    position: 'relative',
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget
                    if (currentConvId !== conv.id) el.style.background = isDark ? 'rgba(162,155,254,0.06)' : 'rgba(108,92,231,0.04)'
                    el.querySelector<HTMLElement>('.conv-del-btn')!.style.opacity = '1'
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget
                    if (currentConvId !== conv.id) el.style.background = 'transparent'
                    el.querySelector<HTMLElement>('.conv-del-btn')!.style.opacity = '0'
                  }}
                >
                  <MessageOutlined style={{ fontSize: 12, color: '#A29BFE', marginTop: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, color: isDark ? '#D4D8E4' : '#2D3142',
                      fontWeight: currentConvId === conv.id ? 500 : 400,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {conv.title}
                    </div>
                    <div style={{ fontSize: 11, color: '#5F6B7A', marginTop: 2 }}>
                      {conv.message_count} 条消息 · {new Date(conv.updated_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
                    </div>
                  </div>
                  <button
                    className="conv-del-btn"
                    onClick={(e) => handleDeleteConversation(conv.id, e)}
                    style={{
                      opacity: 0, transition: 'opacity 0.15s',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#5F6B7A', padding: '2px 4px', borderRadius: 6,
                      fontSize: 13, flexShrink: 0,
                    }}
                  >
                    <DeleteOutlined />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── Top gradient bar ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        background: topGrad,
        padding: '14px 24px 40px',
        zIndex: 5,
        display: 'flex', alignItems: 'center', gap: 12,
        pointerEvents: 'none',
      }}>
        {/* Dataset chip */}
        <button
          onClick={() => setSelectedDatasetId(null)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '5px 12px 5px 10px', borderRadius: 20,
            background: chipBg, border: `1px solid ${chipBorder}`,
            cursor: 'pointer', pointerEvents: 'all',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget
            el.style.borderColor = isDark ? 'rgba(162,155,254,0.30)' : 'rgba(108,92,231,0.25)'
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget
            el.style.borderColor = chipBorder
          }}
        >
          {/* Green "connected" dot */}
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: '#00C48C',
            boxShadow: '0 0 6px rgba(0,196,140,0.6)',
          }} />
          <span style={{ fontSize: 13, color: chipColor, fontFamily: 'Inter, -apple-system, sans-serif', fontWeight: 500 }}>
            {selectedDataset?.name ?? '数据集'}
          </span>
          <span style={{ fontSize: 12, color: isDark ? '#5F6B7A' : '#9CA3B4', fontFamily: 'Inter, -apple-system, sans-serif' }}>
            {selectedDataset?.row_count?.toLocaleString()} 行
          </span>
          <DownOutlined style={{ fontSize: 10, color: isDark ? '#5F6B7A' : '#9CA3B4' }} />
        </button>

        {/* Scope chip */}
        {scopeText && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', borderRadius: 20,
            background: chipBg, border: `1px solid ${chipBorder}`,
            fontSize: 12, color: isDark ? '#9CA3B4' : '#5F6B7A',
            fontFamily: 'Inter, -apple-system, sans-serif',
            pointerEvents: 'none',
          }}>
            <LockOutlined style={{ fontSize: 11, color: isDark ? '#5F6B7A' : '#9CA3B4' }} />
            数据范围: {scopeText}
          </span>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* History toggle button */}
        <button
          onClick={() => { setHistoryOpen((v) => !v); if (!historyOpen) loadConversations() }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 20,
            background: historyOpen ? (isDark ? 'rgba(108,92,231,0.22)' : 'rgba(108,92,231,0.12)') : chipBg,
            border: `1px solid ${historyOpen ? 'rgba(108,92,231,0.4)' : chipBorder}`,
            cursor: 'pointer', pointerEvents: 'all',
            fontSize: 13, color: chipColor, fontWeight: 500,
            transition: 'all 0.2s',
          }}
        >
          <ClockCircleOutlined style={{ fontSize: 13 }} />
          历史对话
        </button>
      </div>

      {/* ── Messages area ── */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '72px 40px 140px',
        position: 'relative',
      }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {messages.length === 0 && (
            <WelcomeView
              suggestions={suggestions}
              onSend={sendMessage}
              sending={sending}
              isDark={isDark}
            />
          )}

          {messages.map((msg) =>
            msg.role === 'user' ? (
              <UserBubble key={msg.id} msg={msg} isDark={isDark} />
            ) : (
              <AssistantBubble
                key={msg.id}
                msg={msg}
                isDark={isDark}
                onSave={msg.sql ? () => setSaveTarget(msg) : undefined}
              />
            )
          )}
          <div ref={bottomRef} style={{ height: 1 }} />
        </div>
      </div>

      {/* ── Command bar ── */}
      <CommandBar
        value={inputValue}
        onChange={setInputValue}
        onSubmit={() => sendMessage(inputValue)}
        onKeyDown={handleKeyDown}
        sending={sending}
        disabled={false}
        isDark={isDark}
      />

      {/* ── Save modal ── */}
      {saveTarget && (
        <SaveToDashboardModal
          open={!!saveTarget}
          onClose={() => setSaveTarget(null)}
          msg={saveTarget}
          datasetId={saveTarget.dataset_id ?? selectedDatasetId ?? ''}
        />
      )}
    </div>
  )
}
