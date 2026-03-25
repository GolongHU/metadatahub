import { useEffect, useState } from 'react'
import { Spin } from 'antd'
import TierBadge from '../../components/partner/TierBadge'
import { partnerApi } from '../../services/partnerApi'
import type { ManagerDashboardData, PartnerHealthCard, DimScore } from '../../types/partner'

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

// ── Score → color helper ──────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 8.5) return TIER_COLORS.strategic
  if (score >= 7.0) return TIER_COLORS.core
  if (score >= 5.0) return TIER_COLORS.growth
  if (score >= 3.5) return TIER_COLORS.observation
  return TIER_COLORS.risk
}

// ── Mini progress bar ─────────────────────────────────────────────────────────

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div
      style={{
        flex: 1,
        height: 6,
        borderRadius: 3,
        background: 'rgba(255,255,255,0.07)',
        overflow: 'hidden',
        margin: '0 8px',
      }}
    >
      <div
        style={{
          width: `${(score / 10) * 100}%`,
          height: '100%',
          borderRadius: 3,
          background: color,
          transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
        }}
      />
    </div>
  )
}

// ── Partner health card ───────────────────────────────────────────────────────

function PartnerCard({ card }: { card: PartnerHealthCard }) {
  const tierColor = TIER_COLORS[card.tier] ?? '#9CA3B4'
  const topMetrics = card.key_metrics.slice(0, 4)

  return (
    <div
      style={{
        background: 'rgba(26,29,46,0.4)',
        border: '1px solid rgba(162,155,254,0.06)',
        borderRadius: 18,
        padding: 20,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#E8ECF3', flex: 1, minWidth: 0 }}>
          {card.name}
        </span>
        <TierBadge tier={card.tier} />
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: tierColor,
            background: `${tierColor}20`,
            border: `1px solid ${tierColor}44`,
            borderRadius: 6,
            padding: '3px 10px',
            whiteSpace: 'nowrap',
          }}
        >
          {card.total_score.toFixed(1)}
        </span>
      </div>

      {/* 5-dimension score bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(card.dimensions ?? []).map((dim: DimScore) => {
          const color = scoreColor(dim.score)
          const label = DIM_LABELS[dim.dimension] ?? dim.dimension
          return (
            <div key={dim.dimension} style={{ display: 'flex', alignItems: 'center' }}>
              <span
                style={{
                  width: 80,
                  fontSize: 11,
                  color: '#9CA3B4',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {label}
              </span>
              <ScoreBar score={dim.score} color={color} />
              <span style={{ fontSize: 12, fontWeight: 600, color, minWidth: 28, textAlign: 'right' }}>
                {dim.score.toFixed(1)}
              </span>
            </div>
          )
        })}
      </div>

      {/* Key metrics grid */}
      {topMetrics.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px 12px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            paddingTop: 12,
          }}
        >
          {topMetrics.map((m, i) => (
            <div key={i} style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  color: '#9CA3B4',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  marginBottom: 2,
                }}
              >
                {m.metric_name}
              </div>
              <div style={{ fontSize: 13, color: '#E8ECF3', fontWeight: 600 }}>
                {m.value}
                {m.unit && (
                  <span style={{ fontSize: 11, color: '#9CA3B4', marginLeft: 2 }}>{m.unit}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Alerts */}
      {card.alerts.length > 0 && (
        <div
          style={{
            borderLeft: '3px solid #FF4757',
            background: 'rgba(255,71,87,0.10)',
            borderRadius: '0 8px 8px 0',
            padding: '8px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {card.alerts.map((alert, i) => (
            <span key={i} style={{ fontSize: 11, color: '#FF6B78' }}>
              ⚠ {alert}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PartnerManagerDashboard() {
  const [data, setData] = useState<ManagerDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    partnerApi
      .getManagerDashboard()
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
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        boxSizing: 'border-box',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: '#E8ECF3', letterSpacing: '-0.5px' }}>
              {data.manager_name}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#6C5CE7',
                background: 'rgba(108,92,231,0.18)',
                border: '1px solid rgba(108,92,231,0.35)',
                borderRadius: 6,
                padding: '3px 10px',
              }}
            >
              {data.region} 区域
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: '#5F6B7A' }}>
            负责 {data.partners.length} 个合作伙伴 · {data.region} 区域
          </p>
        </div>
      </div>

      {/* Cards grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 20,
          flex: 1,
        }}
      >
        {data.partners.map((card) => (
          <PartnerCard key={card.partner_id} card={card} />
        ))}
      </div>

      {/* Bottom bar */}
      <div
        style={{
          borderTop: '1px solid rgba(255,255,255,0.05)',
          paddingTop: 12,
          fontSize: 11,
          color: '#3A3F55',
          textAlign: 'right',
        }}
      >
        Updated just now
      </div>
    </div>
  )
}
