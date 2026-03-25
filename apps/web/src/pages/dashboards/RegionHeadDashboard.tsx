import { useEffect, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { Table, Spin } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { partnerApi } from '../../services/partnerApi'
import type { RegionDashboardData, PartnerRankRow, ActionItem } from '../../types/partner'
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

interface RegionHeadDashboardProps {
  onPartnerClick?: (partnerId: string) => void
}

export default function RegionHeadDashboard({ onPartnerClick }: RegionHeadDashboardProps = {}) {
  const [data, setData] = useState<RegionDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    partnerApi.getRegionDashboard()
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
  const tierTotal = data.tier_distribution.reduce((s, t) => s + t.count, 0)
  const donutOption = {
    backgroundColor: 'transparent',
    series: [
      {
        type: 'pie',
        radius: ['50%', '72%'],
        center: ['40%', '50%'],
        data: data.tier_distribution.map((t) => ({
          name: TIER_LABELS[t.tier] ?? t.tier,
          value: t.count,
          itemStyle: { color: TIER_COLORS[t.tier] ?? '#888' },
        })),
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

  // ── Manager comparison bar chart ──────────────────────────────────────────
  const managerEntries = data.manager_comparison
  const managerBarOption = {
    backgroundColor: 'transparent',
    grid: { left: 90, right: 70, top: 20, bottom: 30 },
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
      data: managerEntries.map(m => m.manager_name),
      axisLabel: { color: '#C4CDD6', fontSize: 12 },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
      axisTick: { show: false },
    },
    series: [
      {
        type: 'bar',
        data: managerEntries.map(m => ({
          value: m.avg_score,
          itemStyle: { color: barColor(m.avg_score), borderRadius: [0, 4, 4, 0] },
          label: {
            show: true,
            position: 'right',
            color: '#8899AA',
            fontSize: 11,
            formatter: () => `管 ${m.partner_count} 个伙伴`,
          },
        })),
        barMaxWidth: 22,
        label: { show: true, position: 'right', color: '#8899AA', fontSize: 11 },
      },
    ],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(10,12,20,0.92)',
      borderColor: 'rgba(255,255,255,0.12)',
      textStyle: { color: '#E8ECF3' },
      formatter: (params: Array<{ name: string; value: number }>) => {
        const p = params[0]
        const mgr = managerEntries.find(m => m.manager_name === p.name)
        return `${p.name}<br/>均分: ${p.value.toFixed(1)}<br/>管辖伙伴: ${mgr?.partner_count ?? '-'}`
      },
    },
  }

  // ── Radar data ────────────────────────────────────────────────────────────
  const regionRadarData = Object.entries(data.radar_region).map(([k, v]) => ({
    dimension: DIM_LABELS[k] ?? k,
    score: v,
  }))
  const globalRadarData = Object.entries(data.radar_global).map(([k, v]) => ({
    dimension: DIM_LABELS[k] ?? k,
    score: v,
  }))

  // ── Severity icon ─────────────────────────────────────────────────────────
  const severityIcon = (severity: string) => {
    if (severity === 'warning') return { icon: '⚠', color: '#FFB946' }
    if (severity === 'ok') return { icon: '✓', color: '#00C48C' }
    return { icon: '💡', color: '#3B82F6' }
  }

  // ── Table helpers ─────────────────────────────────────────────────────────
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
      {/* Row 1: 4 KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <KPICard
          label="区域总签约金额"
          value={`¥${(data.kpis.total_revenue / 10000).toFixed(1)}亿`}
          unit="亿元"
        />
        <KPICard
          label="区域平均得分"
          value={data.kpis.avg_score.toFixed(1)}
          subtext={`全网均值 ${data.global_avg_score.toFixed(1)} | 排名 第${data.region_rank}/5`}
        />
        <KPICard
          label="区域伙伴数"
          value={data.kpis.active_partners}
        />
        <KPICard
          label="风险伙伴数"
          value={data.kpis.risk_partners}
          highlight={data.kpis.risk_partners > 0}
        />
      </div>

      {/* Row 2: Donut + Manager bar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Region tier distribution donut */}
        <div style={cardStyle}>
          <div style={{ color: '#C4CDD6', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>区域层级分布</div>
          <div style={{ display: 'flex', height: 'calc(100% - 30px)', alignItems: 'center' }}>
            <div style={{ flex: '0 0 60%', height: '100%' }}>
              <ReactECharts option={donutOption} style={{ height: '100%', minHeight: 160 }} />
            </div>
            <div style={{ flex: 1, paddingLeft: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.tier_distribution.map((t) => (
                <div key={t.tier} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: TIER_COLORS[t.tier] ?? '#888',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ color: '#C4CDD6', fontSize: 12, flex: 1 }}>{TIER_LABELS[t.tier] ?? t.tier}</span>
                  <span style={{ color: '#E8ECF3', fontWeight: 600, fontSize: 13 }}>{t.count}</span>
                  <span style={{ color: '#5F6B7A', fontSize: 11 }}>
                    {tierTotal > 0 ? ((t.count / tierTotal) * 100).toFixed(0) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Manager comparison horizontal bar */}
        <div style={cardStyle}>
          <div style={{ color: '#C4CDD6', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>经理得分对比</div>
          <ReactECharts option={managerBarOption} style={{ height: 'calc(100% - 28px)', minHeight: 160 }} />
        </div>
      </div>

      {/* Row 3: Radar + Action items */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Region radar vs global */}
        <div style={cardStyle}>
          <div style={{ color: '#C4CDD6', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            区域五维 vs 全网均值
          </div>
          <div style={{ height: 'calc(100% - 28px)' }}>
            <RadarChart data={regionRadarData} compareData={globalRadarData} />
          </div>
        </div>

        {/* Action items panel */}
        <div style={cardStyle}>
          <div style={{ color: '#C4CDD6', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
            ⚡ 需要关注
          </div>
          {!data.action_items || data.action_items.length === 0 ? (
            <div style={{ color: '#00C48C', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
              <span style={{ fontSize: 15 }}>✓</span> 所有伙伴状态良好
            </div>
          ) : (
            <div
              style={{
                overflowY: 'auto',
                maxHeight: 180,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {data.action_items.map((item: ActionItem, idx: number) => {
                const { icon, color } = severityIcon(item.severity)
                const isOk = item.severity === 'ok'
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '8px 10px',
                      background: 'rgba(255,255,255,0.04)',
                      borderRadius: 8,
                      borderLeft: `3px solid ${color}`,
                    }}
                  >
                    <span style={{ color, fontSize: 14, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {item.partner_name && (
                        <span
                          style={{
                            color: isOk ? '#8899AA' : '#E8ECF3',
                            fontWeight: isOk ? 400 : 600,
                            fontSize: 12,
                            marginRight: 6,
                          }}
                        >
                          {item.partner_name}
                        </span>
                      )}
                      <span style={{ color: isOk ? '#5F6B7A' : '#C4CDD6', fontSize: 12 }}>
                        {item.message}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Row 4: Partner ranking table */}
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ color: '#C4CDD6', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>区域伙伴排名</div>
        <Table<PartnerRankRow>
          columns={tableColumns}
          dataSource={data.partner_rankings}
          rowKey="partner_id"
          size="small"
          scroll={{ x: 900, y: 'calc(100% - 56px)' }}
          pagination={{ pageSize: 9, size: 'small', showSizeChanger: false }}
          style={{ height: 'calc(100% - 36px)' }}
          onRow={() => ({
            style: { background: 'transparent', transition: 'background 0.15s' },
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
