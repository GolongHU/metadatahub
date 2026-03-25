import React from 'react'

interface TierMeta {
  color: string
  label: string
}

const TIER_META: Record<string, TierMeta> = {
  strategic:   { color: '#6C5CE7', label: '战略伙伴' },
  core:        { color: '#3B82F6', label: '核心伙伴' },
  growth:      { color: '#00C48C', label: '成长伙伴' },
  observation: { color: '#FFB946', label: '观察伙伴' },
  risk:        { color: '#FF4757', label: '风险伙伴' },
}

interface TierBadgeProps {
  tier: string
  size?: 'small' | 'default' | 'large'
}

const TierBadge: React.FC<TierBadgeProps> = ({ tier, size = 'default' }) => {
  const meta = TIER_META[tier] ?? { color: '#9CA3B4', label: tier }
  const isSmall = size === 'small'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      padding: isSmall ? '2px 8px' : '3px 12px',
      borderRadius: 999,
      backgroundColor: `${meta.color}33`,
      color: meta.color,
      fontSize: isSmall ? 11 : 12,
      fontWeight: 600,
      letterSpacing: '0.02em',
      whiteSpace: 'nowrap',
      lineHeight: 1.5,
      border: `1px solid ${meta.color}4D`,
    }}>
      {meta.label}
    </span>
  )
}

export default TierBadge
