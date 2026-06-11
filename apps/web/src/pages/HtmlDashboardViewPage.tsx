import { ArrowLeftOutlined, DatabaseOutlined } from '@ant-design/icons'
import { Button, Drawer, Spin, Tag, Tooltip, Typography } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { datasetsApi, htmlDashboardsApi, queryApi } from '../services/api'
import type { DatasetDetail, HtmlDashboardItem } from '../types'
import { useThemeStore } from '../stores/themeStore'

const { Text } = Typography

export default function HtmlDashboardViewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  const [dashboard, setDashboard] = useState<HtmlDashboardItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [datasetDetails, setDatasetDetails] = useState<DatasetDetail[]>([])
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!id) return
    htmlDashboardsApi.get(id)
      .then((res) => setDashboard(res.data))
      .catch(() => setError('看板不存在或已被删除'))
      .finally(() => setLoading(false))
  }, [id])

  const loadDatasetDetails = async (dash: HtmlDashboardItem) => {
    if (dash.dataset_ids.length === 0) return
    const results = await Promise.allSettled(
      dash.dataset_ids.map((did) => datasetsApi.get(did))
    )
    const details: DatasetDetail[] = []
    for (const r of results) {
      if (r.status === 'fulfilled') details.push(r.value.data)
    }
    setDatasetDetails(details)
  }

  const handleGuideOpen = () => {
    setGuideOpen(true)
    if (dashboard && datasetDetails.length === 0) loadDatasetDetails(dashboard)
  }

  // postMessage bridge: relay mh-query from iframe → platform API → mh-result back
  useEffect(() => {
    if (!dashboard) return

    const handler = async (event: MessageEvent) => {
      if (!event.data || event.data.type !== 'mh-query') return
      if (event.source !== iframeRef.current?.contentWindow) return

      const { id: queryId, sql, datasetId } = event.data as {
        id: number
        sql: string
        datasetId: string
      }

      const replyTo = iframeRef.current?.contentWindow
      if (!replyTo) return

      if (!dashboard.dataset_ids.includes(datasetId)) {
        replyTo.postMessage(
          { type: 'mh-result', id: queryId, error: `Dataset ${datasetId} not bound to this dashboard` },
          '*',
        )
        return
      }

      try {
        const res = await queryApi.preview({ dataset_id: datasetId, sql })
        replyTo.postMessage({ type: 'mh-result', id: queryId, result: res.data }, '*')
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Query failed'
        replyTo.postMessage({ type: 'mh-result', id: queryId, error: msg }, '*')
      }
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [dashboard])

  const headerBg = isDark ? 'rgba(26,29,46,0.95)' : 'rgba(255,255,255,0.95)'
  const borderColor = isDark ? 'rgba(162,155,254,0.12)' : '#E8ECF3'
  const textPrimary = isDark ? '#E8ECF3' : '#1A1D2E'
  const textSecondary = isDark ? '#9CA3B4' : '#5F6B7A'
  const codeBg = isDark ? '#0d0f1a' : '#f4f6fb'

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (error || !dashboard) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 16 }}>
        <Text style={{ color: textSecondary }}>{error ?? '未知错误'}</Text>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/html-dashboards')}>返回</Button>
      </div>
    )
  }

  const firstId = dashboard.dataset_ids[0] ?? 'YOUR_DATASET_ID'
  const firstName = datasetDetails[0]?.name ?? '数据集名称'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Thin header bar */}
      <div
        style={{
          height: 48,
          flexShrink: 0,
          background: headerBg,
          backdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${borderColor}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 12,
          zIndex: 10,
        }}
      >
        <Button
          type="text"
          size="small"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/html-dashboards')}
          style={{ color: textSecondary }}
        />
        <span style={{ fontWeight: 600, color: textPrimary, fontSize: 14 }}>{dashboard.name}</span>
        {dashboard.description && (
          <span style={{ color: textSecondary, fontSize: 12 }}>{dashboard.description}</span>
        )}
        <div style={{ flex: 1 }} />
        <Tooltip title="查看可用数据集及接入说明">
          <Button
            size="small"
            icon={<DatabaseOutlined />}
            onClick={handleGuideOpen}
            style={{ fontSize: 12 }}
          >
            数据说明
          </Button>
        </Tooltip>
      </div>

      {/* Full-height iframe */}
      <iframe
        ref={iframeRef}
        src={htmlDashboardsApi.viewUrl(dashboard.id)}
        style={{ flex: 1, border: 'none', width: '100%' }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        title={dashboard.name}
      />

      {/* Data guide drawer */}
      <Drawer
        title="数据接入说明"
        placement="right"
        width={480}
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        styles={{ body: { padding: '16px 20px' } }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>已绑定数据集</div>
            {dashboard.dataset_ids.length === 0 ? (
              <Text type="secondary" style={{ fontSize: 12 }}>本看板未绑定任何数据集</Text>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {dashboard.dataset_ids.map((did) => {
                  const detail = datasetDetails.find((d) => d.id === did)
                  const cols = detail?.schema_info?.columns ?? []
                  return (
                    <div
                      key={did}
                      style={{
                        background: codeBg,
                        borderRadius: 8,
                        padding: '10px 12px',
                        border: `1px solid ${borderColor}`,
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                        {detail?.name ?? did.slice(0, 8) + '…'}
                      </div>
                      <div style={{ fontSize: 11, color: textSecondary, marginBottom: 6, wordBreak: 'break-all' }}>
                        ID: {did}
                      </div>
                      {cols.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {cols.map((c) => (
                            <Tag key={c.name} style={{ fontSize: 11, margin: 0, borderRadius: 4 }}>{c.name}</Tag>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>方式一：直接读取预加载数据（推荐）</div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
              看板加载时平台已将数据自动注入为全局变量，无需异步请求，直接同步访问：
            </Text>
            <pre style={{
              background: codeBg,
              border: `1px solid ${borderColor}`,
              borderRadius: 8,
              padding: 12,
              fontSize: 12,
              overflowX: 'auto',
              lineHeight: 1.6,
              margin: 0,
            }}>
{`// 按数据集名称访问（推荐）
var ds = window.MH_DATA['${firstName}'];
// ds.name    → 数据集名称
// ds.columns → ['字段1', '字段2', ...]
// ds.rows    → [[值, 值, ...], ...]

// 将 rows 转为对象数组
var records = ds.rows.map(function(row) {
  var obj = {};
  ds.columns.forEach(function(col, i) {
    obj[col] = row[i];
  });
  return obj;
});

// 按数据集 ID 访问
var ds2 = window.MH_DATASETS['${firstId}'];`}
            </pre>
          </div>

          <div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>方式二：异步 SQL 查询</div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
              执行任意 SQL，返回 Promise（按需查询大数据集时使用）：
            </Text>
            <pre style={{
              background: codeBg,
              border: `1px solid ${borderColor}`,
              borderRadius: 8,
              padding: 12,
              fontSize: 12,
              overflowX: 'auto',
              lineHeight: 1.6,
              margin: 0,
            }}>
{`window.MetadataHub.query(
  'SELECT * FROM tbl WHERE year = 2025',
  '${firstId}'
).then(function(result) {
  // result.columns → ['字段1', ...]
  // result.rows    → [[值, ...], ...]
  console.log(result);
});`}
            </pre>
          </div>
        </div>
      </Drawer>
    </div>
  )
}
