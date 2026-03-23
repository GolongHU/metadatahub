import {
  CheckCircleFilled, CloseCircleFilled, DeleteOutlined,
  EditOutlined, EyeInvisibleOutlined, EyeOutlined,
  ExperimentOutlined, PlusOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import {
  Button, Form, Input, message, Modal, Select, Spin, Tag,
  Tooltip, Typography,
} from 'antd'
import { useEffect, useState } from 'react'
import { aiAdminApi } from '../../services/api'
import { useThemeStore } from '../../stores/themeStore'
import type { AIProviderOut, ModelInfo, TaskRoutingOut } from '../../types'

const { Text } = Typography

// ── Provider presets ─────────────────────────────────────────────────────────

interface ProviderPreset {
  label: string
  base_url: string
  provider_type: string
  default_models: ModelInfo[]
}

const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  kimi: {
    label: 'Kimi (Moonshot)',
    base_url: 'https://api.moonshot.cn/v1',
    provider_type: 'openai_compatible',
    default_models: [
      { id: 'moonshot-v1-8k',  name: 'Kimi 8K',  context_window: 8000 },
      { id: 'moonshot-v1-32k', name: 'Kimi 32K', context_window: 32000 },
      { id: 'moonshot-v1-128k',name: 'Kimi 128K',context_window: 128000 },
    ],
  },
  openai: {
    label: 'OpenAI (GPT)',
    base_url: 'https://api.openai.com/v1',
    provider_type: 'openai_compatible',
    default_models: [
      { id: 'gpt-4o',      name: 'GPT-4o',      context_window: 128000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', context_window: 128000 },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', context_window: 16000 },
    ],
  },
  deepseek: {
    label: 'DeepSeek',
    base_url: 'https://api.deepseek.com/v1',
    provider_type: 'openai_compatible',
    default_models: [
      { id: 'deepseek-chat',  name: 'DeepSeek Chat',  context_window: 64000 },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1', context_window: 64000 },
    ],
  },
  anthropic: {
    label: 'Anthropic (Claude)',
    base_url: 'https://api.anthropic.com',
    provider_type: 'anthropic',
    default_models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', context_window: 200000 },
      { id: 'claude-opus-4-6',   name: 'Claude Opus 4.6',   context_window: 200000 },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', context_window: 200000 },
    ],
  },
  qwen: {
    label: 'Qwen (通义千问)',
    base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    provider_type: 'openai_compatible',
    default_models: [
      { id: 'qwen-turbo', name: 'Qwen Turbo', context_window: 128000 },
      { id: 'qwen-plus',  name: 'Qwen Plus',  context_window: 128000 },
      { id: 'qwen-max',   name: 'Qwen Max',   context_window: 32000 },
    ],
  },
  ollama: {
    label: '本地模型 (Ollama)',
    base_url: 'http://localhost:11434/v1',
    provider_type: 'openai_compatible',
    default_models: [
      { id: 'llama3.2', name: 'Llama 3.2', context_window: 128000 },
    ],
  },
  custom: {
    label: '自定义',
    base_url: '',
    provider_type: 'openai_compatible',
    default_models: [],
  },
}

const TASK_LABELS: Record<string, string> = {
  nl2sql:         '自然语言转 SQL',
  summary:        '数据摘要生成',
  chart_suggest:  '图表类型推荐',
  schema_describe:'字段描述生成',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ProviderTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    openai_compatible: '#3B82F6',
    anthropic: '#9C6C45',
    custom: '#6C5CE7',
  }
  return (
    <Tag style={{ border: 'none', background: `${colors[type] ?? '#9CA3B4'}22`, color: colors[type] ?? '#9CA3B4', fontSize: 10 }}>
      {type}
    </Tag>
  )
}

// ── Provider card ─────────────────────────────────────────────────────────────

function ProviderCard({
  provider, isDark, onEdit, onDelete,
}: {
  provider: AIProviderOut
  isDark: boolean
  onEdit: (p: AIProviderOut) => void
  onDelete: (id: string) => void
}) {
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [testing, setTesting] = useState(false)

  async function doTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await aiAdminApi.testProvider(provider.id)
      if (res.data.success) {
        setTestResult({ ok: true, msg: `连通成功 · ${res.data.latency_ms}ms` })
      } else {
        setTestResult({ ok: false, msg: res.data.error ?? '未知错误' })
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setTestResult({ ok: false, msg: err?.response?.data?.detail ?? '请求失败' })
    } finally {
      setTesting(false)
    }
  }

  const cardBg = isDark ? 'rgba(26,29,46,0.5)' : 'rgba(255,255,255,0.8)'
  const border = isDark ? 'rgba(162,155,254,0.10)' : 'rgba(108,92,231,0.08)'

  return (
    <div style={{
      background: cardBg, border: `1px solid ${border}`,
      borderRadius: 12, padding: '14px 16px', marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: provider.is_active ? '#00C48C' : '#9CA3B4', flexShrink: 0,
            }} />
            <span style={{ fontWeight: 600, fontSize: 13, color: isDark ? '#E8ECF3' : '#1A1D2E' }}>
              {provider.name}
            </span>
            <ProviderTypeBadge type={provider.provider_type} />
          </div>
          <div style={{ fontSize: 11, color: '#9CA3B4', marginBottom: 6, fontFamily: 'monospace' }}>
            {provider.base_url}
          </div>
          <div style={{ fontSize: 11, color: '#9CA3B4', marginBottom: 6 }}>
            API Key: <span style={{ fontFamily: 'monospace' }}>{provider.api_key_masked}</span>
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {provider.models.map(m => (
              <Tag key={m.id} style={{ fontSize: 10, padding: '0 6px', border: 'none',
                background: isDark ? 'rgba(162,155,254,0.1)' : 'rgba(108,92,231,0.07)',
                color: isDark ? '#A29BFE' : '#6C5CE7' }}>
                {m.name}
              </Tag>
            ))}
          </div>
          {testResult && (
            <div style={{ marginTop: 8, fontSize: 11,
              color: testResult.ok ? '#00C48C' : '#EF4444', display: 'flex', alignItems: 'center', gap: 4 }}>
              {testResult.ok
                ? <CheckCircleFilled />
                : <CloseCircleFilled />}
              {testResult.msg}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <Tooltip title="测试连通性">
            <Button size="small" loading={testing} icon={<ThunderboltOutlined />} onClick={doTest} />
          </Tooltip>
          <Tooltip title="编辑">
            <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(provider)} />
          </Tooltip>
          <Tooltip title="删除">
            <Button size="small" danger icon={<DeleteOutlined />}
              onClick={() => Modal.confirm({
                title: `删除 ${provider.name}？`,
                content: '删除后无法恢复，关联的任务路由将失效。',
                okText: '删除', okType: 'danger', cancelText: '取消',
                onOk: () => onDelete(provider.id),
              })} />
          </Tooltip>
        </div>
      </div>
    </div>
  )
}

// ── Add/Edit Modal ────────────────────────────────────────────────────────────

function ProviderModal({
  open, editing, onClose, onSaved,
}: {
  open: boolean
  editing: AIProviderOut | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form] = Form.useForm()
  const [presetKey, setPresetKey] = useState<string>('custom')
  const [showKey, setShowKey] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      if (editing) {
        form.setFieldsValue({
          name: editing.name,
          provider_type: editing.provider_type,
          base_url: editing.base_url,
          api_key: '',
          models_raw: editing.models.map(m => m.id).join(', '),
        })
        setPresetKey('custom')
      } else {
        form.resetFields()
        setPresetKey('custom')
      }
      setShowKey(false)
    }
  }, [open, editing]) // eslint-disable-line react-hooks/exhaustive-deps

  function applyPreset(key: string) {
    const p = PROVIDER_PRESETS[key]
    if (!p) return
    setPresetKey(key)
    form.setFieldsValue({
      name: p.label,
      provider_type: p.provider_type,
      base_url: p.base_url,
      models_raw: p.default_models.map(m => m.id).join(', '),
    })
  }

  async function handleSubmit() {
    const values = await form.validateFields()
    setLoading(true)
    try {
      const preset = PROVIDER_PRESETS[presetKey]
      const modelIds = (values.models_raw as string).split(',').map((s: string) => s.trim()).filter(Boolean)
      const presetModels = preset?.default_models ?? []
      const models: ModelInfo[] = modelIds.map(id => {
        const found = presetModels.find(m => m.id === id)
        return found ?? { id, name: id, context_window: 8000 }
      })

      if (editing) {
        const updateData: Record<string, unknown> = {
          name: values.name,
          provider_type: values.provider_type,
          base_url: values.base_url,
          models,
        }
        if (values.api_key) updateData.api_key = values.api_key
        await aiAdminApi.updateProvider(editing.id, updateData)
        message.success('供应商已更新')
      } else {
        await aiAdminApi.createProvider({
          name: values.name,
          provider_type: values.provider_type,
          base_url: values.base_url,
          api_key: values.api_key,
          models,
        })
        message.success('供应商已添加')
      }
      onSaved()
      onClose()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      message.error(err?.response?.data?.detail ?? '操作失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      title={editing ? '编辑供应商' : '添加 AI 供应商'}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={loading}
      okText={editing ? '保存' : '添加'}
      cancelText="取消"
      width={480}
    >
      {!editing && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: '#9CA3B4', marginBottom: 6 }}>
            快速选择供应商
          </div>
          <Select
            style={{ width: '100%' }}
            value={presetKey}
            onChange={applyPreset}
            options={Object.entries(PROVIDER_PRESETS).map(([k, p]) => ({ value: k, label: p.label }))}
          />
        </div>
      )}
      <Form form={form} layout="vertical" size="small">
        <Form.Item name="name" label="名称" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="provider_type" label="类型" rules={[{ required: true }]}>
          <Select options={[
            { value: 'openai_compatible', label: 'OpenAI Compatible' },
            { value: 'anthropic', label: 'Anthropic' },
            { value: 'custom', label: 'Custom' },
          ]} />
        </Form.Item>
        <Form.Item name="base_url" label="Base URL" rules={[{ required: true }]}>
          <Input placeholder="https://api.example.com/v1" />
        </Form.Item>
        <Form.Item
          name="api_key"
          label="API Key"
          rules={editing ? [] : [{ required: true, message: '请输入 API Key' }]}
        >
          <Input
            type={showKey ? 'text' : 'password'}
            placeholder={editing ? '留空表示不修改' : 'sk-...'}
            suffix={
              showKey
                ? <EyeInvisibleOutlined onClick={() => setShowKey(false)} style={{ cursor: 'pointer', color: '#9CA3B4' }} />
                : <EyeOutlined onClick={() => setShowKey(true)} style={{ cursor: 'pointer', color: '#9CA3B4' }} />
            }
          />
        </Form.Item>
        <Form.Item name="models_raw" label="模型列表（逗号分隔 ID）" rules={[{ required: true }]}>
          <Input.TextArea rows={2} placeholder="moonshot-v1-8k, moonshot-v1-32k" />
        </Form.Item>
      </Form>
    </Modal>
  )
}

// ── Test Sandbox ──────────────────────────────────────────────────────────────

function TestSandbox({ providers }: { providers: AIProviderOut[] }) {
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const [providerId, setProviderId] = useState<string | undefined>()
  const [systemPrompt, setSystemPrompt] = useState(
    '你是一个 SQL 生成助手，为 MetadataHub 分析平台工作。请根据用户问题生成 DuckDB SQL，只返回 JSON：{"sql":"...","explanation":"...","chart_type":"..."}'
  )
  const [userPrompt, setUserPrompt]  = useState('各区域的总营收是多少？')
  const [loading, setLoading]        = useState(false)
  const [result, setResult]          = useState<{ text: string; latency: number } | null>(null)
  const [error, setError]            = useState<string | null>(null)

  const cardBg = isDark ? 'rgba(26,29,46,0.5)' : 'rgba(255,255,255,0.8)'
  const border = isDark ? 'rgba(162,155,254,0.10)' : 'rgba(108,92,231,0.08)'
  const textareaStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 8, resize: 'vertical',
    fontSize: 12, fontFamily: 'monospace', lineHeight: 1.6,
    background: isDark ? 'rgba(10,12,20,0.5)' : 'rgba(248,249,252,0.8)',
    border: `1px solid ${isDark ? 'rgba(162,155,254,0.12)' : '#E8ECF3'}`,
    color: isDark ? '#E8ECF3' : '#1A1D2E', outline: 'none',
  }

  async function handleSend() {
    if (!providerId) { message.warning('请先选择供应商'); return }
    setLoading(true); setResult(null); setError(null)
    try {
      const fullPrompt = `[System]\n${systemPrompt}\n\n[User]\n${userPrompt}`
      const res = await aiAdminApi.testProvider(providerId, fullPrompt)
      if (res.data.success) {
        setResult({ text: res.data.response ?? '', latency: res.data.latency_ms })
      } else {
        setError(res.data.error ?? '未知错误')
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setError(err?.response?.data?.detail ?? '请求失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: 20 }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14,
        color: isDark ? '#E8ECF3' : '#1A1D2E', display: 'flex', alignItems: 'center', gap: 8 }}>
        <ExperimentOutlined /> 测试沙盒
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: '#9CA3B4', marginBottom: 4 }}>供应商</div>
          <Select
            style={{ width: '100%' }}
            placeholder="选择供应商"
            value={providerId}
            onChange={setProviderId}
            options={providers.filter(p => p.is_active).map(p => ({ value: p.id, label: p.name }))}
          />
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: '#9CA3B4', marginBottom: 4 }}>System Prompt</div>
        <textarea
          value={systemPrompt}
          onChange={e => setSystemPrompt(e.target.value)}
          rows={3}
          style={textareaStyle}
        />
      </div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: '#9CA3B4', marginBottom: 4 }}>User Prompt</div>
        <textarea
          value={userPrompt}
          onChange={e => setUserPrompt(e.target.value)}
          rows={2}
          style={textareaStyle}
        />
      </div>

      <Button type="primary" loading={loading} onClick={handleSend} icon={<ThunderboltOutlined />}>
        发送测试
      </Button>

      {(result || error) && (
        <div style={{
          marginTop: 14,
          background: isDark ? 'rgba(10,12,20,0.6)' : 'rgba(248,249,252,0.9)',
          borderRadius: 8,
          border: `1px solid ${error ? '#EF444440' : (isDark ? 'rgba(162,155,254,0.12)' : '#E8ECF3')}`,
          padding: 12,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: '#9CA3B4', marginBottom: 6 }}>
            Response
          </div>
          {error ? (
            <Text type="danger" style={{ fontSize: 12 }}>{error}</Text>
          ) : (
            <>
              <pre style={{ margin: 0, fontSize: 11, fontFamily: 'monospace',
                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                color: isDark ? '#E8ECF3' : '#1A1D2E', maxHeight: 200, overflow: 'auto' }}>
                {result!.text}
              </pre>
              <div style={{ marginTop: 8, fontSize: 11, color: '#9CA3B4' }}>
                Latency: {result!.latency}ms
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function AIModelsTab() {
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  const [providers, setProviders]       = useState<AIProviderOut[]>([])
  const [routing, setRouting]           = useState<TaskRoutingOut[]>([])
  const [loadingProviders, setLoadingProviders] = useState(true)
  const [savingRouting, setSavingRouting] = useState(false)

  // Modal state
  const [modalOpen, setModalOpen]   = useState(false)
  const [editingProvider, setEditingProvider] = useState<AIProviderOut | null>(null)

  // Local routing edits
  const [routingEdits, setRoutingEdits] = useState<Record<string, Partial<TaskRoutingOut>>>({})

  async function reload() {
    setLoadingProviders(true)
    try {
      const [pRes, rRes] = await Promise.all([
        aiAdminApi.listProviders(),
        aiAdminApi.getTaskRouting(),
      ])
      setProviders(pRes.data)
      setRouting(rRes.data)
    } finally {
      setLoadingProviders(false)
    }
  }

  useEffect(() => { reload() }, [])

  async function handleDeleteProvider(id: string) {
    try {
      await aiAdminApi.deleteProvider(id)
      message.success('已删除')
      reload()
    } catch {
      message.error('删除失败')
    }
  }

  async function handleSaveRouting() {
    setSavingRouting(true)
    try {
      const updated = routing.map(r => ({
        task_type: r.task_type,
        primary_provider_id: (routingEdits[r.task_type]?.primary_provider_id ?? r.primary_provider_id) || null,
        primary_model: routingEdits[r.task_type]?.primary_model ?? r.primary_model,
        fallback_provider_id: (routingEdits[r.task_type]?.fallback_provider_id ?? r.fallback_provider_id) || null,
        fallback_model: routingEdits[r.task_type]?.fallback_model ?? r.fallback_model ?? null,
        temperature: r.temperature,
        max_tokens: r.max_tokens,
        is_active: r.is_active,
      }))
      const res = await aiAdminApi.updateTaskRouting(updated)
      setRouting(res.data)
      setRoutingEdits({})
      message.success('路由配置已保存')
    } catch {
      message.error('保存失败')
    } finally {
      setSavingRouting(false)
    }
  }

  // Build model options for routing selects: "Provider Name / model-id"
  const modelOptions = [
    { value: '__none__', label: '无' },
    ...providers.filter(p => p.is_active).flatMap(p =>
      p.models.map(m => ({
        value: `${p.id}::${m.id}`,
        label: `${p.name} / ${m.name}`,
      }))
    ),
  ]

  function getRoutingValue(r: TaskRoutingOut, field: 'primary' | 'fallback'): string {
    const edit = routingEdits[r.task_type]
    const pid = field === 'primary'
      ? (edit?.primary_provider_id ?? r.primary_provider_id)
      : (edit?.fallback_provider_id ?? r.fallback_provider_id)
    const mid = field === 'primary'
      ? (edit?.primary_model ?? r.primary_model)
      : (edit?.fallback_model ?? r.fallback_model)
    if (!pid || !mid) return '__none__'
    return `${pid}::${mid}`
  }

  function setRoutingValue(taskType: string, field: 'primary' | 'fallback', value: string) {
    if (value === '__none__') {
      setRoutingEdits(prev => ({
        ...prev,
        [taskType]: {
          ...prev[taskType],
          [`${field}_provider_id`]: null,
          [`${field}_model`]: null,
        },
      }))
    } else {
      const [pid, mid] = value.split('::')
      setRoutingEdits(prev => ({
        ...prev,
        [taskType]: {
          ...prev[taskType],
          [`${field}_provider_id`]: pid,
          [`${field}_model`]: mid,
        },
      }))
    }
  }

  const cardBg = isDark ? 'rgba(26,29,46,0.5)' : 'rgba(255,255,255,0.8)'
  const border = isDark ? 'rgba(162,155,254,0.10)' : 'rgba(108,92,231,0.08)'
  const sectionTitle: React.CSSProperties = {
    fontWeight: 600, fontSize: 13, marginBottom: 14,
    color: isDark ? '#E8ECF3' : '#1A1D2E',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  }

  if (loadingProviders) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin /></div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Provider list ─────────────────────────────────────── */}
      <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: 20 }}>
        <div style={sectionTitle}>
          <span>AI 模型供应商</span>
          <Button type="primary" size="small" icon={<PlusOutlined />}
            onClick={() => { setEditingProvider(null); setModalOpen(true) }}>
            添加
          </Button>
        </div>

        {providers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: '#9CA3B4', fontSize: 13 }}>
            暂无供应商，点击「添加」配置第一个 AI 模型供应商
          </div>
        ) : (
          providers.map(p => (
            <ProviderCard
              key={p.id}
              provider={p}
              isDark={isDark}
              onEdit={provider => { setEditingProvider(provider); setModalOpen(true) }}
              onDelete={handleDeleteProvider}
            />
          ))
        )}
      </div>

      {/* ── Task routing ───────────────────────────────────────── */}
      <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: 20 }}>
        <div style={sectionTitle}>
          <span>任务路由</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['任务', '主模型', '备用模型'].map(h => (
                  <th key={h} style={{
                    textAlign: 'left', padding: '6px 10px',
                    fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                    letterSpacing: '0.06em', color: '#9CA3B4',
                    borderBottom: `1px solid ${isDark ? 'rgba(162,155,254,0.08)' : '#E8ECF3'}`,
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {routing.map(r => (
                <tr key={r.task_type}>
                  <td style={{ padding: '10px 10px', fontSize: 13,
                    color: isDark ? '#E8ECF3' : '#1A1D2E',
                    borderBottom: `1px solid ${isDark ? 'rgba(162,155,254,0.05)' : '#F1F3F9'}` }}>
                    {TASK_LABELS[r.task_type] ?? r.task_type}
                  </td>
                  <td style={{ padding: '6px 10px',
                    borderBottom: `1px solid ${isDark ? 'rgba(162,155,254,0.05)' : '#F1F3F9'}` }}>
                    <Select
                      size="small" style={{ width: 200 }}
                      value={getRoutingValue(r, 'primary')}
                      onChange={v => setRoutingValue(r.task_type, 'primary', v)}
                      options={modelOptions.filter(o => o.value !== '__none__')}
                    />
                  </td>
                  <td style={{ padding: '6px 10px',
                    borderBottom: `1px solid ${isDark ? 'rgba(162,155,254,0.05)' : '#F1F3F9'}` }}>
                    <Select
                      size="small" style={{ width: 200 }}
                      value={getRoutingValue(r, 'fallback')}
                      onChange={v => setRoutingValue(r.task_type, 'fallback', v)}
                      options={modelOptions}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 14 }}>
          <Button type="primary" loading={savingRouting} onClick={handleSaveRouting}>
            保存路由配置
          </Button>
        </div>
      </div>

      {/* ── Test sandbox ───────────────────────────────────────── */}
      <TestSandbox providers={providers} />

      {/* ── Modal ──────────────────────────────────────────────── */}
      <ProviderModal
        open={modalOpen}
        editing={editingProvider}
        onClose={() => setModalOpen(false)}
        onSaved={reload}
      />
    </div>
  )
}
