import type { WidgetConfig, WidgetData } from '../../types/template'
import WidgetCard from './WidgetCard'
import KpiWidget from './KpiWidget'
import LineChartWidget from './LineChartWidget'
import BarChartWidget from './BarChartWidget'
import PieChartWidget from './PieChartWidget'
import RadarChartWidget from './RadarChartWidget'
import RankingTableWidget from './RankingTableWidget'
import AlertListWidget from './AlertListWidget'
import ActionItemsWidget from './ActionItemsWidget'

export {
  WidgetCard,
  KpiWidget,
  LineChartWidget,
  BarChartWidget,
  PieChartWidget,
  RadarChartWidget,
  RankingTableWidget,
  AlertListWidget,
  ActionItemsWidget,
}

export function WidgetRenderer({
  widget,
  data,
  loading,
}: {
  widget: WidgetConfig
  data?: WidgetData
  loading?: boolean
}) {
  const error = data?.error
  return (
    <WidgetCard title={widget.title} type={widget.type} loading={loading} error={error}>
      {renderInner(widget, data)}
    </WidgetCard>
  )
}

function renderInner(widget: WidgetConfig, data?: WidgetData) {
  if (!data) return null

  switch (widget.type) {
    case 'kpi_card':
      return <KpiWidget config={widget.config} data={data} />

    case 'line_chart':
      return <LineChartWidget config={widget.config} data={data} />

    case 'bar_chart':
      return <BarChartWidget config={widget.config} data={data} />

    case 'pie_chart':
      return <PieChartWidget config={widget.config} data={data} />

    case 'radar_chart':
      return <RadarChartWidget config={widget.config} data={data} />

    case 'ranking_table':
      return <RankingTableWidget config={widget.config} data={data} />

    case 'alert_list':
      return <AlertListWidget config={widget.config} data={data} />

    case 'action_items':
      return <ActionItemsWidget config={widget.config} data={data} />

    default:
      return (
        <div style={{ color: '#5F6B7A', fontSize: 13, padding: 16 }}>
          未知组件类型: {widget.type}
        </div>
      )
  }
}
