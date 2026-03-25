import React from 'react'
import ReactECharts from 'echarts-for-react'

interface RadarDataPoint { dimension: string; score: number }
interface RadarChartProps {
  data: RadarDataPoint[]
  compareData?: RadarDataPoint[]
  title?: string
  height?: number
}

const RadarChart: React.FC<RadarChartProps> = ({ data, compareData, title, height = 220 }) => {
  const indicators = data.map(d => ({ name: d.dimension, max: 10 }))
  const series: any[] = [{
    type: 'radar',
    data: [{
      value: data.map(d => d.score),
      name: title ?? '当前',
      areaStyle: { color: 'rgba(108,92,231,0.2)' },
      lineStyle: { color: '#6C5CE7', width: 2 },
      itemStyle: { color: '#6C5CE7' },
      symbol: 'circle', symbolSize: 4,
    }],
  }]
  if (compareData?.length) {
    series.push({
      type: 'radar',
      data: [{
        value: compareData.map(d => d.score),
        name: '全网均值',
        areaStyle: { color: 'rgba(156,163,180,0.1)' },
        lineStyle: { color: '#9CA3B4', width: 1.5, type: 'dashed' },
        itemStyle: { color: '#9CA3B4' },
        symbol: 'circle', symbolSize: 3,
      }],
    })
  }
  const option = {
    backgroundColor: 'transparent',
    title: title ? { text: title, textStyle: { color: '#E8ECF3', fontSize: 13, fontWeight: 600 }, top: 4, left: 'center' } : undefined,
    tooltip: { trigger: 'item', backgroundColor: 'rgba(15,17,30,0.92)', borderColor: 'rgba(255,255,255,0.08)', textStyle: { color: '#E8ECF3', fontSize: 12 } },
    radar: {
      indicator: indicators,
      center: ['50%', title ? '55%' : '50%'],
      radius: title ? '62%' : '68%',
      splitNumber: 4,
      axisName: { color: '#9CA3B4', fontSize: 11 },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
      splitArea: { areaStyle: { color: ['rgba(255,255,255,0.01)', 'rgba(255,255,255,0.02)'] } },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
    },
    series,
  }
  return <ReactECharts option={option} style={{ height, width: '100%' }} opts={{ renderer: 'canvas' }} />
}

export default RadarChart
