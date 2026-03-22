import {
  CodeOutlined,
  DatabaseOutlined,
  PushpinOutlined,
  SendOutlined,
  TableOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Collapse,
  Empty,
  Input,
  Modal,
  Select,
  Skeleton,
  Space,
  Tag,
  Typography,
  message,
} from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ChartWidget from '../components/ChartWidget'
import { dashboardApi, datasetsApi, queryApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import { useChatStore } from '../stores/chatStore'
import type { ChatMessage, ChartType, DashboardListItem, Dataset, User } from '../types'

function computeScopeDesc(user: User | null): { icon: string; text: string } {
  if (!user) return { icon: '🔒', text: '' }
  if (user.role === 'admin') return { icon: '🔓', text: '全部数据' }
  if (user.partner_id) return { icon: '🔒', text: `仅限 ${user.partner_id}` }
  if (user.region) return { icon: '🔒', text: `${user.region}区域` }
  return { icon: '🔒', text: '受限范围' }
}

const { Text, Paragraph } = Typography
const { TextArea } = Input

// crypto.randomUUID() is only available in HTTPS contexts; use a fallback
function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2)
}

const PRESETS = [
  '各区域的总营收是多少？',
  '哪个月的交易量最高？',
  '各合作伙伴等级的平均营收？',
  '营收最高的前5个合作伙伴？',
]

// ── Loading dots ───────────────────────────────────────────────────────────────
function ThinkingDots() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0' }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#6C5CE7',
            animation: 'dot-pulse 1.2s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  )
}

// ── AI Avatar ─────────────────────────────────────────────────────────────────
function AIAvatar() {
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #6C5CE7 0%, #A29BFE 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: 11,
        color: '#fff',
        fontWeight: 700,
        letterSpacing: 0,
      }}
    >
      AI
    </div>
  )
}

// ── User bubble ───────────────────────────────────────────────────────────────
function UserBubble({ message: msg }: { message: ChatMessage }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
      <div
        style={{
          maxWidth: '65%',
          background: '#6C5CE7',
          color: '#FFFFFF',
          borderRadius: '16px 16px 4px 16px',
          padding: '10px 16px',
          fontSize: 14,
          lineHeight: 1.6,
        }}
      >
        {msg.content}
      </div>
    </div>
  )
}

// ── Assistant bubble ──────────────────────────────────────────────────────────
function AssistantBubble({ message: msg, onSave }: { message: ChatMessage; onSave?: () => void }) {
  const [chartHover, setChartHover] = useState(false)

  if (msg.loading) {
    return (
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <AIAvatar />
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '16px 16px 16px 4px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <ThinkingDots />
          <Skeleton active paragraph={{ rows: 0 }} title={{ width: 80 }} style={{ marginLeft: 12, display: 'inline-block' }} />
        </div>
      </div>
    )
  }

  if (msg.error) {
    return (
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <AIAvatar />
        <Alert
          type="error"
          showIcon
          icon={<WarningOutlined />}
          message="查询失败"
          description={msg.error}
          style={{ flex: 1, borderRadius: 12 }}
        />
      </div>
    )
  }

  const chartLabel =
    msg.chart_type === 'bar' ? '柱状图' :
    msg.chart_type === 'line' ? '折线图' :
    msg.chart_type === 'pie' ? '饼图' : '数据表'

  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'flex-start' }}>
      <AIAvatar />
      <div
        style={{
          flex: 1,
          maxWidth: '88%',
          background: '#FFFFFF',
          borderRadius: '16px 16px 16px 4px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          padding: '20px 24px',
        }}
      >
        {/* Explanation */}
        {msg.explanation && (
          <Paragraph style={{ marginBottom: 16, color: '#2D3142', lineHeight: 1.7 }}>
            {msg.explanation}
          </Paragraph>
        )}

        {/* Chart */}
        {msg.data && msg.chart_type && msg.chart_type !== 'table' && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 8 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#F0EEFF',
                  color: '#6C5CE7',
                  borderRadius: 20,
                  padding: '4px 12px',
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                <DatabaseOutlined />
                {chartLabel} · {msg.data.row_count} 条数据 · {msg.data.execution_time_ms.toFixed(0)}ms
              </span>
            </div>
            <div
              style={{ position: 'relative' }}
              onMouseEnter={() => setChartHover(true)}
              onMouseLeave={() => setChartHover(false)}
            >
              {/* Save button overlay */}
              {msg.sql && onSave && (
                <div
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    zIndex: 10,
                    opacity: chartHover ? 1 : 0,
                    transition: 'opacity 0.15s',
                  }}
                >
                  <Button
                    size="small"
                    icon={<PushpinOutlined />}
                    onClick={onSave}
                    style={{
                      fontSize: 12,
                      color: '#6C5CE7',
                      borderColor: '#D9D5FE',
                      background: '#F0EEFF',
                      boxShadow: '0 2px 6px rgba(108,92,231,0.15)',
                    }}
                  >
                    保存到看板
                  </Button>
                </div>
              )}
              <div style={{ background: '#FAFBFD', borderRadius: 12, padding: 16 }}>
                <ChartWidget
                  chartType={msg.chart_type}
                  columns={msg.data.columns}
                  rows={msg.data.rows}
                />
              </div>
            </div>
          </div>
        )}

        {/* Collapse: table + SQL */}
        <Collapse
          ghost
          size="small"
          style={{ marginTop: msg.chart_type !== 'table' ? 8 : 0 }}
          items={[
            ...(msg.data
              ? [
                  {
                    key: 'table',
                    label: (
                      <Space>
                        <TableOutlined style={{ color: '#9CA3B4' }} />
                        <Text style={{ fontSize: 12, color: '#9CA3B4' }}>
                          查看数据表（{msg.data.row_count} 行）
                        </Text>
                      </Space>
                    ),
                    children: (
                      <ChartWidget
                        chartType="table"
                        columns={msg.data.columns}
                        rows={msg.data.rows}
                        height={300}
                      />
                    ),
                  },
                ]
              : []),
            ...(msg.sql
              ? [
                  {
                    key: 'sql',
                    label: (
                      <Space>
                        <CodeOutlined style={{ color: '#9CA3B4' }} />
                        <Text style={{ fontSize: 12, color: '#9CA3B4' }}>查看 SQL</Text>
                      </Space>
                    ),
                    children: (
                      <pre
                        style={{
                          background: '#1A1D2E',
                          color: '#E8ECF3',
                          borderRadius: 12,
                          padding: '16px',
                          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                          fontSize: 13,
                          lineHeight: 1.6,
                          overflowX: 'auto',
                          margin: 0,
                        }}
                      >
                        {msg.sql}
                      </pre>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </div>
    </div>
  )
}

// ── Save to Dashboard Modal ────────────────────────────────────────────────────
function SaveToDashboardModal({
  open,
  onClose,
  msg,
  datasetId,
}: {
  open: boolean
  onClose: () => void
  msg: ChatMessage
  datasetId: string
}) {
  const [dashboards, setDashboards] = useState<DashboardListItem[]>([])
  const [selectedId, setSelectedId] = useState<string>('__new__')
  const [newName, setNewName] = useState('我的分析')
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setTitle(msg.explanation?.slice(0, 30) ?? '分析结果')
      dashboardApi.list().then((r) => setDashboards(r.data)).catch(() => {})
    }
  }, [open, msg.explanation])

  const handleSave = async () => {
    if (!msg.sql || !title.trim()) return
    setSaving(true)
    try {
      const res = await queryApi.saveToDashboard({
        dashboard_id: selectedId !== '__new__' ? selectedId : undefined,
        new_dashboard_name: selectedId === '__new__' ? newName : undefined,
        dataset_id: datasetId,
        title: title.trim(),
        sql: msg.sql,
        chart_type: msg.chart_type ?? 'bar',
        explanation: msg.explanation,
      })
      const dashId = res.data.dashboard_id
      message.success(
        <span>
          已保存到「{res.data.dashboard_name}」{' '}
          <a href={`/dashboards?dashboard=${dashId}`} style={{ color: '#6C5CE7', fontWeight: 500 }}>
            去查看 →
          </a>
        </span>
      )
      onClose()
    } catch {
      message.error('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  const dashboardOptions = [
    { value: '__new__', label: '+ 新建个人看板' },
    ...dashboards.map((d) => ({ value: d.id, label: `${d.name}（${d.widget_count} 个图表）` })),
  ]

  return (
    <Modal
      open={open}
      title="保存到看板"
      onCancel={onClose}
      onOk={handleSave}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      okButtonProps={{ disabled: !title.trim() || (selectedId === '__new__' && !newName.trim()) }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 0' }}>
        <div>
          <Text style={{ fontSize: 12, color: '#5F6B7A', display: 'block', marginBottom: 6 }}>图表标题</Text>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="给这个图表起个名字"
          />
        </div>
        <div>
          <Text style={{ fontSize: 12, color: '#5F6B7A', display: 'block', marginBottom: 6 }}>目标看板</Text>
          <Select
            style={{ width: '100%' }}
            value={selectedId}
            onChange={setSelectedId}
            options={dashboardOptions}
          />
        </div>
        {selectedId === '__new__' && (
          <div>
            <Text style={{ fontSize: 12, color: '#5F6B7A', display: 'block', marginBottom: 6 }}>新看板名称</Text>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="例如：我的销售分析"
            />
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const [searchParams] = useSearchParams()
  const initDatasetId = searchParams.get('dataset_id') ?? undefined
  const { user } = useAuthStore()
  const { addQuery } = useChatStore()
  const scopeDesc = computeScopeDesc(user)

  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | undefined>(initDatasetId)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [sending, setSending] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const [saveTarget, setSaveTarget] = useState<ChatMessage | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    datasetsApi.list()
      .then((res) => {
        setDatasets(res.data)
        if (!selectedDatasetId && res.data.length > 0) {
          setSelectedDatasetId(res.data[0].id)
        }
      })
      .catch(() => {
        message.error('数据集加载失败，请刷新页面重试')
      })
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(
    async (question: string) => {
      if (!question.trim()) return
      if (!selectedDatasetId) {
        message.warning('请先选择一个数据集')
        return
      }
      if (sending) return

      const userMsg: ChatMessage = { id: genId(), role: 'user', content: question }
      const loadingMsg: ChatMessage = { id: genId(), role: 'assistant', content: '', loading: true }

      setMessages((prev) => [...prev, userMsg, loadingMsg])
      setInputValue('')
      setSending(true)

      try {
        const res = await queryApi.ask(question, selectedDatasetId)
        const { sql, explanation, chart_type, data } = res.data
        setMessages((prev) =>
          prev.map((m) =>
            m.id === loadingMsg.id
              ? { ...m, loading: false, content: explanation, sql, explanation, chart_type: chart_type as ChartType, data, dataset_id: selectedDatasetId }
              : m
          )
        )
        // Save to cross-page history store
        addQuery({
          id: loadingMsg.id,
          title: explanation.slice(0, 40) || question.slice(0, 40),
          sql,
          chart_type: chart_type as ChartType,
          dataset_id: selectedDatasetId,
          row_count: data.row_count,
          created_at: new Date().toISOString(),
        })
      } catch (err: unknown) {
        const detail =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
          ?? '查询失败，请重试'
        setMessages((prev) =>
          prev.map((m) =>
            m.id === loadingMsg.id ? { ...m, loading: false, error: detail } : m
          )
        )
      } finally {
        setSending(false)
      }
    },
    [selectedDatasetId, sending]
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(inputValue)
    }
  }

  const selectedDataset = datasets.find((d) => d.id === selectedDatasetId)

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
        <Text style={{ fontSize: 16, fontWeight: 500, color: '#2D3142' }}>数据对话</Text>
        <div style={{ width: 1, height: 20, background: '#E8ECF3' }} />
        <Select
          style={{ width: 280 }}
          placeholder="选择数据集…"
          value={selectedDatasetId}
          onChange={setSelectedDatasetId}
          options={datasets.map((d) => ({
            value: d.id,
            label: (
              <Space size={8}>
                <span>{d.name}</span>
                <Tag
                  style={{
                    fontSize: 11,
                    borderRadius: 20,
                    background: '#F0EEFF',
                    color: '#6C5CE7',
                    border: 'none',
                    padding: '0 8px',
                  }}
                >
                  {d.row_count.toLocaleString()} 行
                </Tag>
              </Space>
            ),
          }))}
          notFoundContent={
            <Empty description="暂无数据集，请先上传" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          }
        />
        {selectedDataset && (
          <Text style={{ fontSize: 12, color: '#9CA3B4' }}>
            {selectedDataset.column_count} 个字段 · {selectedDataset.source_type.toUpperCase()}
          </Text>
        )}
        {scopeDesc.text && (
          <span
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: 'var(--primary-50, #F0EEFF)',
              color: 'var(--primary-600, #5B4BD5)',
              borderRadius: 20,
              padding: '4px 12px',
              fontSize: 12,
            }}
          >
            {scopeDesc.icon} 数据范围: {scopeDesc.text}
          </span>
        )}
      </div>

      {/* ── Messages ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 40px 0' }}>
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 60 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: 'linear-gradient(135deg, #6C5CE7 0%, #A29BFE 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                color: '#fff',
                fontWeight: 700,
                marginBottom: 16,
              }}
            >
              AI
            </div>
            <Text style={{ fontSize: 16, fontWeight: 500, color: '#2D3142', marginBottom: 6 }}>
              {selectedDatasetId ? '选择一个问题开始分析' : '请先选择一个数据集'}
            </Text>
            <Text style={{ fontSize: 13, color: '#9CA3B4', marginBottom: 28 }}>
              {selectedDatasetId ? '或直接在下方输入您的问题' : '在顶部选择器中选择要分析的数据集'}
            </Text>
            {selectedDatasetId && (
              <Space wrap style={{ justifyContent: 'center', maxWidth: 600 }}>
                {PRESETS.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    disabled={sending}
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid #E8ECF3',
                      borderRadius: 20,
                      padding: '8px 16px',
                      fontSize: 13,
                      color: '#5F6B7A',
                      cursor: sending ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      transition: 'all 0.15s',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                    }}
                    onMouseEnter={(e) => {
                      if (!sending) {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = '#6C5CE7'
                        ;(e.currentTarget as HTMLButtonElement).style.color = '#6C5CE7'
                        ;(e.currentTarget as HTMLButtonElement).style.background = '#F0EEFF'
                      }
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = '#E8ECF3'
                      ;(e.currentTarget as HTMLButtonElement).style.color = '#5F6B7A'
                      ;(e.currentTarget as HTMLButtonElement).style.background = '#FFFFFF'
                    }}
                  >
                    {q}
                  </button>
                ))}
              </Space>
            )}
          </div>
        )}

        {messages.map((msg) =>
          msg.role === 'user' ? (
            <UserBubble key={msg.id} message={msg} />
          ) : (
            <AssistantBubble
              key={msg.id}
              message={msg}
              onSave={msg.sql ? () => setSaveTarget(msg) : undefined}
            />
          )
        )}
        <div ref={bottomRef} style={{ height: 1 }} />
      </div>

      {/* ── Input ── */}
      <div
        style={{
          background: '#FFFFFF',
          borderTop: '1px solid #E8ECF3',
          padding: '16px 40px',
          flexShrink: 0,
        }}
      >
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div
            style={{
              flex: 1,
              border: `1px solid ${inputFocused ? '#6C5CE7' : '#E8ECF3'}`,
              borderRadius: 12,
              boxShadow: inputFocused ? '0 0 0 3px #F0EEFF' : 'none',
              transition: 'all 0.2s',
              overflow: 'hidden',
            }}
          >
            <TextArea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder={
                selectedDatasetId
                  ? '输入你的问题，按 Enter 发送…'
                  : '请先选择一个数据集…'
              }
              disabled={!selectedDatasetId || sending}
              autoSize={{ minRows: 1, maxRows: 5 }}
              style={{
                border: 'none',
                outline: 'none',
                boxShadow: 'none',
                resize: 'none',
                padding: '10px 16px',
                fontSize: 14,
                color: '#2D3142',
                background: 'transparent',
              }}
              variant="borderless"
            />
          </div>
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={() => sendMessage(inputValue)}
            disabled={!inputValue.trim() || !selectedDatasetId || sending}
            loading={sending}
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              flexShrink: 0,
              background: '#6C5CE7',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          />
        </div>
        <Text
          style={{
            display: 'block',
            textAlign: 'center',
            marginTop: 8,
            fontSize: 11,
            color: '#9CA3B4',
          }}
        >
          AI 生成内容仅供参考 · Enter 发送 · Shift+Enter 换行
        </Text>
      </div>

      {saveTarget && (
        <SaveToDashboardModal
          open={!!saveTarget}
          onClose={() => setSaveTarget(null)}
          msg={saveTarget}
          datasetId={saveTarget.dataset_id ?? selectedDatasetId ?? ''}
        />
      )}
    </div>
  )
}
