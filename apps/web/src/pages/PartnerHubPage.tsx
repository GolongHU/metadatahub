import { useCallback, useEffect, useRef, useState } from 'react'
import { AutoComplete, Input, Spin } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import { partnerApi } from '../services/partnerApi'
import type { PartnerDetailData, PartnerListItem, DimSection, MetricRow } from '../types/partner'
import TierBadge from '../components/partner/TierBadge'
import RadarChart from '../components/partner/RadarChart'

// ─── constants ────────────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  strategic: '#6C5CE7',
  core: '#3B82F6',
  growth: '#00C48C',
  observation: '#FFB946',
  risk: '#FF4757',
}

const DIM_LABELS: Record<string, string> = {
  performance: '业绩贡献度',
  growth: '增长驱动力',
  engagement: '合作紧密度',
  health: '运营健康度',
  activity: '生态活跃度',
}

const DIM_ICONS: Record<string, string> = {
  performance: '💹',
  growth: '🚀',
  engagement: '🤝',
  health: '🏥',
  activity: '⚡',
}

const TIER_THRESHOLDS: [number, number, string][] = [
  [8.5, 10,  'rgba(108,92,231,0.08)'],
  [7.0, 8.5, 'rgba(59,130,246,0.08)'],
  [5.0, 7.0, 'rgba(0,196,140,0.07)'],
  [3.5, 5.0, 'rgba(255,185,70,0.07)'],
  [0,   3.5, 'rgba(255,71,87,0.07)'],
]

const CATEGORY_COLOR: Record<string, string> = {
  核心伙伴: '#6C5CE7',
  增长引擎: '#00C48C',
  价值伙伴: '#3B82F6',
  潜力伙伴: '#FFB946',
  普通伙伴: '#9CA3B4',
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function scoreColor(s: number): string {
  if (s >= 8.5) return TIER_COLORS.strategic
  if (s >= 7.0) return TIER_COLORS.core
  if (s >= 5.0) return TIER_COLORS.growth
  if (s >= 3.5) return TIER_COLORS.observation
  return TIER_COLORS.risk
}

function deriveCategory(radar: Record<string, number>, total: number): string {
  const { growth = 0, engagement = 0, activity = 0 } = radar
  if (total >= 7.0)                        return '核心伙伴'
  if (growth >= 6.0)                       return '增长引擎'
  if (total >= 5.5)                        return '价值伙伴'
  if (engagement >= 7.0 || activity >= 6.5) return '潜力伙伴'
  return '普通伙伴'
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'rgba(26,29,46,0.55)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 16,
      padding: 20,
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      boxSizing: 'border-box',
      ...style,
    }}>
      {children}
    </div>
  )
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div style={{ width: '100%', height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
      <div style={{
        width: `${(score / 10) * 100}%`, height: '100%', borderRadius: 3,
        background: color, transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
      }} />
    </div>
  )
}

// ─── Hero card ────────────────────────────────────────────────────────────────

function HeroCard({ data }: { data: PartnerDetailData }) {
  const tierColor = TIER_COLORS[data.tier] ?? '#9CA3B4'
  const category  = deriveCategory(data.radar, data.total_score)
  const catColor  = CATEGORY_COLOR[category] ?? '#9CA3B4'

  return (
    <div style={{
      gridColumn: '1 / -1',
      background: `linear-gradient(135deg, ${tierColor}1A 0%, rgba(10,12,20,0.96) 65%)`,
      border: `1px solid ${tierColor}40`,
      borderRadius: 20,
      padding: '24px 28px',
      display: 'flex',
      alignItems: 'center',
      gap: 32,
      flexWrap: 'wrap',
      boxSizing: 'border-box',
    }}>
      {/* identity */}
      <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TierBadge tier={data.tier} size="large" />
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '3px 10px', borderRadius: 999,
            background: `${catColor}22`, color: catColor,
            fontSize: 11, fontWeight: 700,
            border: `1px solid ${catColor}44`, letterSpacing: '0.02em',
          }}>
            {category}
          </span>
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#E8ECF3', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
          {data.partner_name}
        </div>
        <div style={{ fontSize: 12, color: '#9CA3B4', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {data.region && <span>{data.region}</span>}
          {data.manager_name && (
            <>
              <span style={{ color: '#2D3142' }}>·</span>
              <span>伙伴经理: {data.manager_name}</span>
            </>
          )}
        </div>
      </div>

      {/* PRI big score */}
      <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <div style={{ fontSize: 10, color: '#5F6B7A', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
          PRI 综合得分
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontSize: 60, fontWeight: 900, color: tierColor, lineHeight: 1, letterSpacing: '-3px' }}>
            {data.total_score.toFixed(1)}
          </span>
          <span style={{ fontSize: 22, color: '#3D4255', fontWeight: 300 }}>/10</span>
        </div>
        {data.score_change !== 0 && (
          <span style={{ fontSize: 13, fontWeight: 700, color: data.score_change > 0 ? '#00C48C' : '#FF4757' }}>
            {data.score_change > 0 ? `▲ +${data.score_change.toFixed(2)}` : `▼ ${data.score_change.toFixed(2)}`}
            <span style={{ fontSize: 10, color: '#5F6B7A', marginLeft: 3 }}>vs 上期</span>
          </span>
        )}
      </div>

      {/* 5 dim mini scores strip */}
      <div style={{ flex: 1, minWidth: 220, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
        {Object.entries(DIM_LABELS).map(([key, label]) => {
          const s = data.radar[key] ?? 0
          const c = scoreColor(s)
          return (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
              <div style={{ fontSize: 9, color: '#5F6B7A', letterSpacing: '0.05em' }}>{label.slice(0, 4)}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: c, lineHeight: 1 }}>{s.toFixed(1)}</div>
              <ScoreBar score={s} color={c} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Dimension detail cards ────────────────────────────────────────────────────

function DimCards({ dimensions }: { dimensions: DimSection[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <Card style={{ gridColumn: '2 / -1', display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto', maxHeight: 380 }}>
      {dimensions.map((dim, idx) => {
        const color  = scoreColor(dim.score)
        const label  = DIM_LABELS[dim.dimension] ?? dim.dimension
        const icon   = DIM_ICONS[dim.dimension] ?? '📊'
        const isLast = idx === dimensions.length - 1
        const isOpen = expanded === dim.dimension
        const metrics = dim.metrics.slice(0, 6)

        return (
          <div key={dim.dimension} style={{
            paddingBottom: isLast ? 0 : 14,
            marginBottom: isLast ? 0 : 14,
            borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.05)',
          }}>
            {/* header row */}
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8 }}
              onClick={() => setExpanded(isOpen ? null : dim.dimension)}
            >
              <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#E8ECF3', flex: 1 }}>{label}</span>
              <span style={{
                fontSize: 13, fontWeight: 700, color,
                background: `${color}18`, border: `1px solid ${color}40`,
                borderRadius: 5, padding: '1px 8px', whiteSpace: 'nowrap',
              }}>
                {dim.score.toFixed(1)}
              </span>
              <span style={{ fontSize: 10, color: '#5F6B7A', width: 14, textAlign: 'center' }}>
                {isOpen ? '▲' : '▼'}
              </span>
            </div>
            <ScoreBar score={dim.score} color={color} />

            {/* expandable metrics grid */}
            {isOpen && metrics.length > 0 && (
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px 8px' }}>
                {metrics.map((m: MetricRow) => {
                  const tc = m.trend === 'up' ? '#00C48C' : m.trend === 'down' ? '#FF4757' : '#9CA3B4'
                  const ts = m.trend === 'up' ? '▲' : m.trend === 'down' ? '▼' : '→'
                  return (
                    <div key={m.key} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '7px 10px' }}>
                      <div style={{ fontSize: 10, color: '#5F6B7A', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {m.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                        <span style={{ fontSize: 14, color: '#E8ECF3', fontWeight: 700 }}>
                          {typeof m.value === 'number' ? m.value.toFixed(1) : m.value}
                        </span>
                        {m.unit && <span style={{ fontSize: 10, color: '#9CA3B4' }}>{m.unit}</span>}
                        <span style={{ fontSize: 10, color: tc, marginLeft: 'auto' }}>{ts}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </Card>
  )
}

// ─── History trend ────────────────────────────────────────────────────────────

function HistoryCard({ data }: { data: PartnerDetailData }) {
  const periods  = data.monthly_trend.map((h: { period: string }) => {
    const p = h.period.split('-')
    return p.length === 2 ? `${p[1]}月` : h.period
  })
  const scores   = data.monthly_trend.map((h: { score: number }) => h.score)
  const tc       = TIER_COLORS[data.tier] ?? '#6C5CE7'

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1A1D2E',
      borderColor: '#2D3142',
      borderWidth: 1,
      textStyle: { color: '#E8ECF3', fontSize: 12 },
      extraCssText: 'border-radius:8px;padding:10px 14px;',
      formatter: (p: { axisValue: string; value: number }[]) => `${p[0].axisValue}: ${p[0].value?.toFixed(2)}`,
    },
    grid: { left: 44, right: 12, top: 12, bottom: 28, containLabel: false },
    xAxis: {
      type: 'category', data: periods,
      axisLine: { lineStyle: { color: '#2D3142' } },
      axisTick: { show: false },
      axisLabel: { color: '#5F6B7A', fontSize: 10 },
    },
    yAxis: {
      type: 'value', min: 0, max: 10, interval: 2,
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: '#5F6B7A', fontSize: 10 },
      splitLine: { lineStyle: { color: 'rgba(162,155,254,0.05)', type: 'dashed' } },
    },
    series: [{
      type: 'line', data: scores, smooth: true,
      symbol: 'circle', symbolSize: 5,
      lineStyle: { color: tc, width: 2.5 },
      itemStyle: { color: tc },
      areaStyle: { color: `${tc}18` },
      markArea: {
        silent: true,
        data: TIER_THRESHOLDS.map(([lo, hi, bg]) => [
          { yAxis: lo, itemStyle: { color: bg } },
          { yAxis: hi },
        ]),
      },
      markLine: {
        silent: true, symbol: 'none',
        data: [
          { yAxis: 8.5, lineStyle: { color: TIER_COLORS.strategic + '55', type: 'dashed', width: 1 } },
          { yAxis: 7.0, lineStyle: { color: TIER_COLORS.core + '55',      type: 'dashed', width: 1 } },
          { yAxis: 5.0, lineStyle: { color: TIER_COLORS.growth + '55',    type: 'dashed', width: 1 } },
          { yAxis: 3.5, lineStyle: { color: TIER_COLORS.observation + '55', type: 'dashed', width: 1 } },
        ],
      },
    }],
  }

  return (
    <Card style={{ gridColumn: '1 / -1' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#9CA3B4', marginBottom: 12 }}>
        📈 PRI 历史趋势（近12期）
      </div>
      <ReactECharts option={option} style={{ height: 180 }} opts={{ renderer: 'svg' }} notMerge />
    </Card>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: 360, gap: 12,
    }}>
      <div style={{ fontSize: 52, opacity: 0.5 }}>🏢</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#5F6B7A' }}>搜索一个伙伴开始</div>
      <div style={{ fontSize: 13, color: '#3D4255' }}>输入伙伴名称，查看 PRI 综合评分与经营画像</div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PartnerHubPage() {
  const [query,      setQuery]      = useState('')
  const [options,    setOptions]    = useState<{ value: string; label: React.ReactNode; id: string }[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail,     setDetail]     = useState<PartnerDetailData | null>(null)
  const [searching,  setSearching]  = useState(false)
  const [loading,    setLoading]    = useState(false)
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced search → autocomplete options
  const handleSearch = useCallback((val: string) => {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!val.trim()) { setOptions([]); return }
    setSearching(true)
    debounceRef.current = setTimeout(() => {
      partnerApi.searchPartners(val)
        .then((r) => {
          const items = (r.data as unknown) as PartnerListItem[]
          setOptions(items.map((p) => ({
            value: p.name,
            id: p.id,
            label: (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#E8ECF3', fontSize: 13 }}>{p.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: '#9CA3B4' }}>{p.region}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: scoreColor(p.total_score) }}>
                    {p.total_score.toFixed(1)}
                  </span>
                </div>
              </div>
            ),
          })))
        })
        .finally(() => setSearching(false))
    }, 280)
  }, [])

  // Partner selected from autocomplete
  const handleSelect = useCallback((_name: string, opt: { id: string }) => {
    setSelectedId(opt.id)
  }, [])

  // Load full detail when a partner is selected
  useEffect(() => {
    if (!selectedId) return
    setLoading(true)
    setDetail(null)
    partnerApi.getPartnerDetail(selectedId)
      .then((r) => setDetail((r.data as unknown) as PartnerDetailData))
      .finally(() => setLoading(false))
  }, [selectedId])

  const radarData = detail
    ? Object.entries(detail.radar).map(([key, score]) => ({ dimension: DIM_LABELS[key] ?? key, score }))
    : []

  return (
    <div style={{ minHeight: '100vh', padding: '72px 24px 40px', boxSizing: 'border-box' }}>

      {/* ── Search bar ── */}
      <div style={{ maxWidth: 620, margin: '0 auto 28px' }}>
        <AutoComplete
          value={query}
          options={options}
          onSearch={handleSearch}
          onSelect={handleSelect}
          style={{ width: '100%' }}
          dropdownStyle={{
            background: '#1A1D2E',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12,
          }}
        >
          <Input
            prefix={searching
              ? <Spin size="small" />
              : <SearchOutlined style={{ color: '#5F6B7A' }} />
            }
            placeholder="搜索伙伴名称…"
            size="large"
            allowClear
            onChange={(e) => { if (!e.target.value) { setOptions([]); setSelectedId(null); setDetail(null); setQuery('') } }}
            style={{
              background: 'rgba(26,29,46,0.8)',
              border: '1px solid rgba(108,92,231,0.35)',
              borderRadius: 12,
              color: '#E8ECF3',
              fontSize: 15,
            }}
          />
        </AutoComplete>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 100 }}>
          <Spin size="large" />
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !detail && <EmptyState />}

      {/* ── Partner profile ── */}
      {!loading && detail && (
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 14 }}>

          {/* Row 1: hero card, full width */}
          <HeroCard data={detail} />

          {/* Row 2 left: radar */}
          <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <RadarChart data={radarData} height={290} title="五维评分" />
          </Card>

          {/* Row 2 right: dimension breakdowns */}
          <DimCards dimensions={detail.dimensions} />

          {/* Row 3: history trend, full width */}
          {detail.monthly_trend.length > 0 && <HistoryCard data={detail} />}
        </div>
      )}
    </div>
  )
}
