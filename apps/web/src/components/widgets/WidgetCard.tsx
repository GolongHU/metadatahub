import type { CSSProperties, ReactNode } from 'react'
import { Spin } from 'antd'

interface WidgetCardProps {
  title: string
  type?: string
  children: ReactNode
  loading?: boolean
  error?: string
  style?: CSSProperties
}

// Category → subtle color for type pill
const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  kpi_card:      { bg: 'rgba(162,155,254,0.08)', text: '#A29BFE' },
  line_chart:    { bg: 'rgba(59,130,246,0.08)',  text: '#60A5FA' },
  bar_chart:     { bg: 'rgba(59,130,246,0.08)',  text: '#60A5FA' },
  pie_chart:     { bg: 'rgba(59,130,246,0.08)',  text: '#60A5FA' },
  radar_chart:   { bg: 'rgba(59,130,246,0.08)',  text: '#60A5FA' },
  ranking_table: { bg: 'rgba(0,200,140,0.08)',   text: '#00E6A0' },
  alert_list:    { bg: 'rgba(255,185,70,0.08)',  text: '#FFD166' },
  action_items:  { bg: 'rgba(255,185,70,0.08)',  text: '#FFD166' },
}

const TYPE_LABELS: Record<string, string> = {
  kpi_card:      'KPI',
  line_chart:    '折线',
  bar_chart:     '柱状',
  pie_chart:     '饼图',
  radar_chart:   '雷达',
  ranking_table: '排行',
  alert_list:    '预警',
  action_items:  '待办',
}

export default function WidgetCard({ title, type, children, loading, error, style }: WidgetCardProps) {
  const typePill = type ? (TYPE_COLORS[type] ?? { bg: 'rgba(162,155,254,0.08)', text: '#A29BFE' }) : null
  const typeLabel = type ? (TYPE_LABELS[type] ?? type) : null

  return (
    <div
      style={{
        background: 'rgba(26,29,46,0.4)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(162,155,254,0.06)',
        borderRadius: 18,
        boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          padding: '12px 16px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#E8ECF3',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>
        {typePill && typeLabel && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: typePill.text,
              background: typePill.bg,
              borderRadius: 6,
              padding: '3px 8px',
              flexShrink: 0,
              lineHeight: '14px',
            }}
          >
            {typeLabel}
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', padding: '0 16px 16px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 60 }}>
            <Spin />
          </div>
        ) : error ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 120, gap: 8 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5F6B7A" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <circle cx="12" cy="16" r="0.5" fill="#5F6B7A"/>
            </svg>
            <span style={{ fontSize: 12, color: '#5F6B7A' }}>数据加载异常</span>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}
