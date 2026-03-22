import {
  BarChartOutlined,
  FilterOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  Button,
  Empty,
  Select,
  Skeleton,
  Tooltip,
  Typography,
  message,
} from 'antd'
import { useEffect, useRef, useState } from 'react'
import ChartWidget from '../components/ChartWidget'
import { dashboardApi, datasetsApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import type {
  ChartType,
  DashboardDetail,
  DashboardFilter,
  DashboardListItem,
  DashboardWidget,
  Dataset,
  WidgetResult,
} from '../types'

const { Text, Title } = Typography

// ── Styles ────────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: '#FFFFFF',
  borderRadius: 16,
  padding: '20px 24px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  border: '1px solid #E8ECF3',
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ widget, result }: { widget: DashboardWidget; result?: WidgetResult }) {
  if (!result) {
    return (
      <div style={cardStyle}>
        <Skeleton active paragraph={{ rows: 1 }} title={{ width: '60%' }} />
      </div>
    )
  }

  const raw = result.rows[0]?.[0]
  const numVal = typeof raw === 'number' ? raw : parseFloat(String(raw ?? 0))

  let formatted = '—'
  if (!result.error && !isNaN(numVal)) {
    if (widget.format === 'currency') {
      formatted =
        numVal >= 1e8
          ? `¥${(numVal / 1e8).toFixed(2)} 亿`
          : numVal >= 1e4
            ? `¥${(numVal / 1e4).toFixed(2)} 万`
            : `¥${numVal.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`
    } else {
      formatted =
        numVal >= 1e8
          ? `${(numVal / 1e8).toFixed(2)} 亿`
          : numVal >= 1e4
            ? `${(numVal / 1e4).toFixed(2)} 万`
            : numVal.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
    }
  }

  return (
    <div style={cardStyle}>
      <Text style={{ fontSize: 12, color: '#9CA3B4', display: 'block', marginBottom: 10 }}>
        {widget.title}
      </Text>
      <div
        style={{
          fontSize: 30,
          fontWeight: 700,
          color: result.error ? '#ff4d4f' : '#2D3142',
          lineHeight: 1.1,
          letterSpacing: '-0.5px',
        }}
      >
        {result.error ? (
          <Tooltip title={result.error}>
            <span style={{ fontSize: 13, fontWeight: 400 }}>查询失败</span>
          </Tooltip>
        ) : (
          formatted
        )}
      </div>
      {result.row_count !== undefined && (
        <Text style={{ fontSize: 11, color: '#C4CBD6', marginTop: 6, display: 'block' }}>
          {result.execution_time_ms}ms
        </Text>
      )}
    </div>
  )
}

// ── Chart Card ────────────────────────────────────────────────────────────────

function ChartCard({ widget, result }: { widget: DashboardWidget; result?: WidgetResult }) {
  return (
    <div style={{ ...cardStyle, minHeight: 300 }}>
      <Text
        style={{ fontSize: 13, fontWeight: 500, color: '#2D3142', display: 'block', marginBottom: 16 }}
      >
        {widget.title}
      </Text>
      {!result ? (
        <Skeleton active paragraph={{ rows: 6 }} title={false} />
      ) : result.error ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 200,
            color: '#ff4d4f',
            fontSize: 12,
          }}
        >
          {result.error}
        </div>
      ) : (
        <ChartWidget
          chartType={(widget.chart_type ?? 'bar') as ChartType}
          columns={result.columns}
          rows={result.rows}
          height={240}
        />
      )}
    </div>
  )
}

// ── Filter Bar ────────────────────────────────────────────────────────────────

function FilterBar({
  filters,
  datasetId,
  values,
  onChange,
  onApply,
}: {
  filters: DashboardFilter[]
  datasetId: string
  values: Record<string, string>
  onChange: (id: string, val: string) => void
  onApply: () => void
}) {
  const [optionsMap, setOptionsMap] = useState<Record<string, string[]>>({})

  useEffect(() => {
    for (const f of filters) {
      datasetsApi
        .fieldValues(datasetId, f.field)
        .then((r) => setOptionsMap((prev) => ({ ...prev, [f.id]: r.data })))
        .catch(() => {})
    }
  }, [filters, datasetId])

  if (!filters.length) return null

  return (
    <div
      style={{
        background: '#FFFFFF',
        borderBottom: '1px solid #E8ECF3',
        padding: '0 24px',
        height: 52,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexShrink: 0,
      }}
    >
      <FilterOutlined style={{ color: '#9CA3B4', fontSize: 14 }} />
      <Text style={{ fontSize: 12, color: '#9CA3B4', marginRight: 4 }}>筛选</Text>
      {filters.map((f) => (
        <Select
          key={f.id}
          allowClear
          style={{ width: 180 }}
          placeholder={f.label}
          value={values[f.id] || undefined}
          onChange={(v) => onChange(f.id, v ?? '')}
          options={(optionsMap[f.id] ?? []).map((o) => ({ value: o, label: o }))}
          size="small"
        />
      ))}
      <Button size="small" type="primary" onClick={onApply} style={{ marginLeft: 4 }}>
        应用
      </Button>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [dashboards, setDashboards] = useState<DashboardListItem[]>([])
  const [selectedDashboard, setSelectedDashboard] = useState<DashboardDetail | null>(null)
  const [widgetResults, setWidgetResults] = useState<Record<string, WidgetResult>>({})
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [pendingFilters, setPendingFilters] = useState<Record<string, string>>({})
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>({})
  const initRef = useRef(false)

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    if (isAdmin) {
      datasetsApi.list().then((r) => setDatasets(r.data)).catch(() => {})
    }
    dashboardApi
      .list()
      .then((r) => {
        setDashboards(r.data)
        if (r.data.length > 0) loadDashboard(r.data[0].id)
      })
      .catch(() => {})
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const loadDashboard = async (id: string) => {
    setLoading(true)
    setWidgetResults({})
    setPendingFilters({})
    setAppliedFilters({})
    try {
      const res = await dashboardApi.get(id)
      setSelectedDashboard(res.data)
      await runWidgetQueries(res.data, {})
    } catch {
      message.error('看板加载失败')
    } finally {
      setLoading(false)
    }
  }

  const runWidgetQueries = async (dashboard: DashboardDetail, activeFilters: Record<string, string>) => {
    setLoading(true)
    try {
      const f = Object.fromEntries(Object.entries(activeFilters).filter(([, v]) => v !== ''))
      const res = await dashboardApi.query(dashboard.id, Object.keys(f).length ? f : undefined)
      setWidgetResults(res.data.widgets)
    } catch {
      message.error('数据加载失败')
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (id: string, val: string) => {
    setPendingFilters((prev) => ({ ...prev, [id]: val }))
  }

  const handleFilterApply = () => {
    if (!selectedDashboard) return
    setAppliedFilters(pendingFilters)
    runWidgetQueries(selectedDashboard, pendingFilters)
  }

  const handleAutoGenerate = async (datasetId: string) => {
    setGenerating(true)
    try {
      await dashboardApi.autoGenerate(datasetId)
      const listRes = await dashboardApi.list()
      setDashboards(listRes.data)
      const newDash = listRes.data.find((d) => d.dataset_id === datasetId)
      if (newDash) await loadDashboard(newDash.id)
      message.success('看板已生成')
    } catch {
      message.error('生成失败，请重试')
    } finally {
      setGenerating(false)
    }
  }

  // Group widgets by row
  const widgetsByRow: Record<number, DashboardWidget[]> = {}
  if (selectedDashboard) {
    for (const w of selectedDashboard.config.widgets) {
      const row = w.position.row
      if (!widgetsByRow[row]) widgetsByRow[row] = []
      widgetsByRow[row].push(w)
    }
  }

  const dashboardFilters: DashboardFilter[] = selectedDashboard?.config.filters ?? []

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#F8F9FC' }}>
      {/* ── Header ── */}
      <div
        style={{
          background: '#FFFFFF',
          borderBottom: '1px solid #E8ECF3',
          padding: '0 24px',
          height: 60,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexShrink: 0,
        }}
      >
        <BarChartOutlined style={{ color: '#6C5CE7', fontSize: 18 }} />
        <Text style={{ fontSize: 16, fontWeight: 500, color: '#2D3142' }}>数据看板</Text>
        <div style={{ width: 1, height: 20, background: '#E8ECF3' }} />

        <Select
          style={{ width: 260 }}
          placeholder="选择看板"
          value={selectedDashboard?.id}
          onChange={loadDashboard}
          options={dashboards.map((d) => ({ value: d.id, label: d.name }))}
          notFoundContent={<span style={{ fontSize: 12, color: '#9CA3B4' }}>暂无看板</span>}
        />

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => selectedDashboard && runWidgetQueries(selectedDashboard, appliedFilters)}
            loading={loading}
          >
            刷新
          </Button>
          {isAdmin && (
            <Select
              style={{ width: 220 }}
              placeholder="🚀 为数据集生成看板"
              loading={generating}
              value={null}
              onChange={handleAutoGenerate}
              options={datasets.map((d) => ({ value: d.id, label: d.name }))}
            />
          )}
        </div>
      </div>

      {/* ── Filter Bar ── */}
      {selectedDashboard && dashboardFilters.length > 0 && (
        <FilterBar
          filters={dashboardFilters}
          datasetId={selectedDashboard.dataset_id}
          values={pendingFilters}
          onChange={handleFilterChange}
          onApply={handleFilterApply}
        />
      )}

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {!selectedDashboard && !loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 80 }}>
            <Empty
              description={
                isAdmin
                  ? '暂无看板，请在右上角选择数据集自动生成'
                  : '暂无看板，请联系管理员创建'
              }
            />
          </div>
        ) : (
          <>
            {selectedDashboard && (
              <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Title level={5} style={{ margin: 0, color: '#5F6B7A', fontWeight: 500 }}>
                  {selectedDashboard.config.title}
                </Title>
                {Object.values(appliedFilters).some(Boolean) && (
                  <span
                    style={{
                      fontSize: 11,
                      color: '#6C5CE7',
                      background: '#F0EEFF',
                      borderRadius: 10,
                      padding: '2px 10px',
                    }}
                  >
                    已筛选
                  </span>
                )}
              </div>
            )}

            {Object.keys(widgetsByRow)
              .map(Number)
              .sort((a, b) => a - b)
              .map((rowKey) => {
                const rowWidgets = widgetsByRow[rowKey].sort(
                  (a, b) => a.position.col - b.position.col,
                )
                const isKpiRow = rowWidgets.every((w) => w.type === 'kpi')

                return (
                  <div
                    key={rowKey}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isKpiRow
                        ? `repeat(${rowWidgets.length}, 1fr)`
                        : rowWidgets.map((w) => `${w.position.width}fr`).join(' '),
                      gap: 16,
                      marginBottom: 16,
                    }}
                  >
                    {rowWidgets.map((widget) =>
                      widget.type === 'kpi' ? (
                        <KpiCard key={widget.id} widget={widget} result={widgetResults[widget.id]} />
                      ) : (
                        <ChartCard key={widget.id} widget={widget} result={widgetResults[widget.id]} />
                      ),
                    )}
                  </div>
                )
              })}
          </>
        )}
      </div>
    </div>
  )
}
