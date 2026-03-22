import { Table } from 'antd'
import ReactECharts from 'echarts-for-react'
import type { ChartType } from '../types'
import '../styles/chartTheme'

interface ChartWidgetProps {
  chartType: ChartType
  columns: string[]
  rows: unknown[][]
  height?: number
}

// ── Value coercion ─────────────────────────────────────────────────────────────
function toNum(v: unknown): number {
  if (typeof v === 'number') return v
  const n = parseFloat(String(v))
  return isNaN(n) ? 0 : n
}

function yFormatter(v: number): string {
  if (v >= 100000000) return (v / 100000000).toFixed(1) + '亿'
  if (v >= 10000) return (v / 10000).toFixed(0) + '万'
  return String(v)
}

// ── Bar / Line ─────────────────────────────────────────────────────────────────
function buildBarLine(chartType: 'bar' | 'line', columns: string[], rows: unknown[][]) {
  const xData = rows.map((r) => String(r[0] ?? ''))
  const seriesColumns = columns.slice(1)
  const hasLongLabels = xData.some((s) => s.length > 6)
  const colors = ['#6C5CE7', '#00C48C', '#FFB946', '#FF6B81', '#3B82F6', '#A29BFE']

  const series = seriesColumns.map((name, colIdx) => ({
    name,
    type: chartType,
    data: rows.map((r) => toNum(r[colIdx + 1])),
    smooth: chartType === 'line',
    emphasis: { focus: 'series' },
    ...(chartType === 'bar'
      ? { itemStyle: { borderRadius: [6, 6, 0, 0], color: colors[colIdx % colors.length] } }
      : {
          lineStyle: { width: 2.5, color: colors[colIdx % colors.length] },
          itemStyle: { color: colors[colIdx % colors.length] },
          areaStyle: { opacity: 0.06, color: colors[colIdx % colors.length] },
          symbol: 'circle',
          symbolSize: 6,
        }),
  }))

  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#FFFFFF',
      borderColor: '#E8ECF3',
      borderWidth: 1,
      textStyle: { color: '#2D3142', fontSize: 13 },
      extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-radius: 8px; padding: 12px 16px;',
    },
    legend: seriesColumns.length > 1
      ? { bottom: 0, textStyle: { color: '#9CA3B4', fontSize: 12 }, icon: 'circle', itemWidth: 8, itemHeight: 8, itemGap: 16 }
      : undefined,
    grid: {
      left: 56,
      right: 24,
      top: 24,
      bottom: hasLongLabels ? 60 : (seriesColumns.length > 1 ? 44 : 24),
      containLabel: false,
    },
    xAxis: {
      type: 'category',
      data: xData,
      axisLine: { lineStyle: { color: '#E8ECF3' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#9CA3B4',
        fontSize: 12,
        interval: 0,
        rotate: hasLongLabels ? 30 : 0,
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#9CA3B4', fontSize: 12, formatter: yFormatter },
      splitLine: { lineStyle: { color: '#F1F3F9', type: 'dashed' } },
    },
    series,
  }
}

// ── Bar Horizontal ─────────────────────────────────────────────────────────────
function buildBarHorizontal(_columns: string[], rows: unknown[][]) {
  const yData = rows.map((r) => String(r[0] ?? '')).reverse()
  const values = rows.map((r) => toNum(r[1])).reverse()
  const colors = ['#6C5CE7', '#7B6EE8', '#8A80E9', '#9991EA', '#A8A3EB']

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: '#FFFFFF',
      borderColor: '#E8ECF3',
      borderWidth: 1,
      textStyle: { color: '#2D3142', fontSize: 13 },
      extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-radius: 8px; padding: 12px 16px;',
      formatter: (params: { name: string; value: number }[]) => {
        const p = params[0]
        return `${p.name}: ${yFormatter(p.value)}`
      },
    },
    grid: { left: 16, right: 40, top: 8, bottom: 8, containLabel: true },
    xAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#9CA3B4', fontSize: 11, formatter: yFormatter },
      splitLine: { lineStyle: { color: '#F1F3F9', type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      data: yData,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: '#5F6B7A',
        fontSize: 12,
        width: 80,
        overflow: 'truncate',
      },
      inverse: false,
    },
    series: [
      {
        type: 'bar',
        data: values.map((v, i) => ({
          value: v,
          itemStyle: {
            borderRadius: [0, 6, 6, 0],
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [
                { offset: 0, color: colors[i % colors.length] },
                { offset: 1, color: '#C4B5FD' },
              ],
            },
          },
        })),
        barMaxWidth: 28,
        label: {
          show: true,
          position: 'right',
          color: '#9CA3B4',
          fontSize: 11,
          formatter: (p: { value: number }) => yFormatter(p.value),
        },
      },
    ],
  }
}

// ── Pie ───────────────────────────────────────────────────────────────────────
function buildPie(_columns: string[], rows: unknown[][]) {
  const colors = ['#6C5CE7', '#00C48C', '#FFB946', '#FF6B81', '#3B82F6', '#A29BFE']
  const data = rows.map((r, i) => ({
    name: String(r[0] ?? ''),
    value: toNum(r[1]),
    itemStyle: { color: colors[i % colors.length], borderColor: '#fff', borderWidth: 3 },
  }))

  return {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
      backgroundColor: '#FFFFFF',
      borderColor: '#E8ECF3',
      borderWidth: 1,
      textStyle: { color: '#2D3142', fontSize: 13 },
      extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-radius: 8px; padding: 12px 16px;',
    },
    legend: {
      orient: 'vertical',
      right: 0,
      top: 'center',
      textStyle: { color: '#9CA3B4', fontSize: 12 },
      icon: 'circle',
      itemWidth: 8,
      itemHeight: 8,
      itemGap: 12,
    },
    series: [
      {
        type: 'pie',
        radius: ['45%', '72%'],
        center: ['38%', '50%'],
        data,
        label: { formatter: '{b}\n{d}%', fontSize: 12, color: '#5F6B7A' },
        emphasis: {
          itemStyle: { shadowBlur: 12, shadowOffsetX: 0, shadowColor: 'rgba(108, 92, 231, 0.25)' },
        },
      },
    ],
  }
}

// ── Table ─────────────────────────────────────────────────────────────────────
function DataTableView({ columns, rows }: { columns: string[]; rows: unknown[][] }) {
  const antColumns = columns.map((col, i) => ({
    title: col,
    dataIndex: String(i),
    key: col,
    ellipsis: true,
    render: (v: unknown) => {
      if (v === null || v === undefined) return <span style={{ color: '#C4CBD6' }}>—</span>
      const n = toNum(v)
      if (!isNaN(n) && typeof v !== 'boolean' && String(v).trim() !== '') {
        return n.toLocaleString()
      }
      return String(v)
    },
  }))

  const dataSource = rows.map((row, ri) => {
    const obj: Record<string, unknown> = { key: ri }
    row.forEach((cell, ci) => { obj[String(ci)] = cell })
    return obj
  })

  return (
    <Table
      columns={antColumns}
      dataSource={dataSource}
      pagination={{ pageSize: 10, size: 'small', showSizeChanger: false }}
      size="small"
      scroll={{ x: true }}
    />
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function ChartWidget({ chartType, columns, rows, height = 360 }: ChartWidgetProps) {
  if (!columns.length || !rows.length) {
    return <p style={{ color: '#9CA3B4', padding: 16 }}>暂无数据</p>
  }

  if (chartType === 'table') {
    return <DataTableView columns={columns} rows={rows} />
  }

  const option =
    chartType === 'pie'
      ? buildPie(columns, rows)
      : chartType === 'bar_horizontal'
        ? buildBarHorizontal(columns, rows)
        : buildBarLine(chartType, columns, rows)

  return (
    <ReactECharts
      option={option}
      theme="metadatahub"
      style={{ height }}
      opts={{ renderer: 'svg' }}
      notMerge
    />
  )
}
