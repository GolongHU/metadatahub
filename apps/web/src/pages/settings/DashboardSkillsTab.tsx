import { useEffect, useState } from 'react'
import {
  Button, Form, Input, Modal, Switch, Table, Tag, Tooltip, message,
} from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import api from '../../services/api'

interface SkillOut {
  id: string
  name: string
  description: string | null
  category: string | null
  trigger_keywords: string[]
  analysis_prompt: string | null
  design_notes: string | null
  is_builtin: boolean
  is_active: boolean
  sort_order: number
}

const CATEGORY_COLOR: Record<string, string> = {
  health: 'volcano',
  sales: 'blue',
  scoring: 'purple',
}

export default function DashboardSkillsTab() {
  const [skills, setSkills] = useState<SkillOut[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<SkillOut | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get<SkillOut[]>('/admin/dashboard-skills')
      setSkills(res.data)
    } catch {
      message.error('加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (skill: SkillOut) => {
    setEditing(skill)
    form.setFieldsValue({
      ...skill,
      trigger_keywords: skill.trigger_keywords.join(', '),
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    const values = await form.validateFields()
    const keywords = (values.trigger_keywords || '')
      .split(/[,，\s]+/)
      .map((k: string) => k.trim())
      .filter(Boolean)
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/admin/dashboard-skills/${editing.id}`, {
          name: values.name,
          description: values.description || null,
          category: values.category || null,
          trigger_keywords: keywords,
          analysis_prompt: values.analysis_prompt || null,
          design_notes: values.design_notes || null,
          sort_order: Number(values.sort_order) || 0,
        })
        message.success('已更新')
      } else {
        await api.post('/admin/dashboard-skills', {
          id: values.id,
          name: values.name,
          description: values.description || null,
          category: values.category || null,
          trigger_keywords: keywords,
          analysis_prompt: values.analysis_prompt || null,
          design_notes: values.design_notes || null,
          sort_order: Number(values.sort_order) || 0,
        })
        message.success('已创建')
      }
      setModalOpen(false)
      load()
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      message.error(detail || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (skill: SkillOut, active: boolean) => {
    try {
      await api.put(`/admin/dashboard-skills/${skill.id}`, { is_active: active })
      setSkills((prev) => prev.map((s) => s.id === skill.id ? { ...s, is_active: active } : s))
    } catch {
      message.error('操作失败')
    }
  }

  const handleDelete = (skill: SkillOut) => {
    Modal.confirm({
      title: `删除 Skill「${skill.name}」？`,
      content: '删除后无法恢复。内置 Skill 无法删除，请改为禁用。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.delete(`/admin/dashboard-skills/${skill.id}`)
          message.success('已删除')
          load()
        } catch (e: unknown) {
          const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
          message.error(detail || '删除失败')
        }
      },
    })
  }

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 160,
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#9CA3B4' }}>{v}</span>,
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (v: string, s: SkillOut) => (
        <span>
          {v}
          {s.is_builtin && <Tag style={{ marginLeft: 6 }} color="default">内置</Tag>}
        </span>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 90,
      render: (v: string | null) => v ? <Tag color={CATEGORY_COLOR[v] || 'default'}>{v}</Tag> : '—',
    },
    {
      title: '触发关键词',
      dataIndex: 'trigger_keywords',
      key: 'trigger_keywords',
      render: (v: string[]) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {v.map((kw) => <Tag key={kw} style={{ fontSize: 11, margin: 0 }}>{kw}</Tag>)}
        </div>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (v: string | null) => v || '—',
    },
    {
      title: '排序',
      dataIndex: 'sort_order',
      key: 'sort_order',
      width: 60,
    },
    {
      title: '启用',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 70,
      render: (v: boolean, s: SkillOut) => (
        <Switch size="small" checked={v} onChange={(checked) => handleToggle(s, checked)} />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 90,
      render: (_: unknown, s: SkillOut) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <Tooltip title="编辑">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(s)} />
          </Tooltip>
          <Tooltip title={s.is_builtin ? '内置 Skill 不可删除' : '删除'}>
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={s.is_builtin}
              onClick={() => handleDelete(s)}
            />
          </Tooltip>
        </div>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>看板 Skill 模板</div>
          <div style={{ fontSize: 12, color: '#9CA3B4', marginTop: 2 }}>
            Skill 用于引导 AI 代码看板生成，定义分析重点、触发关键词和设计规范
          </div>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}
          style={{ background: '#6C5CE7', border: 'none' }}>
          新建 Skill
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={skills}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={false}
      />

      <Modal
        open={modalOpen}
        title={editing ? `编辑 Skill — ${editing.name}` : '新建 Skill'}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          {!editing && (
            <Form.Item name="id" label="ID（英文，唯一标识）" rules={[{ required: true, message: '必填' }]}>
              <Input placeholder="例如：my_skill_id" />
            </Form.Item>
          )}
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '必填' }]}>
            <Input placeholder="例如：合同分析看板" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="category" label="分类">
              <Input placeholder="health / sales / scoring / ..." />
            </Form.Item>
            <Form.Item name="sort_order" label="排序">
              <Input type="number" placeholder="0" />
            </Form.Item>
          </div>
          <Form.Item name="trigger_keywords" label="触发关键词（逗号分隔）">
            <Input placeholder="例如：合同, 签约, 回款" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="简短描述此 Skill 的用途" />
          </Form.Item>
          <Form.Item name="analysis_prompt" label="分析提示词（指导 AI 分析方向）">
            <Input.TextArea rows={4} placeholder="例如：重点关注：1.合同金额分布 2.签约率趋势 3.按负责人追踪" />
          </Form.Item>
          <Form.Item name="design_notes" label="设计规范（指导 AI 生成布局和风格，留空使用默认）">
            <Input.TextArea rows={3} placeholder="例如：使用红色系表示风险，KPI 卡片优先展示" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
