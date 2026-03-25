import { useEffect, useState } from 'react'
import { Drawer, Spin } from 'antd'
import ReactECharts from 'echarts-for-react'
import { partnerApi } from '../../services/partnerApi'
import type { PartnerDetailData, DimSection } from '../../types/partner'
import TierBadge from './TierBadge'
import RadarChart from './RadarChart'

// ── Constants ──────────────────────────────────────────────────────────────────

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

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  partnerId: string | null  // null = closed
  onClose: () => void
  currentUserRole: string   // for visibility filtering
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function scoreToTierColor(score: number): string {
  if (score >= 8.5) return TIER_COLORS.strategic
  if (score >= 7.0) return TIER_COLORS.core
  if (score >= 5.0) return TIER_COLORS.growth
  if (score >= 3.5) return TIER_COLORS.observation
  return TIER_COLORS.risk
}

function TrendArrow({ trend, changePct }: { trend: 'up' | 'down' | 'flat'; changePct?: number }) {
  if (trend === 'up') {
    return (
      <span style={{ color: '#00C48C', fontSize: 11, marginLeft: 2 }}>
        ▲{changePct !== undefined && Math.abs(changePct) > 1 ? ` (+${changePct.toFixed(1)}%)` : ''}
      </span>
    )
  }
  if (trend === 'down') {
    return (
      <span style={{ color: '#FF4757', fontSize: 11, marginLeft: 2 }}>
        ▼{changePct !== undefined && Math.abs(changePct) > 1 ? ` (${changePct.toFixed(1)}%)` : ''}
      </span>
    )
  }
  return <span style={{ color: '#5F6B7A', fontSize: 11, marginLeft: 2 }}>→</span>
}

// ── Dim section component ──────────────────────────────────────────────────────

function DimSectionCard({ section }: { section: DimSection }) {
  const dimColor = scoreToTierColor(section.score)
  const visibleMetrics = section.metrics

  return (
    <div style={{ marginBottom: 10 }}>
      {/* Dim header */}
      <div
        style={{
          background: 'rgba(108,92,231,0.08)',
          borderRadius: 8,
          padding: '8px 12px',
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ color: '#C4B5FD', fontSize: 12, fontWeight: 600 }}>
          {DIM_LABELS[section.dimension] ?? section.dimension}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: dimColor,
              background: `${dimColor}18`,
              borderRadius: 4,
              padding: '1px 7px',
              border: `1px solid ${dimColor}44`,
            }}
          >
            {section.score.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Metrics list */}
      {visibleMetrics.length > 0 && (
        <div style={{ paddingLeft: 4 }}>
          {visibleMetrics.map((metric, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 8px',
                borderRadius: 5,
                marginBottom: 2,
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLDivElement).style.background = 'transparent'
              }}
            >
              <span style={{ fontSize: 11, color: '#9CA3B4', flex: '0 0 auto', maxWidth: '55%' }}>
                {metric.name}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 13, color: '#E8ECF3', fontWeight: 500 }}>
                  {metric.value}
                  {metric.unit && (
                    <span style={{ fontSize: 10, color: '#7A8699', marginLeft: 2 }}>{metric.unit}</span>
                  )}
                </span>
                <TrendArrow trend={metric.trend as 'up' | 'down' | 'flat'} changePct={metric.change_pct} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Historical trend chart ─────────────────────────────────────────────────────

function HistoryTrendChart({ history }: { history: Array<{ period: string; score: number }> }) {
  const periods = history.map((h) => {
    const parts = h.period.split('-')
    return parts.length === 2 ? `${parts[1]}月` : h.period
  })
  const scores = history.map((h) => h.score)

  const option = {
    backgroundColor: 'transparent',
    grid: { top: 8, bottom: 20, left: 10, right: 10, containLabel: true },
    xAxis: {
      type: 'category',
      data: periods,
      axisLabel: { color: '#5F6B7A', fontSize: 10 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      show: false,
      min: (v: { min: number }) => Math.max(0, v.min - 1),
    },
    series: [
      {
        type: 'line',
        data: scores,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#6C5CE7', width: 2 },
        itemStyle: { color: '#6C5CE7' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(108,92,231,0.28)' },
              { offset: 1, color: 'rgba(108,92,231,0.01)' },
            ],
          },
        },
      },
    ],
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1A1D2E',
      borderColor: '#2D3142',
      borderWidth: 1,
      textStyle: { color: '#E8ECF3', fontSize: 11 },
    },
  }

  return <ReactECharts option={option} style={{ height: 120 }} opts={{ renderer: 'canvas' }} notMerge />
}

// ── Main Drawer ────────────────────────────────────────────────────────────────

export default function PartnerDetailDrawer({ partnerId, onClose }: Props) {
  const [data, setData] = useState<PartnerDetailData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!partnerId) return
    setLoading(true)
    setData(null)
    partnerApi
      .getPartnerDetail(partnerId)
      .then((r: any) => setData(r.data))
      .finally(() => setLoading(false))
  }, [partnerId])

  // Map radar data to dimension labels for RadarChart
  const radarData = data
    ? Object.entries(data.radar).map(([key, score]) => ({
        dimension: DIM_LABELS[key] ?? key,
        score,
      }))
    : []

  const tierColor = data ? (TIER_COLORS[data.tier] ?? '#9CA3B4') : '#9CA3B4'

  return (
    <Drawer
      open={partnerId !== null}
      onClose={onClose}
      width={480}
      closable
      bodyStyle={{ background: '#0a0c14', padding: 0 }}
      headerStyle={{
        background: '#0a0c14',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        color: '#E8ECF3',
      }}
      title={
        <span style={{ color: '#C4B5FD', fontSize: 13, fontWeight: 600, letterSpacing: '0.04em' }}>
          伙伴详情
        </span>
      }
    >
      {loading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 320,
          }}
        >
          <Spin size="large" />
        </div>
      )}

      {!loading && data && (
        <div
          style={{
            overflowY: 'auto',
            height: '100%',
            padding: 24,
            boxSizing: 'border-box',
          }}
        >
          {/* ── Section 1: Header ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#E8ECF3' }}>
                {data.partner_name}
              </span>
              <TierBadge tier={data.tier} size="large" />
            </div>

            {/* Info row */}
            <div style={{ fontSize: 12, color: '#9CA3B4' }}>
              {data.region} · 伙伴经理: {data.manager_name}
            </div>

            {/* Score row */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 32, fontWeight: 800, color: tierColor, lineHeight: 1 }}>
                {data.total_score.toFixed(1)}
              </span>
              <span style={{ fontSize: 14, color: '#5F6B7A' }}>/ 10</span>
              {data.score_change !== 0 && (
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: data.score_change > 0 ? '#00C48C' : '#FF4757',
                    marginLeft: 4,
                  }}
                >
                  {data.score_change > 0
                    ? `▲ +${data.score_change.toFixed(2)}`
                    : `▼ ${data.score_change.toFixed(2)}`}
                </span>
              )}
            </div>
          </div>

          {/* ── Section 2: Radar chart ── */}
          <div
            style={{
              background: 'rgba(26,29,46,0.6)',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.06)',
              marginBottom: 16,
              padding: '4px 0',
            }}
          >
            <RadarChart data={radarData} height={220} />
          </div>

          {/* ── Section 3: Dimension sections ── */}
          <div style={{ marginBottom: 20 }}>
            {data.dimensions.map((section) => (
              <DimSectionCard key={section.dimension} section={section} />
            ))}
          </div>

          {/* ── Section 4: Historical trend ── */}
          {data.monthly_trend.length > 0 && (
            <div>
              <div
                style={{
                  textAlign: 'center',
                  fontSize: 11,
                  color: '#5F6B7A',
                  letterSpacing: '0.08em',
                  marginBottom: 8,
                }}
              >
                ── 历史趋势 ──
              </div>
              <div
                style={{
                  background: 'rgba(26,29,46,0.6)',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.06)',
                  padding: '8px 4px 4px',
                }}
              >
                <HistoryTrendChart history={data.monthly_trend} />
              </div>
            </div>
          )}

          {/* Bottom spacer for scroll breathing room */}
          <div style={{ height: 32 }} />
        </div>
      )}

      {/* Empty state: no data but not loading */}
      {!loading && !data && partnerId && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 240,
            color: '#5F6B7A',
            fontSize: 13,
          }}
        >
          暂无数据
        </div>
      )}
    </Drawer>
  )
}
