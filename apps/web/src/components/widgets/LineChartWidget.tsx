import ReactECharts from 'echarts-for-react'
import type { WidgetData } from '../../types/template'
import '../../styles/chartTheme'
import { useThemeStore } from '../../stores/themeStore'

interface LineChartWidgetProps {
  config: Record<string, unknown>
  data: WidgetData
}

function toNum(v: unknown): number {
  if (typeof v === 'number') return v
  const n = parseFloat(String(v))
  return isNaN(n) ? 0 : n
}

function yFormatter(v: number): string {
  if (v >= 100_000_000) return (v / 100_000_000).toFixed(1) + '亿'
  if (v >= 10_000) return (v / 10_000).toFixed(0) + '万'
  return String(v)
}

function tokens(isDark: boolean) {
  return {
    tooltipBg:     isDark ? '#1A1D2E' : '#FFFFFF',
    tooltipBorder: isDark ? '#2D3142' : '#E8ECF3',
    tooltipText:   isDark ? '#E8ECF3' : '#2D3142',
    tooltipShadow: isDark
      ? 'box-shadow:0 4px 16px rgba(0,0,0,0.4);border-radius:8px;padding:12px 16px;'
      : 'box-shadow:0 4px 12px rgba(0,0,0,0.08);border-radius:8px;padding:12px 16px;',
    axisLabel:  isDark ? '#5F6B7A' : '#9CA3B4',
    axisLine:   isDark ? '#2D3142' : '#E8ECF3',
    legendText: isDark ? '#9CA3B4' : '#9CA3B4',
  }
}

const COLORS = ['#6C5CE7', '#00C48C', '#FFB946', '#FF6B81', '#3B82F6', '#A29BFE']

export default function LineChartWidget({ config, data }: LineChartWidgetProps) {
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const t = tokens(isDark)

  const columns = data.columns ?? []
  const rows    = data.rows    ?? []

  const xField  = typeof config.x_field  === 'string' ? config.x_field  : columns[0] ?? ''
  const yFields = Array.isArray(config.y_fields)
    ? (config.y_fields as string[])
    : columns.slice(1)

  const xIdx = columns.indexOf(xField)
  const xData = rows.map((r) => String(xIdx >= 0 ? r[xIdx] ?? '' : r[0] ?? ''))

  const series = yFields.map((field, i) => {
    const colIdx = columns.indexOf(field)
    const values = rows.map((r) => toNum(colIdx >= 0 ? r[colIdx] : r[i + 1]))
    const color = COLORS[i % COLORS.length]
    return {
      name: field,
      type: 'line',
      data: values,
      smooth: true,
      lineStyle: { width: 2.5, color },
      itemStyle: { color },
      areaStyle: { opacity: isDark ? 0.10 : 0.06, color },
      symbol: rows.length > 20 ? 'none' : 'circle',
      symbolSize: rows.length > 20 ? 0 : 6,
      emphasis: { focus: 'series' },
    }
  })

  const hasLongLabels = xData.some((s) => s.length > 6)

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      borderWidth: 1,
      textStyle: { color: t.tooltipText, fontSize: 13 },
      extraCssText: t.tooltipShadow,
    },
    legend: yFields.length > 1
      ? {
          bottom: 0,
          textStyle: { color: t.legendText, fontSize: 12 },
          icon: 'circle',
          itemWidth: 8,
          itemHeight: 8,
          itemGap: 16,
        }
      : undefined,
    grid: {
      left: 56,
      right: 24,
      top: 24,
      bottom: hasLongLabels ? 60 : (yFields.length > 1 ? 44 : 24),
      containLabel: false,
    },
    xAxis: {
      type: 'category',
      data: xData,
      axisLine: { lineStyle: { color: t.axisLine } },
      axisTick: { show: false },
      axisLabel: {
        color: t.axisLabel,
        fontSize: 11,
        interval: 'auto',
        formatter: (val: string) => {
          const s = String(val)
          if (/^\d{8}$/.test(s)) return s.slice(2, 4) + '-' + s.slice(4, 6)
          if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(5, 10)
          return s.length > 8 ? s.slice(0, 8) + '…' : s
        },
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: t.axisLabel, fontSize: 12, formatter: yFormatter },
      splitLine: {
        lineStyle: {
          color: isDark ? 'rgba(162,155,254,0.04)' : 'rgba(0,0,0,0.04)',
          type: 'dashed',
        },
      },
    },
    series,
  }

  if (!columns.length || !rows.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9CA3B4', fontSize: 13 }}>
        暂无数据
      </div>
    )
  }

  return (
    <ReactECharts
      key={isDark ? 'dark' : 'light'}
      option={option}
      theme={isDark ? 'metadatahub-dark' : 'metadatahub'}
      style={{ height: '100%', minHeight: 160 }}
      opts={{ renderer: 'svg' }}
      notMerge
    />
  )
}
