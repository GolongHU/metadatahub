import { useEffect, useState } from 'react'
import { Spin } from 'antd'
import ReactECharts from 'echarts-for-react'
import TierBadge from '../../components/partner/TierBadge'
import RadarChart from '../../components/partner/RadarChart'
import { partnerApi } from '../../services/partnerApi'
import type { SelfDashboardData, DimScore } from '../../types/partner'

// ── Constants ─────────────────────────────────────────────────────────────────

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

const TIER_THRESHOLDS: Record<string, [number, number]> = {
  strategic: [8.5, 10],
  core: [7.0, 8.5],
  growth: [5.0, 7.0],
  observation: [3.5, 5.0],
  risk: [0, 3.5],
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 8.5) return TIER_COLORS.strategic
  if (score >= 7.0) return TIER_COLORS.core
  if (score >= 5.0) return TIER_COLORS.growth
  if (score >= 3.5) return TIER_COLORS.observation
  return TIER_COLORS.risk
}

function changeIndicator(change: number): { symbol: string; color: string } {
  if (change > 0.05) return { symbol: '▲', color: '#00C48C' }
  if (change < -0.05) return { symbol: '▼', color: '#FF4757' }
  return { symbol: '→', color: '#9CA3B4' }
}

// ── Mini progress bar ─────────────────────────────────────────────────────────

function ProgressBar({
  pct,
  color,
  height = 8,
}: {
  pct: number
  color: string
  height?: number
}) {
  return (
    <div
      style={{
        width: '100%',
        height,
        borderRadius: height / 2,
        background: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${Math.min(100, Math.max(0, pct))}%`,
          height: '100%',
          borderRadius: height / 2,
          background: color,
          transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)',
        }}
      />
    </div>
  )
}

// ── Card wrapper ──────────────────────────────────────────────────────────────

function Card({
  children,
  style,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div
      style={{
        background: 'rgba(26,29,46,0.4)',
        border: '1px solid rgba(162,155,254,0.06)',
        borderRadius: 18,
        padding: 20,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ── Row 1: Score overview ─────────────────────────────────────────────────────

function ScoreOverviewCard({ data }: { data: SelfDashboardData }) {
  const tierColor = TIER_COLORS[data.tier] ?? '#9CA3B4'

  return (
    <div
      style={{
        gridColumn: '1 / -1',
        background:
          'linear-gradient(135deg, rgba(108,92,231,0.15) 0%, rgba(26,29,46,0.9) 100%)',
        border: '1px solid rgba(108,92,231,0.3)',
        borderRadius: 20,
        padding: 28,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        display: 'flex',
        alignItems: 'center',
        gap: 32,
        flexWrap: 'wrap',
        boxSizing: 'border-box',
      }}
    >
      {/* Left: identity */}
      <div style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <TierBadge tier={data.tier} />
        <div style={{ fontSize: 24, fontWeight: 700, color: '#E8ECF3', letterSpacing: '-0.5px', marginTop: 4 }}>
          {data.partner_name}
        </div>
        <div style={{ fontSize: 13, color: '#9CA3B4' }}>综合贡献度得分</div>
      </div>

      {/* Center: score + progress */}
      <div
        style={{
          flex: 1,
          minWidth: 180,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span
            style={{
              fontSize: 56,
              fontWeight: 800,
              color: tierColor,
              lineHeight: 1,
              letterSpacing: '-2px',
            }}
          >
            {data.total_score.toFixed(1)}
          </span>
          <span style={{ fontSize: 24, color: '#5F6B7A', fontWeight: 400 }}>/</span>
          <span style={{ fontSize: 24, color: '#5F6B7A', fontWeight: 400 }}>10</span>
        </div>

        <TierBadge tier={data.tier} />

        {data.score_to_next !== undefined && data.next_tier && (
          <div style={{ fontSize: 12, color: '#9CA3B4', textAlign: 'center' }}>
            距离下一层级 ({data.next_tier}) 还需{' '}
            <span style={{ color: tierColor, fontWeight: 600 }}>
              +{(data.score_to_next ?? 0).toFixed(1)}
            </span>{' '}
            分
          </div>
        )}

        <div style={{ width: '100%', maxWidth: 240 }}>
          <ProgressBar pct={data.progress_pct} color={tierColor} height={12} />
        </div>
      </div>

      {/* Right: ranking */}
      <div
        style={{
          flex: 1,
          minWidth: 140,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 4,
        }}
      >
        <div style={{ fontSize: 12, color: '#9CA3B4' }}>全网排名</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontSize: 13, color: '#9CA3B4' }}>第</span>
          <span
            style={{
              fontSize: 36,
              fontWeight: 800,
              color: '#E8ECF3',
              letterSpacing: '-1px',
              lineHeight: 1,
            }}
          >
            {data.global_rank}
          </span>
          <span style={{ fontSize: 13, color: '#9CA3B4' }}>名</span>
        </div>
        <div style={{ fontSize: 12, color: '#5F6B7A' }}>/ {data.total_partners} 个伙伴</div>
        <div style={{ fontSize: 11, color: '#5F6B7A', marginTop: 4 }}>本期更新: 2025-03</div>
      </div>
    </div>
  )
}

// ── Row 2 left: Radar chart wrapper ──────────────────────────────────────────

function RadarSection({ data }: { data: SelfDashboardData }) {
  const radarData = data.dimensions.map((d: DimScore) => ({
    dimension: DIM_LABELS[d.dimension] ?? d.dimension,
    score: d.score,
  }))

  // Build global-avg compare data from percentile as a proxy (rough)
  const compareData = data.dimensions.map((d: DimScore) => ({
    dimension: DIM_LABELS[d.dimension] ?? d.dimension,
    // percentile 50 ≈ avg score 5; scale linearly
    score: parseFloat(((d.percentile / 100) * 10 * 0.65 + 2).toFixed(1)),
  }))

  return (
    <Card style={{ gridColumn: '1 / 2', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <RadarChart data={radarData} compareData={compareData} title="五维评分" height={280} />
    </Card>
  )
}

// ── Row 2 right: Dimension detail list ───────────────────────────────────────

function DimDetailSection({ data }: { data: SelfDashboardData }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  function toggleDim(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <Card style={{ gridColumn: '2 / -1', overflowY: 'auto' }}>
      {data.dimensions.map((dim: DimScore, idx: number) => {
        const label = DIM_LABELS[dim.dimension] ?? dim.dimension
        const color = scoreColor(dim.score)
        const { symbol, color: changeColor } = changeIndicator(dim.change)
        const isLast = idx === data.dimensions.length - 1
        const isOpen = !!expanded[dim.dimension]
        const visibleMetrics = dim.metrics.filter((m) => m.visible)

        return (
          <div
            key={dim.dimension}
            style={{
              marginBottom: isLast ? 0 : 16,
              paddingBottom: isLast ? 0 : 16,
              borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.05)',
            }}
          >
            {/* Row 1: label + score + change */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 4,
                cursor: visibleMetrics.length > 0 ? 'pointer' : 'default',
              }}
              onClick={() => visibleMetrics.length > 0 && toggleDim(dim.dimension)}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: '#E8ECF3', flex: 1 }}>
                {label}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color,
                  background: `${color}20`,
                  border: `1px solid ${color}44`,
                  borderRadius: 5,
                  padding: '2px 8px',
                  whiteSpace: 'nowrap',
                }}
              >
                {dim.score.toFixed(1)}
              </span>
              <span style={{ fontSize: 11, color: changeColor, fontWeight: 600, minWidth: 28, textAlign: 'right' }}>
                {symbol} {Math.abs(dim.change).toFixed(1)}
              </span>
              {visibleMetrics.length > 0 && (
                <span style={{ fontSize: 11, color: '#5F6B7A', marginLeft: 2 }}>
                  {isOpen ? '▲' : '▼'}
                </span>
              )}
            </div>

            {/* Row 2: percentile */}
            <div style={{ fontSize: 11, color: '#9CA3B4', marginBottom: 6 }}>
              你超过了 {dim.percentile}% 的伙伴
            </div>

            {/* Row 3: progress bar */}
            <ProgressBar pct={(dim.score / 10) * 100} color={color} height={8} />

            {/* Expandable metrics */}
            {isOpen && visibleMetrics.length > 0 && (
              <div
                style={{
                  marginTop: 10,
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '6px 12px',
                }}
              >
                {visibleMetrics.map((m, mi) => {
                  const { symbol: ts, color: tc } = changeIndicator(
                    m.trend === 'up' ? 1 : m.trend === 'down' ? -1 : 0
                  )
                  return (
                    <div
                      key={mi}
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: 6,
                        padding: '6px 8px',
                      }}
                    >
                      <div style={{ fontSize: 10, color: '#9CA3B4', marginBottom: 2 }}>{m.name}</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                        <span style={{ fontSize: 13, color: '#E8ECF3', fontWeight: 600 }}>
                          {m.value}
                        </span>
                        {m.unit && (
                          <span style={{ fontSize: 10, color: '#9CA3B4' }}>{m.unit}</span>
                        )}
                        <span style={{ fontSize: 11, color: tc, marginLeft: 'auto' }}>{ts}</span>
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

// ── Row 3 left: Historical trend chart ───────────────────────────────────────

function HistoryChartSection({ data }: { data: SelfDashboardData }) {
  const periods = data.monthly_trend.map((h: any) => h.period)
  const scores = data.monthly_trend.map((h: any) => h.score)

  const markAreas = [
    { name: '战略伙伴', range: TIER_THRESHOLDS.strategic, color: 'rgba(108,92,231,0.07)' },
    { name: '核心伙伴', range: TIER_THRESHOLDS.core, color: 'rgba(59,130,246,0.07)' },
    { name: '成长伙伴', range: TIER_THRESHOLDS.growth, color: 'rgba(0,196,140,0.07)' },
    { name: '观察伙伴', range: TIER_THRESHOLDS.observation, color: 'rgba(255,185,70,0.07)' },
    { name: '风险伙伴', range: TIER_THRESHOLDS.risk, color: 'rgba(255,71,87,0.07)' },
  ]

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1A1D2E',
      borderColor: '#2D3142',
      borderWidth: 1,
      textStyle: { color: '#E8ECF3', fontSize: 12 },
      extraCssText:
        'box-shadow:0 4px 16px rgba(0,0,0,0.4);border-radius:8px;padding:10px 14px;',
      formatter: (params: { axisValue: string; value: number }[]) => {
        const p = params[0]
        return `${p.axisValue}: ${p.value?.toFixed(2)}`
      },
    },
    grid: { left: 48, right: 16, top: 20, bottom: 32, containLabel: false },
    xAxis: {
      type: 'category',
      data: periods,
      axisLine: { lineStyle: { color: '#2D3142' } },
      axisTick: { show: false },
      axisLabel: { color: '#5F6B7A', fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 10,
      interval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: '#5F6B7A',
        fontSize: 10,
        formatter: (v: number) => {
          if (v === 8.5) return '8.5'
          if (v === 7) return '7.0'
          if (v === 5) return '5.0'
          if (v === 3.5) return '3.5'
          return String(v)
        },
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(162,155,254,0.05)',
          type: 'dashed',
        },
      },
    },
    series: [
      {
        type: 'line',
        data: scores,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#FFB946', width: 2.5 },
        itemStyle: { color: '#FFB946' },
        areaStyle: { color: 'rgba(255,185,70,0.10)' },
        markArea: {
          silent: true,
          data: markAreas.map((ma) => [
            {
              yAxis: ma.range[0],
              itemStyle: { color: ma.color },
              label: {
                show: false,
              },
            },
            { yAxis: ma.range[1] },
          ]),
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { type: 'dashed', width: 1 },
          data: [
            { yAxis: 8.5, lineStyle: { color: 'rgba(108,92,231,0.35)' } },
            { yAxis: 7.0, lineStyle: { color: 'rgba(59,130,246,0.35)' } },
            { yAxis: 5.0, lineStyle: { color: 'rgba(0,196,140,0.35)' } },
            { yAxis: 3.5, lineStyle: { color: 'rgba(255,185,70,0.35)' } },
          ],
        },
      },
    ],
  }

  return (
    <Card style={{ gridColumn: '1 / 3', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#9CA3B4', marginBottom: 4 }}>
        历史趋势（近12期）
      </div>
      <ReactECharts
        option={option}
        style={{ height: 200 }}
        opts={{ renderer: 'svg' }}
        notMerge
      />
    </Card>
  )
}

// ── Row 3 right: Improvement suggestions ─────────────────────────────────────

function SuggestionsCard({ data }: { data: SelfDashboardData }) {
  const top3 = data.suggestions.slice(0, 3)

  return (
    <Card style={{ gridColumn: '3', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#E8ECF3', marginBottom: 8 }}>
        💡 提升建议
      </div>

      {top3.length === 0 ? (
        <div style={{ fontSize: 13, color: '#9CA3B4', textAlign: 'center', paddingTop: 16 }}>
          🎉 表现优秀，继续保持！
        </div>
      ) : (
        top3.map((s, idx) => {
          const isLast = idx === top3.length - 1
          return (
            <div
              key={idx}
              style={{
                marginBottom: isLast ? 0 : 16,
                paddingBottom: isLast ? 0 : 16,
                borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.05)',
              }}
            >
              {/* Icon + title */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 18, lineHeight: 1 }}>{s.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#E8ECF3' }}>{s.title}</span>
              </div>
              {/* Current */}
              <div style={{ fontSize: 11, color: '#9CA3B4', marginBottom: 3 }}>
                当前: {s.current_value}
              </div>
              {/* Target */}
              <div style={{ fontSize: 11, color: '#3B82F6', marginBottom: 3 }}>
                目标: {s.target_value}
              </div>
              {/* Expected gain */}
              <div style={{ fontSize: 11, color: '#00C48C' }}>
                预计提升: {s.expected_gain}
              </div>
            </div>
          )
        })
      )}
    </Card>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PartnerSelfDashboard() {
  const [data, setData] = useState<SelfDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    partnerApi
      .getSelfDashboard()
      .then((r) => setData(r.data))
      .catch(() => setError('数据加载失败，请稍后重试'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
        }}
      >
        <Spin size="large" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          color: '#FF4757',
          fontSize: 15,
        }}
      >
        {error ?? '暂无数据'}
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '72px 20px 20px',
        boxSizing: 'border-box',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'auto 1fr 1fr',
        gap: 16,
        alignContent: 'start',
      }}
    >
      {/* Row 1: full-width score overview */}
      <ScoreOverviewCard data={data} />

      {/* Row 2 left: radar */}
      <RadarSection data={data} />

      {/* Row 2 right: dimension details (spans 2 cols) */}
      <DimDetailSection data={data} />

      {/* Row 3 left: history trend (spans 2 cols) */}
      <HistoryChartSection data={data} />

      {/* Row 3 right: suggestions */}
      <SuggestionsCard data={data} />
    </div>
  )
}
