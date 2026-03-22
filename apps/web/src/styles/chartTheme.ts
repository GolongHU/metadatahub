import * as echarts from 'echarts'

const theme = {
  color: ['#6C5CE7', '#00C48C', '#FFB946', '#FF6B81', '#3B82F6', '#A29BFE'],
  textStyle: {
    fontFamily: "'Inter', -apple-system, sans-serif",
    color: '#5F6B7A',
  },
  title: {
    textStyle: { fontSize: 14, fontWeight: '500', color: '#2D3142' },
  },
  legend: {
    textStyle: { fontSize: 12, color: '#9CA3B4' },
    icon: 'circle',
    itemWidth: 8,
    itemHeight: 8,
    itemGap: 16,
  },
  tooltip: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E8ECF3',
    borderWidth: 1,
    textStyle: { color: '#2D3142', fontSize: 13 },
    extraCssText:
      'box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-radius: 8px; padding: 12px 16px;',
  },
  xAxis: {
    axisLine: { lineStyle: { color: '#E8ECF3' } },
    axisTick: { show: false },
    axisLabel: { color: '#9CA3B4', fontSize: 12 },
    splitLine: { show: false },
  },
  yAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#9CA3B4', fontSize: 12 },
    splitLine: { lineStyle: { color: '#F1F3F9', type: 'dashed' } },
  },
  bar: {
    barMaxWidth: 36,
    itemStyle: { borderRadius: [6, 6, 0, 0] },
  },
  line: {
    smooth: true,
    symbolSize: 6,
    lineStyle: { width: 2.5 },
    areaStyle: { opacity: 0.05 },
  },
  pie: {
    radius: ['45%', '72%'],
    itemStyle: { borderColor: '#fff', borderWidth: 3 },
    label: { fontSize: 12, color: '#5F6B7A' },
  },
  grid: {
    left: 56,
    right: 24,
    top: 40,
    bottom: 44,
    containLabel: false,
  },
}

echarts.registerTheme('metadatahub', theme)

// ── Dark theme ────────────────────────────────────────────────────────────────
const darkTheme = {
  color: ['#A29BFE', '#00E0A3', '#FFC95A', '#FF8FA3', '#60A5FA', '#6C5CE7'],
  backgroundColor: 'transparent',
  textStyle: {
    fontFamily: "'Inter', -apple-system, sans-serif",
    color: '#9CA3B4',
  },
  title: {
    textStyle: { fontSize: 14, fontWeight: '500', color: '#E8ECF3' },
  },
  legend: {
    textStyle: { fontSize: 12, color: '#5F6B7A' },
    icon: 'circle',
    itemWidth: 8,
    itemHeight: 8,
    itemGap: 16,
  },
  tooltip: {
    backgroundColor: '#1E2130',
    borderColor: '#2D3142',
    borderWidth: 1,
    textStyle: { color: '#E8ECF3', fontSize: 13 },
    extraCssText:
      'box-shadow: 0 4px 20px rgba(0,0,0,0.4); border-radius: 8px; padding: 12px 16px;',
  },
  xAxis: {
    axisLine: { lineStyle: { color: '#2D3142' } },
    axisTick: { show: false },
    axisLabel: { color: '#5F6B7A', fontSize: 12 },
    splitLine: { show: false },
  },
  yAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#5F6B7A', fontSize: 12 },
    splitLine: { lineStyle: { color: '#2D3142', type: 'dashed' } },
  },
  bar: {
    barMaxWidth: 36,
    itemStyle: { borderRadius: [6, 6, 0, 0] },
  },
  line: {
    smooth: true,
    symbolSize: 6,
    lineStyle: { width: 2.5 },
    areaStyle: { opacity: 0.08 },
  },
  pie: {
    radius: ['45%', '72%'],
    itemStyle: { borderColor: '#1A1D2E', borderWidth: 3 },
    label: { fontSize: 12, color: '#9CA3B4' },
  },
  grid: {
    left: 56,
    right: 24,
    top: 40,
    bottom: 44,
    containLabel: false,
  },
}

echarts.registerTheme('metadatahub-dark', darkTheme)

export default theme
