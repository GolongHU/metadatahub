import { useEffect, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { Table, Spin } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { partnerApi } from '../../services/partnerApi'
import type { AdminDashboardData, PartnerRankRow, RiskAlert } from '../../types/partner'
import KPICard from '../../components/partner/KPICard'
import TierBadge from '../../components/partner/TierBadge'
import RadarChart from '../../components/partner/RadarChart'

const TIER_COLORS: Record<string, string> = {
  strategic: '#6C5CE7',
  core: '#3B82F6',
  growth: '#00C48C',
  observation: '#FFB946',
  risk: '#FF4757',
}

const DIM_LABELS: Record<string, string> = {
  performance: '业绩贡献度',
  growth: '增长驱动力',
  engagement: '合作紧密度',
  health: '运营健康度',
  activity: '生态活跃度',
}

const TIER_LABELS: Record<string, string> = {
  strategic: '战略伙伴',
  core: '核心伙伴',
  growth: '成长伙伴',
  observation: '观察伙伴',
  risk: '风险伙伴',
}

const REGION_COLORS = ['#6C5CE7', '#3B82F6', '#00C48C', '#FFB946', '#FF6B9D']

function scoreColor(score: number): string {
  if (score >= 8) return '#00C48C'
  if (score < 5) return '#FF4757'
  return '#E8ECF3'
}

function barColor(score: number): string {
  if (score >= 7) return '#00C48C'
  if (score >= 5) return '#3B82F6'
  return '#FFB946'
}

const cardStyle: React.CSSProperties = {
  background: 'rgba(26,29,46,0.4)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(162,155,254,0.06)',
  borderRadius: 18,
  padding: 16,
  height: '100%',
  boxSizing: 'border-box',
  overflow: 'hidden',
}

interface AdminDashboardProps {
  onPartnerClick?: (partnerId: string) => void
}

export default function AdminDashboard({ onPartnerClick }: AdminDashboardProps = {}) {
  const [data, setData] = useState<AdminDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    partnerApi.getAdminDashboard()
      .then(r => setData(r.data))
      .catch((e) => setError(e?.response?.data?.detail ?? '数据加载失败，请稍后重试'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0c14' }}>
        <Spin size="large" />
      </div>
    )
  }
  if (error || !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0c14', gap: 16 }}>
        <div style={{ fontSize: 40 }}>⚠️</div>
        <div style={{ color: '#FF4757', fontSize: 15 }}>{error ?? '暂无数据'}</div>
        <button
          onClick={load}
          style={{ background: 'rgba(108,92,231,0.2)', border: '1px solid rgba(108,92,231,0.4)', borderRadius: 8, color: '#A29BFE', padding: '8px 20px', cursor: 'pointer', fontSize: 13 }}
        >
          重新加载
        </button>
      </div>
    )
  }

  // ── Tier donut chart ──────────────────────────────────────────────────────
  const tierData = data.tier_distribution.map(t => ({ value: t.count, name: t.tier, itemStyle: { color: TIER_COLORS[t.tier] } }))
  const tierEntries = data.tier_distribution.map(t => [t.tier, t.count] as [string, number])
  const tierTotal = data.tier_distribution.reduce((s, t) => s + t.count, 0)
  const donutOption = {
    backgroundColor: 'transparent',
    series: [
      {
        type: 'pie',
        radius: ['50%', '72%'],
        center: ['40%', '50%'],
        data: tierData,
        label: { show: false },
        emphasis: { scale: true, scaleSize: 6 },
      },
    ],
    graphic: [
      {
        type: 'text',
        left: '36%',
        top: '44%',
        style: {
          text: `${tierTotal}\n合作伙伴`,
          textAlign: 'center',
          fill: '#E8ECF3',
          fontSize: 14,
          fontWeight: 'bold',
          lineHeight: 22,
        },
      },
    ],
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(10,12,20,0.92)',
      borderColor: 'rgba(255,255,255,0.12)',
      textStyle: { color: '#E8ECF3' },
      formatter: '{b}: {c} ({d}%)',
    },
  }

  // ── Region bar chart ──────────────────────────────────────────────────────
  const regionEntries = data.region_comparison.map(r => [r.region, r.avg_score] as [string, number])
  const globalAvg = data.kpis.avg_score
  const regionBarOption = {
    backgroundColor: 'transparent',
    grid: { left: 80, right: 60, top: 20, bottom: 30 },
    xAxis: {
      type: 'value',
      min: 0,
      max: 10,
      axisLabel: { color: '#8899AA', fontSize: 11 },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
      axisLine: { show: false },
    },
    yAxis: {
      type: 'category',
      data: regionEntries.map(([r]) => r),
      axisLabel: { color: '#C4CDD6', fontSize: 12 },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
      axisTick: { show: false },
    },
    series: [
      {
        type: 'bar',
        data: regionEntries.map(([, score]) => ({
          value: score,
          itemStyle: { color: barColor(score), borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: 'right', color: '#E8ECF3', fontSize: 12, formatter: (p: { value: number }) => p.value.toFixed(1) },
        })),
        barMaxWidth: 22,
        label: { show: true, position: 'right', color: '#E8ECF3', fontSize: 12 },
      },
    ],
    markLine: {
      data: [{ xAxis: globalAvg, lineStyle: { type: 'dashed', color: 'rgba(255,255,255,0.5)', width: 1 } }],
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(10,12,20,0.92)',
      borderColor: 'rgba(255,255,255,0.12)',
      textStyle: { color: '#E8ECF3' },
    },
  }

  // ── Monthly trend line chart ──────────────────────────────────────────────
  const months = data.monthly_trend.map(p => p.period)
  const regionKeys = data.monthly_trend.length > 0 ? Object.keys(data.monthly_trend[0].by_region) : []
  const trendOption = {
    backgroundColor: 'transparent',
    grid: { left: 40, right: 20, top: 30, bottom: 30 },
    xAxis: {
      type: 'category',
      data: months,
      axisLabel: { color: '#8899AA', fontSize: 10 },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 10,
      axisLabel: { color: '#8899AA', fontSize: 10 },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
      axisLine: { show: false },
    },
    legend: {
      top: 0,
      right: 0,
      textStyle: { color: '#8899AA', fontSize: 10 },
      itemWidth: 12,
      itemHeight: 3,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(10,12,20,0.92)',
      borderColor: 'rgba(255,255,255,0.12)',
      textStyle: { color: '#E8ECF3' },
    },
    series: [
      ...regionKeys.map((region, i) => ({
        name: region,
        type: 'line',
        smooth: true,
        data: data.monthly_trend.map(p => p.by_region[region]),
        lineStyle: { color: REGION_COLORS[i % REGION_COLORS.length], width: 2 },
        itemStyle: { color: REGION_COLORS[i % REGION_COLORS.length] },
        symbol: 'none',
      })),
      {
        name: '全网',
        type: 'line',
        smooth: true,
        data: data.monthly_trend.map(p => p.avg_score),
        lineStyle: { color: '#FFFFFF', width: 2, type: 'dashed' },
        itemStyle: { color: '#FFFFFF' },
        symbol: 'none',
      },
    ],
  }

  // ── Ranking table columns ─────────────────────────────────────────────────
  const rankIcon = (rank: number) => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return `${rank}`
  }

  const trendArrow = (trend: string) => {
    if (trend === 'up') return <span style={{ color: '#00C48C', fontWeight: 700 }}>↑</span>
    if (trend === 'down') return <span style={{ color: '#FF4757', fontWeight: 700 }}>↓</span>
    return <span style={{ color: '#5F6B7A' }}>→</span>
  }

  const dimCol = (key: keyof PartnerRankRow, title: string): ColumnsType<PartnerRankRow>[number] => ({
    title,
    dataIndex: key,
    key: key as string,
    width: 58,
    align: 'center' as const,
    sorter: (a, b) => ((a[key] as number) ?? 0) - ((b[key] as number) ?? 0),
    render: (val: number) => (
      <span style={{ color: scoreColor(val), fontWeight: val >= 8 || val < 5 ? 700 : 400 }}>
        {val?.toFixed(1)}
      </span>
    ),
  })

  const tableColumns: ColumnsType<PartnerRankRow> = [
    {
      title: '排名',
      dataIndex: 'rank',
      key: 'rank',
      width: 52,
      align: 'center',
      sorter: (a, b) => a.rank - b.rank,
      render: (rank: number) => <span style={{ fontSize: rank <= 3 ? 16 : 13 }}>{rankIcon(rank)}</span>,
    },
    {
      title: '伙伴名称',
      dataIndex: 'partner_name',
      key: 'partner_name',
      width: 140,
      render: (name: string, row: PartnerRankRow) =>
        onPartnerClick ? (
          <span
            style={{ color: '#A29BFE', fontWeight: 500, cursor: 'pointer', textDecoration: 'underline dotted' }}
            onClick={() => onPartnerClick(row.partner_id)}
          >
            {name}
          </span>
        ) : (
          <span style={{ color: '#E8ECF3', fontWeight: 500 }}>{name}</span>
        ),
    },
    {
      title: '区域',
      dataIndex: 'region',
      key: 'region',
      width: 80,
      render: (v: string) => <span style={{ color: '#8899AA' }}>{v}</span>,
    },
    {
      title: '经理',
      dataIndex: 'manager',
      key: 'manager',
      width: 80,
      render: (v: string) => <span style={{ color: '#8899AA' }}>{v}</span>,
    },
    dimCol('performance', '业绩'),
    dimCol('growth', '增长'),
    dimCol('engagement', '紧密'),
    dimCol('health', '健康'),
    dimCol('activity', '活跃'),
    {
      title: '总分',
      dataIndex: 'total_score',
      key: 'total_score',
      width: 64,
      align: 'center',
      sorter: (a, b) => a.total_score - b.total_score,
      defaultSortOrder: 'descend',
      render: (val: number) => (
        <span style={{ color: scoreColor(val), fontWeight: 700, fontSize: 14 }}>{val?.toFixed(1)}</span>
      ),
    },
    {
      title: '层级',
      dataIndex: 'tier',
      key: 'tier',
      width: 90,
      render: (tier: string) => <TierBadge tier={tier} />,
    },
    {
      title: '趋势',
      dataIndex: 'trend',
      key: 'trend',
      width: 52,
      align: 'center',
      render: (trend: string) => trendArrow(trend),
    },
  ]

  const radarData = Object.entries(data.radar_global).map(([k, v]) => ({
    dimension: DIM_LABELS[k] ?? k,
    score: v,
  }))

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateRows: 'auto 1fr 1fr 1fr',
        gap: 16,
        padding: '72px 20px 20px',
        boxSizing: 'border-box',
        fontFamily: "'Inter', 'PingFang SC', system-ui, sans-serif",
      }}
    >
      {/* Row 1: 6 KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
        <KPICard
          label="总签约金额"
          value={`¥${(data.kpis.total_revenue / 10000).toFixed(1)}亿`}
          unit="亿元"
        />
        <KPICard
          label="平均贡献度得分"
          value={data.kpis.avg_score.toFixed(1)}
        />
        <KPICard
          label="活跃伙伴数"
          value={data.kpis.active_partners}
        />
        <KPICard
          label="风险伙伴数"
          value={data.kpis.risk_partners}
          highlight
        />
        <KPICard
          label="观察伙伴数"
          value={data.kpis.observation_partners}
        />
        <KPICard
          label="全网回款率"
          value={`${data.kpis.collection_rate.toFixed(1)}%`}
        />
      </div>

      {/* Row 2: Donut + Region bar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Tier distribution donut */}
        <div style={cardStyle}>
          <div style={{ color: '#C4CDD6', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>伙伴层级分布</div>
          <div style={{ display: 'flex', height: 'calc(100% - 30px)', alignItems: 'center' }}>
            <div style={{ flex: '0 0 60%', height: '100%' }}>
              <ReactECharts option={donutOption} style={{ height: '100%', minHeight: 160 }} />
            </div>
            <div style={{ flex: 1, paddingLeft: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tierEntries.map(([tier, count]) => (
                <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: TIER_COLORS[tier] ?? '#888',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ color: '#C4CDD6', fontSize: 12, flex: 1 }}>{TIER_LABELS[tier] ?? tier}</span>
                  <span style={{ color: '#E8ECF3', fontWeight: 600, fontSize: 13 }}>{count}</span>
                  <span style={{ color: '#5F6B7A', fontSize: 11 }}>
                    {tierTotal > 0 ? ((count / tierTotal) * 100).toFixed(0) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Region comparison bar */}
        <div style={cardStyle}>
          <div style={{ color: '#C4CDD6', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            区域平均得分对比
            <span style={{ color: '#5F6B7A', fontSize: 11, fontWeight: 400, marginLeft: 8 }}>
              全网均值 {globalAvg.toFixed(1)}
            </span>
          </div>
          <ReactECharts option={regionBarOption} style={{ height: 'calc(100% - 28px)', minHeight: 160 }} />
        </div>
      </div>

      {/* Row 3: Radar + Trend + Risk alerts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        {/* Global radar */}
        <div style={cardStyle}>
          <div style={{ color: '#C4CDD6', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>全网五维分布</div>
          <div style={{ height: 'calc(100% - 28px)' }}>
            <RadarChart data={radarData} />
          </div>
        </div>

        {/* Monthly trend */}
        <div style={cardStyle}>
          <div style={{ color: '#C4CDD6', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>月度趋势</div>
          <ReactECharts option={trendOption} style={{ height: 'calc(100% - 28px)', minHeight: 160 }} />
        </div>

        {/* Risk alerts */}
        <div style={cardStyle}>
          <div style={{ color: '#FF4757', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
            ⚠ 风险预警
          </div>
          {data.risk_alerts.length === 0 ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: '#00C48C',
                fontSize: 13,
                marginTop: 16,
              }}
            >
              <span style={{ fontSize: 16 }}>✓</span> 暂无风险预警
            </div>
          ) : (
            <>
              <div
                style={{
                  overflowY: 'auto',
                  maxHeight: 'calc(100% - 72px)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                {data.risk_alerts.slice(0, 10).map((alert: RiskAlert) => (
                  <div
                    key={alert.partner_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 8px',
                      background: 'rgba(255,255,255,0.04)',
                      borderRadius: 6,
                      borderLeft: `3px solid ${TIER_COLORS[alert.tier] ?? '#888'}`,
                    }}
                  >
                    <span style={{ flex: 1, color: '#E8ECF3', fontSize: 12, fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {alert.partner_name}
                    </span>
                    <span
                      style={{
                        background: alert.score < 5 ? 'rgba(255,71,87,0.15)' : 'rgba(255,185,70,0.15)',
                        color: alert.score < 5 ? '#FF4757' : '#FFB946',
                        borderRadius: 4,
                        padding: '1px 6px',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {alert.score.toFixed(1)}
                    </span>
                    <TierBadge tier={alert.tier} />
                    <span style={{ color: '#5F6B7A' }}>→</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8, textAlign: 'right' }}>
                <span
                  style={{ color: '#3B82F6', fontSize: 12, cursor: 'pointer' }}
                  onClick={() => {/* navigate to full risk list */}}
                >
                  查看全部 →
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Row 4: Full-width ranking table */}
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ color: '#C4CDD6', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>伙伴综合排名</div>
        <Table<PartnerRankRow>
          columns={tableColumns}
          dataSource={data.partner_rankings}
          rowKey="partner_id"
          size="small"
          scroll={{ x: 900, y: 'calc(100% - 56px)' }}
          pagination={{ pageSize: 15, size: 'small', showSizeChanger: false }}
          style={{ height: 'calc(100% - 36px)' }}
          rowClassName={() => 'partner-rank-row'}
          onRow={() => ({
            style: {
              background: 'transparent',
              transition: 'background 0.15s',
            },
          })}
          components={{
            header: {
              cell: (props: React.HTMLAttributes<HTMLElement>) => (
                <th
                  {...props}
                  style={{
                    ...(props.style ?? {}),
                    background: 'rgba(15,18,30,0.9)',
                    color: '#8899AA',
                    fontSize: 12,
                    fontWeight: 600,
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    padding: '8px 8px',
                  }}
                />
              ),
            },
            body: {
              cell: (props: React.HTMLAttributes<HTMLElement>) => (
                <td
                  {...props}
                  style={{
                    ...(props.style ?? {}),
                    background: 'transparent',
                    color: '#C4CDD6',
                    fontSize: 12,
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    padding: '7px 8px',
                  }}
                />
              ),
            },
          }}
        />
      </div>

    </div>
  )
}
