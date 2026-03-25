import ReactECharts from 'echarts-for-react'
import type { WidgetData } from '../../types/template'
import '../../styles/chartTheme'
import { useThemeStore } from '../../stores/themeStore'

interface PieChartWidgetProps {
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
    legendText: isDark ? '#9CA3B4' : '#9CA3B4',
    pieLabel:   isDark ? '#9CA3B4' : '#5F6B7A',
    pieBorder:  isDark ? '#1A1D2E' : '#ffffff',
  }
}

const PIE_COLORS = ['#6C5CE7', '#00C48C', '#FFB946', '#FF6B81', '#3B82F6', '#A29BFE']

// Fixed color mapping for partner tier names (CN + EN)
const TIER_COLOR_MAP: Record<string, string> = {
  strategic:  '#6C5CE7', '战略伙伴': '#6C5CE7', '战略': '#6C5CE7',
  core:       '#3B82F6', '核心伙伴': '#3B82F6', '核心': '#3B82F6',
  growth:     '#00C48C', '成长伙伴': '#00C48C', '成长': '#00C48C',
  observation:'#FFB946', '观察伙伴': '#FFB946', '观察': '#FFB946',
  risk:       '#FF4757', '风险伙伴': '#FF4757', '风险': '#FF4757',
}

export default function PieChartWidget({ config, data }: PieChartWidgetProps) {
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const t      = tokens(isDark)

  const columns    = data.columns ?? []
  const rows       = data.rows    ?? []
  const isDonut    = Boolean(config.donut)
  const nameField  = typeof config.name_field  === 'string' ? config.name_field  : columns[0] ?? ''
  const valueField = typeof config.value_field === 'string' ? config.value_field : columns[1] ?? ''

  const nameIdx  = columns.indexOf(nameField)
  const valueIdx = columns.indexOf(valueField)

  if (!columns.length || !rows.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9CA3B4', fontSize: 13 }}>
        暂无数据
      </div>
    )
  }

  const pieData = rows.map((r, i) => {
    const name = String(nameIdx >= 0 ? r[nameIdx] ?? '' : r[0] ?? '')
    const color = TIER_COLOR_MAP[name] ?? PIE_COLORS[i % PIE_COLORS.length]
    return {
      name,
      value: toNum(valueIdx >= 0 ? r[valueIdx] : r[1]),
      itemStyle: { color, borderColor: t.pieBorder, borderWidth: 3 },
    }
  })

  const radius: [string, string] = isDonut ? ['45%', '72%'] : ['0%', '72%']

  const option = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      borderWidth: 1,
      textStyle: { color: t.tooltipText, fontSize: 13 },
      extraCssText: t.tooltipShadow,
    },
    legend: {
      orient: 'vertical',
      right: 0,
      top: 'center',
      textStyle: { color: t.legendText, fontSize: 12 },
      icon: 'circle',
      itemWidth: 8,
      itemHeight: 8,
      itemGap: 12,
    },
    series: [
      {
        type: 'pie',
        radius,
        center: ['38%', '50%'],
        data: pieData,
        label: { formatter: '{b}\n{d}%', fontSize: 12, color: t.pieLabel },
        emphasis: {
          itemStyle: { shadowBlur: 12, shadowOffsetX: 0, shadowColor: 'rgba(108,92,231,0.25)' },
        },
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
