import type { WidgetData } from '../../types/template'

interface KpiWidgetProps {
  config: Record<string, unknown>
  data: WidgetData
}

function toNum(v: unknown): number {
  if (typeof v === 'number') return v
  const n = parseFloat(String(v))
  return isNaN(n) ? 0 : n
}

function formatValue(raw: unknown, format: unknown): string {
  if (raw === null || raw === undefined) return '--'
  const strRaw = String(raw)
  if (strRaw.trim() === '') return '--'

  if (format === 'currency') {
    const n = toNum(raw)
    if (isNaN(n)) return strRaw
    if (n >= 100_000_000) return '¥' + (n / 100_000_000).toFixed(2) + '亿'
    if (n >= 10_000) return '¥' + (n / 10_000).toFixed(0) + '万'
    return '¥' + n.toLocaleString()
  }

  if (format === 'percent') {
    const n = toNum(raw)
    if (isNaN(n)) return strRaw
    return n.toLocaleString() + '%'
  }

  // No format — try to pretty-print numbers
  const n = parseFloat(strRaw)
  if (!isNaN(n)) {
    if (n >= 100_000_000) return (n / 100_000_000).toFixed(2) + '亿'
    if (n >= 10_000) return (n / 10_000).toFixed(0) + '万'
    return n.toLocaleString()
  }

  return strRaw
}

export default function KpiWidget({ config, data }: KpiWidgetProps) {
  const rawValue = data.rows && data.rows.length > 0 ? data.rows[0][0] : undefined
  const displayValue = formatValue(rawValue, config.format)

  const prefix = typeof config.prefix === 'string' ? config.prefix : ''
  const suffix = typeof config.suffix === 'string' ? config.suffix : ''
  const label  = typeof config.label  === 'string' ? config.label  : ''

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 8,
        userSelect: 'none',
      }}
    >
      <div
        style={{
          fontSize: 36,
          fontWeight: 700,
          color: '#A29BFE',
          letterSpacing: '-1px',
          lineHeight: 1.1,
          display: 'flex',
          alignItems: 'baseline',
          gap: 2,
        }}
      >
        {prefix && (
          <span style={{ fontSize: 20, fontWeight: 500, color: '#9CA3B4' }}>{prefix}</span>
        )}
        <span>{displayValue}</span>
        {suffix && (
          <span style={{ fontSize: 20, fontWeight: 500, color: '#9CA3B4' }}>{suffix}</span>
        )}
      </div>

      {label && (
        <div
          style={{
            fontSize: 12,
            color: '#9CA3B4',
            letterSpacing: '0.02em',
            textAlign: 'center',
          }}
        >
          {label}
        </div>
      )}
    </div>
  )
}
