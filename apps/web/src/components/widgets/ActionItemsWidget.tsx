import type { WidgetData } from '../../types/template'

interface ActionItemsWidgetProps {
  config: Record<string, unknown>
  data: WidgetData
}

type Priority = 'high' | 'medium' | 'low'

const PRIORITY_COLORS: Record<Priority, string> = {
  high:   '#FF4757',
  medium: '#FFB946',
  low:    '#00C48C',
}

const PRIORITY_LABELS: Record<Priority, string> = {
  high:   '紧急',
  medium: '中',
  low:    '低',
}

function normalizePriority(v: unknown): Priority {
  const s = String(v ?? '').toLowerCase()
  if (s === 'high'   || s === '高' || s === '紧急' || s === '3') return 'high'
  if (s === 'medium' || s === '中' || s === '2')                  return 'medium'
  return 'low'
}

export default function ActionItemsWidget({ config, data }: ActionItemsWidgetProps) {
  const columns      = data.columns ?? []
  const rows         = data.rows    ?? []
  const titleField   = typeof config.title_field    === 'string' ? config.title_field    : ''
  const priorityField = typeof config.priority_field === 'string' ? config.priority_field : ''

  const titleIdx    = titleField    ? columns.indexOf(titleField)    : -1
  const priorityIdx = priorityField ? columns.indexOf(priorityField) : -1

  const resolvedTitleIdx    = titleIdx    >= 0 ? titleIdx    : 0
  const resolvedPriorityIdx = priorityIdx >= 0 ? priorityIdx : (columns.length >= 2 ? 1 : -1)

  if (!rows.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9CA3B4', fontSize: 13 }}>
        暂无待办
      </div>
    )
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {rows.map((row, i) => {
        const title    = String(row[resolvedTitleIdx] ?? '')
        const pri      = resolvedPriorityIdx >= 0 ? normalizePriority(row[resolvedPriorityIdx]) : 'low'
        const color    = PRIORITY_COLORS[pri]
        const priLabel = PRIORITY_LABELS[pri]

        return (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 4px',
              borderRadius: 6,
              transition: 'background 0.15s',
            }}
          >
            <span
              style={{
                flexShrink: 0,
                fontSize: 14,
                color: '#5F6B7A',
                lineHeight: 1,
                userSelect: 'none',
              }}
            >
              ☐
            </span>
            <span
              style={{
                flex: 1,
                fontSize: 13,
                color: '#E8ECF3',
                lineHeight: 1.4,
                wordBreak: 'break-all',
              }}
            >
              {title}
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
              {priLabel}
            </span>
          </div>
        )
      })}
    </div>
  )
}
