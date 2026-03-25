import React from 'react'

interface KPICardProps {
  label: string
  value: string | number
  trend?: number
  trendLabel?: string
  highlight?: boolean
  unit?: string
  subtext?: string
}

const KPICard: React.FC<KPICardProps> = ({ label, value, trend, trendLabel, highlight = false, unit, subtext }) => {
  const isRisk = highlight && typeof value === 'number' && value > 0
  const trendPositive = trend !== undefined && trend > 0
  const trendNegative = trend !== undefined && trend < 0
  const trendColor = trendPositive ? '#00C48C' : trendNegative ? '#FF4757' : '#9CA3B4'
  const arrowIcon = trendPositive ? '↑' : trendNegative ? '↓' : '→'

  return (
    <div style={{
      background: 'rgba(26,29,46,0.4)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(162,155,254,0.06)',
      borderRadius: 18,
      padding: '16px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <span style={{ fontSize: 11, color: '#5F6B7A', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
        {label}
      </span>
      <div style={{ fontSize: 28, fontWeight: 600, color: isRisk ? '#FF6B81' : '#E8ECF3', lineHeight: 1.2, display: 'flex', alignItems: 'baseline', gap: 4, fontVariantNumeric: 'tabular-nums' }}>
        <span>{value}</span>
        {unit && <span style={{ fontSize: 14, fontWeight: 500, color: isRisk ? '#FF6B81' : '#9CA3B4' }}>{unit}</span>}
      </div>
      {trend !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: trendColor, fontWeight: 500 }}>
          <span>{arrowIcon}</span>
          <span>{Math.abs(trend).toFixed(1)}%</span>
          {trendLabel && <span style={{ color: '#6B7280', fontWeight: 400 }}>{trendLabel}</span>}
        </div>
      )}
      {subtext && <span style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{subtext}</span>}
    </div>
  )
}

export default KPICard
