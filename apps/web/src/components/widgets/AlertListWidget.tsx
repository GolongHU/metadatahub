import type { WidgetData } from '../../types/template'

interface AlertListWidgetProps {
  config: Record<string, unknown>
  data: WidgetData
}

type Severity = 'high' | 'medium' | 'low'

const SEVERITY_COLORS: Record<Severity, string> = {
  high:   '#FF4757',
  medium: '#FFB946',
  low:    '#00C48C',
}

const SEVERITY_LABELS: Record<Severity, string> = {
  high:   '高',
  medium: '中',
  low:    '低',
}

function normalizeSeverity(v: unknown): Severity {
  const s = String(v ?? '').toLowerCase()
  if (s === 'high'   || s === '高' || s === '3') return 'high'
  if (s === 'medium' || s === '中' || s === '2') return 'medium'
  return 'low'
}

export default function AlertListWidget({ config, data }: AlertListWidgetProps) {
  const columns       = data.columns ?? []
  const rows          = data.rows    ?? []
  const maxItems      = typeof config.max_items === 'number' ? config.max_items : 8
  const severityField = typeof config.severity_field === 'string' ? config.severity_field : ''
  const messageField  = typeof config.message_field  === 'string' ? config.message_field  : ''

  const severityIdx = severityField ? columns.indexOf(severityField) : -1
  const messageIdx  = messageField  ? columns.indexOf(messageField)  : -1

  // Fallback: first column = message, second = severity (or vice versa)
  const resolvedMsgIdx      = messageIdx  >= 0 ? messageIdx  : 0
  const resolvedSeverityIdx = severityIdx >= 0 ? severityIdx : (columns.length >= 2 ? 1 : -1)

  const displayRows = rows.slice(0, maxItems)

  if (!displayRows.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9CA3B4', fontSize: 13 }}>
        暂无预警
      </div>
    )
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {displayRows.map((row, i) => {
        const message  = String(row[resolvedMsgIdx] ?? '')
        const sev      = resolvedSeverityIdx >= 0 ? normalizeSeverity(row[resolvedSeverityIdx]) : 'low'
        const color    = SEVERITY_COLORS[sev]
        const sevLabel = SEVERITY_LABELS[sev]

        return (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              borderLeft: `3px solid ${color}`,
              paddingLeft: 10,
              paddingTop: 6,
              paddingBottom: 6,
              paddingRight: 6,
              background: color + '0A',
              borderRadius: '0 6px 6px 0',
            }}
          >
            <span
              style={{
                flex: 1,
                fontSize: 12,
                color: '#E8ECF3',
                lineHeight: 1.5,
                wordBreak: 'break-all',
              }}
            >
              {message}
            </span>
            <span
              style={{
                flexShrink: 0,
                fontSize: 10,
                color,
                background: color + '18',
                border: `1px solid ${color}33`,
                borderRadius: 4,
                padding: '1px 6px',
                lineHeight: '16px',
              }}
            >
              {sevLabel}
            </span>
          </div>
        )
      })}
    </div>
  )
}
