import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  BarChartOutlined,
  DeleteOutlined,
  EditOutlined,
  EllipsisOutlined,
  FilterOutlined,
  MessageOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
} from '@ant-design/icons'
import {
  Button,
  Dropdown,
  Empty,
  Input,
  Modal,
  Select,
  Skeleton,
  Space,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ChartWidget from '../components/ChartWidget'
import { dashboardApi, datasetsApi, queryApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import { useChatStore, type RecentQuery } from '../stores/chatStore'
import { useViewStore } from '../stores/useViewStore'
import type {
  ChartType,
  DashboardConfig,
  DashboardDetail,
  DashboardFilter,
  DashboardListItem,
  DashboardWidget,
  Dataset,
  QueryData,
  WidgetResult,
} from '../types'

const { Text, Title } = Typography
const { TextArea } = Input

// ── Constants ─────────────────────────────────────────────────────────────────

const CHART_TYPE_LABEL: Record<string, string> = {
  bar: '柱状图',
  bar_horizontal: '横向柱状图',
  line: '折线图',
  pie: '饼图',
  table: '数据表',
}

const TYPE_LABEL: Record<string, { label: string; color: string }> = {
  fixed: { label: '固定', color: '#6C5CE7' },
  auto: { label: '自动', color: '#00C48C' },
  personal: { label: '个人', color: '#3B82F6' },
}

const GROUP_LABEL: Record<string, string> = {
  fixed: '固定看板',
  auto: '自动生成',
  personal: '个人看板',
}

// ── Styles ────────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background:         'var(--bg-glass)',
  backdropFilter:     'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  borderRadius:       20,
  padding:            '20px 24px',
  boxShadow:          'var(--bg-glass-shadow)',
  border:             '1px solid var(--bg-glass-border)',
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
    </div>
  )
}

// ── Chart Card ────────────────────────────────────────────────────────────────

function ChartCard({
  widget,
  result,
  onRemove,
  onMoveUp,
  onMoveDown,
  canEdit,
  isFirstRow,
  isLastRow,
}: {
  widget: DashboardWidget
  result?: WidgetResult
  onRemove?: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  canEdit?: boolean
  isFirstRow?: boolean
  isLastRow?: boolean
}) {
  const chartTypeTag = widget.chart_type && CHART_TYPE_LABEL[widget.chart_type]

  return (
    <div style={{ ...cardStyle, minHeight: 300 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: 500, color: '#2D3142', flex: 1 }}>
          {widget.title}
        </Text>
        {chartTypeTag && (
          <Tag
            style={{
              fontSize: 11,
              padding: '0 8px',
              borderRadius: 10,
              background: '#F8F9FC',
              color: '#9CA3B4',
              border: '1px solid #E8ECF3',
            }}
          >
            {chartTypeTag}
          </Tag>
        )}
        {canEdit && (
          <Space size={2}>
            <Tooltip title="上移">
              <Button
                type="text"
                size="small"
                icon={<ArrowUpOutlined />}
                onClick={onMoveUp}
                disabled={isFirstRow}
                style={{ color: isFirstRow ? '#E8ECF3' : '#C4CBD6' }}
              />
            </Tooltip>
            <Tooltip title="下移">
              <Button
                type="text"
                size="small"
                icon={<ArrowDownOutlined />}
                onClick={onMoveDown}
                disabled={isLastRow}
                style={{ color: isLastRow ? '#E8ECF3' : '#C4CBD6' }}
              />
            </Tooltip>
            <Tooltip title="移除图表">
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                onClick={onRemove}
                style={{ color: '#C4CBD6' }}
              />
            </Tooltip>
          </Space>
        )}
      </div>
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
  onChange: (field: string, val: string) => void
  onApply: () => void
}) {
  const [optionsMap, setOptionsMap] = useState<Record<string, string[] | null>>({})

  useEffect(() => {
    for (const f of filters) {
      setOptionsMap((prev) => ({ ...prev, [f.field]: null }))
      datasetsApi
        .fieldValues(datasetId, f.field)
        .then((r) => setOptionsMap((prev) => ({ ...prev, [f.field]: r.data })))
        .catch(() => setOptionsMap((prev) => ({ ...prev, [f.field]: [] })))
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
      {filters.map((f) => {
        const opts = optionsMap[f.field]
        const isLoading = opts === null
        return (
          <Select
            key={f.field}
            allowClear
            style={{ width: 180 }}
            placeholder={f.label}
            value={values[f.field] || undefined}
            onChange={(v) => onChange(f.field, v ?? '')}
            loading={isLoading}
            options={(opts ?? []).map((o) => ({ value: o, label: o }))}
            size="small"
          />
        )
      })}
      <Button size="small" type="primary" onClick={onApply} style={{ marginLeft: 4 }}>
        应用
      </Button>
    </div>
  )
}

// ── Create Dashboard Modal ────────────────────────────────────────────────────

function CreateDashboardModal({
  open,
  datasets,
  onClose,
  onCreated,
}: {
  open: boolean
  datasets: Dataset[]
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [datasetId, setDatasetId] = useState<string>()
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!name.trim() || !datasetId) return
    setCreating(true)
    try {
      const res = await dashboardApi.create({ name: name.trim(), dataset_id: datasetId })
      message.success('看板已创建')
      onCreated(res.data.id)
      setName('')
      setDatasetId(undefined)
    } catch {
      message.error('创建失败')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal
      open={open}
      title="新建看板"
      onCancel={onClose}
      onOk={handleCreate}
      okText="创建"
      cancelText="取消"
      confirmLoading={creating}
      okButtonProps={{ disabled: !name.trim() || !datasetId }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 0' }}>
        <div>
          <Text style={{ fontSize: 12, color: '#5F6B7A', display: 'block', marginBottom: 6 }}>看板名称</Text>
          <Input
            placeholder="例如：销售分析看板"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <Text style={{ fontSize: 12, color: '#5F6B7A', display: 'block', marginBottom: 6 }}>数据集</Text>
          <Select
            style={{ width: '100%' }}
            placeholder="选择数据集"
            value={datasetId}
            onChange={setDatasetId}
            options={datasets.map((d) => ({ value: d.id, label: d.name }))}
          />
        </div>
      </div>
    </Modal>
  )
}

// ── Add Chart Modal ───────────────────────────────────────────────────────────

function AddChartModal({
  open,
  onClose,
  dashboard,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  dashboard: DashboardDetail
  onAdded: () => void
}) {
  const { recentQueries } = useChatStore()
  const [customSql, setCustomSql] = useState('')
  const [customTitle, setCustomTitle] = useState('')
  const [customChartType, setCustomChartType] = useState<ChartType>('bar')
  const [previewResult, setPreviewResult] = useState<QueryData | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)

  // Only show queries compatible with this dashboard's dataset
  const compatibleQueries = recentQueries.filter((q) => q.dataset_id === dashboard.dataset_id)

  const handleAddFromHistory = async (q: RecentQuery) => {
    setAdding(q.id)
    try {
      const tablePrefix = `dataset_${q.dataset_id.replace(/-/g, '')}`
      const sqlWithPlaceholder = q.sql.replace(tablePrefix, '{table}')
      await dashboardApi.addWidget(dashboard.id, {
        type: 'chart',
        chart_type: q.chart_type,
        title: q.title,
        query: sqlWithPlaceholder,
      })
      message.success('图表已添加')
      onAdded()
    } catch {
      message.error('添加失败')
    } finally {
      setAdding(null)
    }
  }

  const handlePreviewCustom = async () => {
    if (!customSql.trim()) return
    setPreviewLoading(true)
    setPreviewResult(null)
    try {
      const res = await queryApi.preview({ dataset_id: dashboard.dataset_id, sql: customSql })
      setPreviewResult(res.data)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'SQL 执行失败'
      message.error(detail)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleAddCustom = async () => {
    if (!customSql.trim() || !customTitle.trim()) return
    setAdding('custom')
    try {
      // Normalize SQL: replace concrete table name with {table} if present
      const tablePrefix = `dataset_${dashboard.dataset_id.replace(/-/g, '')}`
      const sqlWithPlaceholder = customSql.replace(tablePrefix, '{table}')
      await dashboardApi.addWidget(dashboard.id, {
        type: 'chart',
        chart_type: customChartType,
        title: customTitle.trim(),
        query: sqlWithPlaceholder,
      })
      message.success('图表已添加')
      setCustomSql('')
      setCustomTitle('')
      setPreviewResult(null)
      onAdded()
    } catch {
      message.error('添加失败')
    } finally {
      setAdding(null)
    }
  }

  return (
    <Modal
      open={open}
      title="添加图表"
      onCancel={onClose}
      footer={null}
      width={680}
      destroyOnClose
    >
      <Tabs
        defaultActiveKey="history"
        items={[
          {
            key: 'history',
            label: '历史查询',
            children: (
              <div style={{ minHeight: 200 }}>
                {compatibleQueries.length === 0 ? (
                  <Empty
                    description={
                      recentQueries.length === 0
                        ? '暂无历史查询，请先在对话页面进行查询'
                        : '没有与此看板数据集匹配的历史查询'
                    }
                    style={{ padding: '40px 0' }}
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {compatibleQueries.map((q) => (
                      <div
                        key={q.id}
                        style={{
                          ...cardStyle,
                          padding: '12px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#2D3142', marginBottom: 2 }}>
                            {q.title}
                          </div>
                          <div style={{ fontSize: 12, color: '#9CA3B4' }}>
                            {CHART_TYPE_LABEL[q.chart_type] ?? q.chart_type} · {q.row_count} 条数据
                          </div>
                        </div>
                        <Button
                          size="small"
                          type="primary"
                          loading={adding === q.id}
                          onClick={() => handleAddFromHistory(q)}
                          style={{ background: '#6C5CE7', border: 'none', flexShrink: 0 }}
                        >
                          添加
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'custom',
            label: '自定义 SQL',
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Input
                    placeholder="图表标题"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <Select
                    value={customChartType}
                    onChange={setCustomChartType}
                    style={{ width: 120 }}
                    options={Object.entries(CHART_TYPE_LABEL)
                      .filter(([k]) => k !== 'table')
                      .map(([k, v]) => ({ value: k, label: v }))}
                  />
                </div>
                <TextArea
                  rows={6}
                  placeholder={`SELECT 字段 FROM {table} GROUP BY 字段\n\n提示：使用 {table} 作为表名占位符`}
                  value={customSql}
                  onChange={(e) => setCustomSql(e.target.value)}
                  style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 13 }}
                />
                <Space>
                  <Button onClick={handlePreviewCustom} loading={previewLoading} disabled={!customSql.trim()}>
                    执行预览
                  </Button>
                  <Button
                    type="primary"
                    disabled={!previewResult || !customTitle.trim()}
                    loading={adding === 'custom'}
                    onClick={handleAddCustom}
                    style={{ background: '#6C5CE7', border: 'none' }}
                  >
                    添加到看板
                  </Button>
                </Space>
                {previewResult && (
                  <div
                    style={{
                      background: '#FAFBFD',
                      borderRadius: 12,
                      padding: 12,
                      maxHeight: 220,
                      overflow: 'auto',
                    }}
                  >
                    <div style={{ fontSize: 11, color: '#9CA3B4', marginBottom: 8 }}>
                      预览：{previewResult.row_count} 行 · {previewResult.execution_time_ms.toFixed(0)}ms
                    </div>
                    <ChartWidget
                      chartType={customChartType}
                      columns={previewResult.columns}
                      rows={previewResult.rows}
                      height={160}
                    />
                  </div>
                )}
              </div>
            ),
          },
        ]}
      />
    </Modal>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [searchParams] = useSearchParams()
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
  const [showCreate, setShowCreate] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [showAddChart, setShowAddChart] = useState(false)
  const [showRename, setShowRename] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameSaving, setRenameSaving] = useState(false)
  const [quickQuery, setQuickQuery] = useState('')
  const { viewState: transitionState, startTransition, setLoading: setTransitionLoading, setExploding, setRevealing, setChatResult, setError: setTransitionError } = useViewStore()
  const initRef = useRef(false)

  const submitQuickQuery = (q: string) => {
    if (!q.trim() || !selectedDashboard) return
    setQuickQuery('')
    const datasetId = selectedDashboard.dataset_id
    startTransition(q, datasetId)

    // After card fly-out animation (600 ms) → loading phase
    setTimeout(() => setTransitionLoading(), 600)

    // Fire API request
    queryApi
      .ask(q, datasetId)
      .then((res) => {
        const { sql, chart_type, data: qd } = res.data
        setExploding({
          query:      q,
          chartType:  chart_type,
          columns:    qd.columns,
          rows:       qd.rows,
          sql:        sql,
          dataset_id: datasetId,
        })
        // exploding → revealing after 400 ms
        setTimeout(() => {
          setRevealing()
          // revealing → chat_result after 600 ms
          setTimeout(() => setChatResult(), 600)
        }, 400)
      })
      .catch((err) => {
        setTransitionError(err?.response?.data?.detail ?? '查询失败')
      })
  }

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    datasetsApi.list().then((r) => setDatasets(r.data)).catch(() => {})
    dashboardApi
      .list()
      .then((r) => {
        setDashboards(r.data)
        // Support ?dashboard=<id> from save-to-dashboard link
        const targetId = searchParams.get('dashboard')
        const first = targetId ? r.data.find((d) => d.id === targetId) ?? r.data[0] : r.data[0]
        if (first) loadDashboard(first.id)
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadDashboard = async (id: string) => {
    setLoading(true)
    setWidgetResults({})
    setPendingFilters({})
    setAppliedFilters({})
    setEditMode(false)
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

  const handleAutoGenerate = async (datasetId: string) => {
    setGenerating(true)
    try {
      await dashboardApi.autoGenerate(datasetId)
      const listRes = await dashboardApi.list()
      setDashboards(listRes.data)
      const newDash = listRes.data.find((d) => d.dataset_id === datasetId && d.dashboard_type === 'auto')
      if (newDash) await loadDashboard(newDash.id)
      message.success('看板已生成')
    } catch {
      message.error('生成失败，请重试')
    } finally {
      setGenerating(false)
    }
  }

  const handleRemoveWidget = async (widgetId: string) => {
    if (!selectedDashboard) return
    try {
      await dashboardApi.removeWidget(selectedDashboard.id, widgetId)
      const res = await dashboardApi.get(selectedDashboard.id)
      setSelectedDashboard(res.data)
      await runWidgetQueries(res.data, appliedFilters)
    } catch {
      message.error('移除失败')
    }
  }

  const handleMoveRow = async (rowKey: number, direction: 'up' | 'down') => {
    if (!selectedDashboard) return
    const sortedRowKeys = Object.keys(widgetsByRow).map(Number).sort((a, b) => a - b)
    const idx = sortedRowKeys.indexOf(rowKey)
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx === sortedRowKeys.length - 1) return

    const targetRow = direction === 'up' ? sortedRowKeys[idx - 1] : sortedRowKeys[idx + 1]
    const updatedWidgets = selectedDashboard.config.widgets.map((w) => {
      if (w.position.row === rowKey) return { ...w, position: { ...w.position, row: targetRow } }
      if (w.position.row === targetRow) return { ...w, position: { ...w.position, row: rowKey } }
      return w
    })

    try {
      const updatedConfig: DashboardConfig = { ...selectedDashboard.config, widgets: updatedWidgets }
      const res = await dashboardApi.update(selectedDashboard.id, { config: updatedConfig })
      setSelectedDashboard(res.data)
    } catch {
      message.error('操作失败')
    }
  }

  const handleRename = async () => {
    if (!selectedDashboard || !renameValue.trim()) return
    setRenameSaving(true)
    try {
      const res = await dashboardApi.update(selectedDashboard.id, { name: renameValue.trim() })
      setSelectedDashboard(res.data)
      const listRes = await dashboardApi.list()
      setDashboards(listRes.data)
      setShowRename(false)
      message.success('已重命名')
    } catch {
      message.error('重命名失败')
    } finally {
      setRenameSaving(false)
    }
  }

  const handleDeleteDashboard = () => {
    if (!selectedDashboard) return
    Modal.confirm({
      title: `确认删除「${selectedDashboard.name}」？`,
      content: '删除后无法恢复，看板内所有图表将一并删除。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await dashboardApi.deleteDashboard(selectedDashboard.id)
        const listRes = await dashboardApi.list()
        setDashboards(listRes.data)
        if (listRes.data.length > 0) {
          await loadDashboard(listRes.data[0].id)
        } else {
          setSelectedDashboard(null)
        }
        message.success('看板已删除')
      },
    })
  }

  // ── Computed ────────────────────────────────────────────────────────────────

  const widgetsByRow: Record<number, DashboardWidget[]> = {}
  if (selectedDashboard) {
    for (const w of selectedDashboard.config.widgets) {
      const row = w.position.row
      if (!widgetsByRow[row]) widgetsByRow[row] = []
      widgetsByRow[row].push(w)
    }
  }

  const sortedRowKeys = Object.keys(widgetsByRow).map(Number).sort((a, b) => a - b)
  const dashboardFilters: DashboardFilter[] = selectedDashboard?.config.filters ?? []
  const canEdit =
    !!selectedDashboard &&
    (isAdmin || selectedDashboard.dashboard_type === 'personal')
  const isEmptyDashboard = selectedDashboard != null && selectedDashboard.config.widgets.length === 0

  const fixedDashboards = dashboards.filter((d) => d.dashboard_type === 'fixed')
  const autoDashboards = dashboards.filter((d) => d.dashboard_type === 'auto')
  const personalDashboards = dashboards.filter((d) => d.dashboard_type === 'personal')

  const moreMenuItems = canEdit
    ? [
        {
          key: 'rename',
          label: '重命名',
          icon: <EditOutlined />,
          onClick: () => {
            setRenameValue(selectedDashboard?.name ?? '')
            setShowRename(true)
          },
        },
        { type: 'divider' as const },
        {
          key: 'delete',
          label: '删除看板',
          icon: <DeleteOutlined />,
          danger: true,
          onClick: handleDeleteDashboard,
        },
      ]
    : []

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'transparent' }}>

      {/* ── Header Row 1 ── */}
      <div
        style={{
          background:         'var(--bg-glass)',
          backdropFilter:     'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom:       `1px solid var(--bg-glass-border)`,
          padding:            '0 24px',
          height:             60,
          display:            'flex',
          alignItems:         'center',
          gap:                12,
          flexShrink:         0,
        }}
      >
        <BarChartOutlined style={{ color: '#6C5CE7', fontSize: 18 }} />
        <Text style={{ fontSize: 16, fontWeight: 500, color: '#2D3142' }}>数据看板</Text>
        <div style={{ width: 1, height: 20, background: '#E8ECF3' }} />

        {/* OptGroup selector */}
        <Select
          style={{ width: 280 }}
          placeholder="选择看板"
          value={selectedDashboard?.id}
          onChange={loadDashboard}
          notFoundContent={<span style={{ fontSize: 12, color: '#9CA3B4' }}>暂无看板</span>}
        >
          {(['fixed', 'auto', 'personal'] as const).map((type) => {
            const group =
              type === 'fixed' ? fixedDashboards : type === 'auto' ? autoDashboards : personalDashboards
            if (!group.length) return null
            const tl = TYPE_LABEL[type]
            return (
              <Select.OptGroup key={type} label={GROUP_LABEL[type]}>
                {group.map((d) => (
                  <Select.Option key={d.id} value={d.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Tag
                        style={{
                          fontSize: 10,
                          padding: '0 5px',
                          borderRadius: 6,
                          background: `${tl.color}18`,
                          color: tl.color,
                          border: 'none',
                          flexShrink: 0,
                        }}
                      >
                        {tl.label}
                      </Tag>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {d.name}
                      </span>
                      <span style={{ fontSize: 11, color: '#C4CBD6', flexShrink: 0 }}>
                        {d.widget_count}
                      </span>
                    </div>
                  </Select.Option>
                ))}
              </Select.OptGroup>
            )
          })}
        </Select>

        {/* Rename / delete dropdown */}
        {selectedDashboard && moreMenuItems.length > 0 && (
          <Dropdown menu={{ items: moreMenuItems }} trigger={['click']}>
            <Button type="text" icon={<EllipsisOutlined />} style={{ color: '#9CA3B4' }} />
          </Dropdown>
        )}

        {/* Right actions */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => selectedDashboard && runWidgetQueries(selectedDashboard, appliedFilters)}
            loading={loading}
          >
            刷新
          </Button>

          {canEdit && (
            editMode ? (
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={() => setEditMode(false)}
                style={{ background: '#6C5CE7', border: 'none' }}
              >
                完成编辑
              </Button>
            ) : (
              <Button icon={<EditOutlined />} onClick={() => setEditMode(true)}>
                编辑
              </Button>
            )
          )}

          {editMode && (
            <Button
              icon={<PlusOutlined />}
              type="dashed"
              onClick={() => setShowAddChart(true)}
              style={{ borderColor: '#6C5CE7', color: '#6C5CE7' }}
            >
              添加图表
            </Button>
          )}

          <Button icon={<PlusOutlined />} onClick={() => setShowCreate(true)}>
            新建
          </Button>

          {isAdmin && (
            <Select
              style={{ width: 200 }}
              placeholder="🚀 为数据集生成"
              loading={generating}
              value={null}
              onChange={handleAutoGenerate}
              options={datasets.map((d) => ({ value: d.id, label: d.name }))}
            />
          )}
        </div>
      </div>

      {/* ── Header Row 2: Filter Bar ── */}
      {selectedDashboard && dashboardFilters.length > 0 && (
        <FilterBar
          filters={dashboardFilters}
          datasetId={selectedDashboard.dataset_id}
          values={pendingFilters}
          onChange={(field, val) => setPendingFilters((prev) => ({ ...prev, [field]: val }))}
          onApply={() => {
            if (!selectedDashboard) return
            setAppliedFilters(pendingFilters)
            runWidgetQueries(selectedDashboard, pendingFilters)
          }}
        />
      )}

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24, paddingBottom: 96 }}>

        {/* No dashboards at all */}
        {!selectedDashboard && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 80 }}>
            <Empty
              description={
                isAdmin
                  ? '暂无看板，点击"新建"创建，或在右上角选择数据集自动生成'
                  : '暂无看板，点击"新建"创建个人看板'
              }
            >
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowCreate(true)}
                style={{ background: '#6C5CE7', border: 'none' }}>
                新建看板
              </Button>
            </Empty>
          </div>
        )}

        {selectedDashboard && (
          <>
            {/* Dashboard title + filter indicator */}
            <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Title level={5} style={{ margin: 0, color: '#5F6B7A', fontWeight: 500 }}>
                {selectedDashboard.config.title}
              </Title>
              {Object.values(appliedFilters).some(Boolean) && (
                <span style={{ fontSize: 11, color: '#6C5CE7', background: '#F0EEFF', borderRadius: 10, padding: '2px 10px' }}>
                  已筛选
                </span>
              )}
              {editMode && (
                <span style={{ fontSize: 11, color: '#FFB946', background: '#FFF8EC', borderRadius: 10, padding: '2px 10px' }}>
                  编辑模式
                </span>
              )}
            </div>

            {/* Empty dashboard state */}
            {isEmptyDashboard ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 60 }}>
                <Empty description="此看板暂无图表">
                  <Space>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => { setEditMode(true); setShowAddChart(true) }}
                      style={{ background: '#6C5CE7', border: 'none' }}
                    >
                      从对话历史添加
                    </Button>
                    {isAdmin && (
                      <Button
                        icon={<ReloadOutlined />}
                        onClick={() => handleAutoGenerate(selectedDashboard.dataset_id)}
                        loading={generating}
                      >
                        自动生成图表
                      </Button>
                    )}
                  </Space>
                </Empty>
              </div>
            ) : (
              <>
                {sortedRowKeys.map((rowKey, rowIdx) => {
                  const rowWidgets = widgetsByRow[rowKey].sort((a, b) => a.position.col - b.position.col)
                  const isKpiRow = rowWidgets.every((w) => w.type === 'kpi')
                  const isFirstRow = rowIdx === 0
                  const isLastRow = rowIdx === sortedRowKeys.length - 1

                  return (
                    <div
                      key={rowKey}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: isKpiRow
                          ? 'repeat(auto-fit, minmax(180px, 1fr))'
                          : rowWidgets.map((w) => `${w.position.width}fr`).join(' '),
                        gap: 16,
                        marginBottom: 16,
                        ...(transitionState === 'collapsing' ? {
                          animation: `card-fly-out 0.55s cubic-bezier(0.4,0,1,1) ${rowIdx * 60}ms both`,
                        } : {}),
                      }}
                    >
                      {rowWidgets.map((widget) =>
                        widget.type === 'kpi' ? (
                          <KpiCard key={widget.id} widget={widget} result={widgetResults[widget.id]} />
                        ) : (
                          <ChartCard
                            key={widget.id}
                            widget={widget}
                            result={widgetResults[widget.id]}
                            canEdit={canEdit && editMode}
                            isFirstRow={isFirstRow}
                            isLastRow={isLastRow}
                            onRemove={() => handleRemoveWidget(widget.id)}
                            onMoveUp={() => handleMoveRow(rowKey, 'up')}
                            onMoveDown={() => handleMoveRow(rowKey, 'down')}
                          />
                        ),
                      )}
                    </div>
                  )
                })}

                {/* Edit mode: add chart button at bottom */}
                {editMode && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      marginTop: 8,
                    }}
                  >
                    <Button
                      type="dashed"
                      icon={<PlusOutlined />}
                      onClick={() => setShowAddChart(true)}
                      style={{ borderColor: '#D9D5FE', color: '#6C5CE7', width: 200 }}
                    >
                      添加图表
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* ── Floating input bar ── */}
      <div
        style={{
          position:     'fixed',
          bottom:       20,
          left:         88,
          right:        20,
          zIndex:       50,
          pointerEvents: selectedDashboard ? 'auto' : 'none',
          opacity:      selectedDashboard ? 1 : 0,
          transition:   'opacity 0.2s',
        }}
      >
        <div
          className="glass-card"
          style={{
            display:    'flex',
            alignItems: 'center',
            gap:        12,
            padding:    '10px 16px',
            borderRadius: 16,
          }}
        >
          <MessageOutlined style={{ color: 'var(--text-tertiary)', fontSize: 15, flexShrink: 0 }} />
          <input
            value={quickQuery}
            onChange={(e) => setQuickQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitQuickQuery(quickQuery)
            }}
            placeholder="向 AI 提问数据…按 Enter 进入对话"
            style={{
              flex:       1,
              border:     'none',
              background: 'transparent',
              outline:    'none',
              fontSize:   14,
              color:      'var(--text-primary)',
              fontFamily: 'inherit',
            }}
          />
          <Button
            type="primary"
            size="small"
            icon={<SendOutlined />}
            disabled={!quickQuery.trim()}
            onClick={() => submitQuickQuery(quickQuery)}
            style={{ background: '#6C5CE7', border: 'none', borderRadius: 10, flexShrink: 0 }}
          />
        </div>
      </div>

      {/* ── Modals ── */}
      <CreateDashboardModal
        open={showCreate}
        datasets={datasets}
        onClose={() => setShowCreate(false)}
        onCreated={async (id) => {
          setShowCreate(false)
          const listRes = await dashboardApi.list()
          setDashboards(listRes.data)
          await loadDashboard(id)
        }}
      />

      {selectedDashboard && (
        <AddChartModal
          open={showAddChart}
          onClose={() => setShowAddChart(false)}
          dashboard={selectedDashboard}
          onAdded={async () => {
            setShowAddChart(false)
            const res = await dashboardApi.get(selectedDashboard.id)
            setSelectedDashboard(res.data)
            await runWidgetQueries(res.data, appliedFilters)
          }}
        />
      )}

      <Modal
        open={showRename}
        title="重命名看板"
        onCancel={() => setShowRename(false)}
        onOk={handleRename}
        okText="保存"
        cancelText="取消"
        confirmLoading={renameSaving}
        okButtonProps={{ disabled: !renameValue.trim() }}
      >
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          placeholder="输入新名称"
          style={{ marginTop: 16 }}
          onPressEnter={handleRename}
        />
      </Modal>
    </div>
  )
}
