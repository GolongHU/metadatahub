import ReactECharts from 'echarts-for-react'
import type { WidgetData } from '../../types/template'
import '../../styles/chartTheme'
import { useThemeStore } from '../../stores/themeStore'

interface RadarChartWidgetProps {
  config: Record<string, unknown>
  data: WidgetData
}

function toNum(v: unknown): number {
  if (typeof v === 'number') return v
  const n = parseFloat(String(v))
  return isNaN(n) ? 0 : n
}

function tokens(isDark: boolean) {
  return {
    tooltipBg:     isDark ? '#1A1D2E' : '#FFFFFF',
    tooltipBorder: isDark ? '#2D3142' : '#E8ECF3',
    tooltipText:   isDark ? '#E8ECF3' : '#2D3142',
    tooltipShadow: isDark
      ? 'box-shadow:0 4px 16px rgba(0,0,0,0.4);border-radius:8px;padding:12px 16px;'
      : 'box-shadow:0 4px 12px rgba(0,0,0,0.08);border-radius:8px;padding:12px 16px;',
    radarLine:  isDark ? '#2D3142' : '#E8ECF3',
    axisLabel:  isDark ? '#5F6B7A' : '#9CA3B4',
    legendText: isDark ? '#9CA3B4' : '#9CA3B4',
  }
}

export default function RadarChartWidget({ config, data }: RadarChartWidgetProps) {
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const t      = tokens(isDark)

  const columns   = data.columns ?? []
  const rows      = data.rows    ?? []
  const maxValue  = typeof config.max_value === 'number' ? config.max_value : 10
  const dimensions = Array.isArray(config.dimensions)
    ? (config.dimensions as string[])
    : columns.length >= 2
      // If no explicit dimensions, derive from unique values in first column
      ? Array.from(new Set(rows.map((r) => String(r[0] ?? ''))))
      : []

  if (!dimensions.length || !rows.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9CA3B4', fontSize: 13 }}>
        暂无数据
      </div>
    )
  }

  // Build a map from dimension name → score
  // Each row: [dimension, score]
  const dimIdx   = 0
  const scoreIdx = columns.length >= 2 ? 1 : 1

  const scoreMap: Record<string, number> = {}
  for (const row of rows) {
    const dim   = String(row[dimIdx] ?? '')
    const score = toNum(row[scoreIdx])
    scoreMap[dim] = score
  }

  const indicator = dimensions.map((dim) => ({
    name: dim,
    max: maxValue,
  }))

  const seriesValues = dimensions.map((dim) => scoreMap[dim] ?? 0)

  const option = {
    tooltip: {
      trigger: 'item',
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      borderWidth: 1,
      textStyle: { color: t.tooltipText, fontSize: 13 },
      extraCssText: t.tooltipShadow,
    },
    radar: {
      indicator,
      radius: '65%',
      axisName: {
        color: t.axisLabel,
        fontSize: 12,
      },
      splitLine: {
        lineStyle: { color: t.radarLine },
      },
      splitArea: {
        areaStyle: {
          color: isDark
            ? ['rgba(162,155,254,0.02)', 'rgba(162,155,254,0.05)']
            : ['rgba(108,92,231,0.02)', 'rgba(108,92,231,0.05)'],
        },
      },
      axisLine: {
        lineStyle: { color: t.radarLine },
      },
    },
    series: [
      {
        type: 'radar',
        data: [
          {
            value: seriesValues,
            name: typeof config.series_name === 'string' ? config.series_name : '数据',
            lineStyle: { color: '#6C5CE7', width: 2 },
            itemStyle: { color: '#6C5CE7' },
            areaStyle: { color: 'rgba(108,92,231,0.15)' },
          },
        ],
      },
    ],
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
