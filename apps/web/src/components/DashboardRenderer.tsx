import type { TemplateConfigData, WidgetData } from '../types/template'
import { WidgetRenderer } from './widgets'

interface DashboardRendererProps {
  config: TemplateConfigData
  data: Record<string, WidgetData>
  loading?: boolean
}

export default function DashboardRenderer({ config, data, loading }: DashboardRendererProps) {
  const columns   = config.layout?.columns   ?? 6
  const rowHeight = config.layout?.row_height ?? 160

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: 12,
        padding: '16px 20px',
      }}
    >
      {config.widgets.map((widget) => (
        <div
          key={widget.id}
          style={{
            gridColumn: `${widget.position.col + 1} / span ${widget.position.col_span}`,
            gridRow: `${widget.position.row + 1} / span ${widget.position.row_span || 1}`,
            minHeight: (widget.position.row_span || 1) * rowHeight,
          }}
        >
          <WidgetRenderer
            widget={widget}
            data={data[widget.id]}
            loading={loading}
          />
        </div>
      ))}
    </div>
  )
}
