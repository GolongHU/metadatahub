import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Skeleton,
  Space,
  Table,
  Tabs,
  Typography,
  message,
} from 'antd'
import { useEffect, useState } from 'react'
import { adminApi, datasetsApi } from '../services/api'
import type {
  Dataset,
  DatasetAccessItem,
  RlsRuleItem,
  UserListItem,
} from '../types'

const { Text, Title } = Typography

const ROLE_CFG: Record<string, { label: string; bg: string; color: string }> = {
  admin:   { label: '管理员',   bg: '#F0EEFF', color: '#6C5CE7' },
  analyst: { label: '分析师',   bg: '#EFF6FF', color: '#3B82F6' },
  viewer:  { label: '查看者',   bg: '#F0FDF4', color: '#00C48C' },
  partner: { label: '合作伙伴', bg: '#FFF7ED', color: '#F97316' },
}

function RoleTag({ role }: { role: string }) {
  const cfg = ROLE_CFG[role] ?? { label: role, bg: '#F1F3F9', color: '#5F6B7A' }
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 500,
        background: cfg.bg,
        color: cfg.color,
      }}
    >
      {cfg.label}
    </span>
  )
}

// ── Tab 1: User Management ────────────────────────────────────────────────────

function UserManagementTab() {
  const [users, setUsers] = useState<UserListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()
  const [selectedRole, setSelectedRole] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await adminApi.listUsers()
      setUsers(res.data.items)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [])

  const handleToggleActive = async (user: UserListItem) => {
    try {
      await adminApi.updateUser(user.id, { is_active: !user.is_active })
      fetchUsers()
    } catch {
      message.error('操作失败')
    }
  }

  const handleAddUser = async (values: Record<string, unknown>) => {
    setSubmitting(true)
    try {
      await adminApi.createUser(values as unknown as Parameters<typeof adminApi.createUser>[0])
      message.success('用户创建成功')
      setModalOpen(false)
      form.resetFields()
      setSelectedRole('')
      fetchUsers()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? '创建失败'
      message.error(detail)
    } finally {
      setSubmitting(false)
    }
  }

  const columns = [
    { title: '姓名', dataIndex: 'name', key: 'name', width: 120 },
    { title: '邮箱', dataIndex: 'email', key: 'email' },
    {
      title: '角色', dataIndex: 'role', key: 'role', width: 110,
      render: (role: string) => <RoleTag role={role} />,
    },
    {
      title: '区域', dataIndex: 'region', key: 'region', width: 100,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: '绑定伙伴', dataIndex: 'partner_id', key: 'partner_id', width: 140,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: '状态', dataIndex: 'is_active', key: 'is_active', width: 80,
      render: (active: boolean) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
              background: active ? '#00C48C' : '#C4CBD6',
            }}
          />
          {active ? '活跃' : '停用'}
        </span>
      ),
    },
    {
      title: '操作', key: 'actions', width: 80,
      render: (_: unknown, record: UserListItem) => (
        <Button size="small" onClick={() => handleToggleActive(record)}>
          {record.is_active ? '停用' : '启用'}
        </Button>
      ),
    },
  ]

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="primary" onClick={() => setModalOpen(true)}>添加用户</Button>
      </div>
      <Table columns={columns} dataSource={users} rowKey="id" loading={loading} size="middle" />

      <Modal
        title="添加用户"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); setSelectedRole('') }}
        onOk={form.submit}
        okText="创建"
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" onFinish={handleAddUser} style={{ marginTop: 16 }}>
          <Form.Item name="name" label="姓名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, min: 6, message: '密码至少6位' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select
              onChange={(v) => setSelectedRole(v as string)}
              options={[
                { value: 'admin', label: '管理员 (admin)' },
                { value: 'analyst', label: '分析师 (analyst)' },
                { value: 'viewer', label: '查看者 (viewer)' },
                { value: 'partner', label: '合作伙伴 (partner)' },
              ]}
            />
          </Form.Item>
          {(selectedRole === 'analyst' || selectedRole === 'viewer') && (
            <Form.Item name="region" label="区域">
              <Input placeholder="例如: 华东" />
            </Form.Item>
          )}
          {selectedRole === 'partner' && (
            <Form.Item name="partner_id" label="绑定伙伴">
              <Input placeholder="例如: 阿里云" />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </>
  )
}

// ── Tab 2: Dataset Permissions ────────────────────────────────────────────────

function DatasetPermissionsTab() {
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null)
  const [accessList, setAccessList] = useState<DatasetAccessItem[]>([])
  const [rlsRules, setRlsRules] = useState<RlsRuleItem[]>([])
  const [loadingAccess, setLoadingAccess] = useState(false)
  const [loadingRls, setLoadingRls] = useState(false)
  const [addAccessOpen, setAddAccessOpen] = useState(false)
  const [addRuleOpen, setAddRuleOpen] = useState(false)
  const [accessForm] = Form.useForm()
  const [ruleForm] = Form.useForm()
  const [conditionType, setConditionType] = useState('')

  useEffect(() => {
    datasetsApi.list().then((res) => {
      setDatasets(res.data)
      if (res.data.length > 0) setSelectedDatasetId(res.data[0].id)
    })
  }, [])

  const loadDatasetData = async (id: string) => {
    setLoadingAccess(true)
    setLoadingRls(true)
    adminApi.listAccess(id).then((res) => { setAccessList(res.data); setLoadingAccess(false) })
    adminApi.listRlsRules(id).then((res) => { setRlsRules(res.data); setLoadingRls(false) })
  }

  useEffect(() => {
    if (selectedDatasetId) loadDatasetData(selectedDatasetId)
  }, [selectedDatasetId])

  const handleDeleteAccess = async (accessId: string) => {
    if (!selectedDatasetId) return
    await adminApi.deleteAccess(selectedDatasetId, accessId)
    const res = await adminApi.listAccess(selectedDatasetId)
    setAccessList(res.data)
  }

  const handleAddAccess = async (values: Record<string, unknown>) => {
    if (!selectedDatasetId) return
    try {
      await adminApi.createAccess(selectedDatasetId, values as unknown as Parameters<typeof adminApi.createAccess>[1])
      message.success('访问权限已添加')
      setAddAccessOpen(false)
      accessForm.resetFields()
      const res = await adminApi.listAccess(selectedDatasetId)
      setAccessList(res.data)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? '添加失败'
      message.error(detail)
    }
  }

  const handleDeleteRule = async (ruleId: string) => {
    await adminApi.deleteRlsRule(ruleId)
    if (selectedDatasetId) {
      const res = await adminApi.listRlsRules(selectedDatasetId)
      setRlsRules(res.data)
    }
  }

  const handleAddRule = async (values: Record<string, unknown>) => {
    if (!selectedDatasetId) return
    try {
      await adminApi.createRlsRule(selectedDatasetId, values as unknown as Parameters<typeof adminApi.createRlsRule>[1])
      message.success('规则已创建')
      setAddRuleOpen(false)
      ruleForm.resetFields()
      setConditionType('')
      const res = await adminApi.listRlsRules(selectedDatasetId)
      setRlsRules(res.data)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? '创建失败'
      message.error(detail)
    }
  }

  const accessColumns = [
    { title: '授权对象', dataIndex: 'grantee_id', key: 'grantee_id' },
    {
      title: '类型', dataIndex: 'grantee_type', key: 'grantee_type', width: 80,
      render: (t: string) => t === 'role' ? '角色' : '用户',
    },
    { title: '权限级别', dataIndex: 'access_level', key: 'access_level', width: 100 },
    {
      title: '操作', key: 'actions', width: 80,
      render: (_: unknown, record: DatasetAccessItem) => (
        <Button size="small" danger onClick={() => handleDeleteAccess(record.id)}>删除</Button>
      ),
    },
  ]

  const ROLE_OPTIONS = [
    { value: 'analyst', label: 'analyst' },
    { value: 'viewer', label: 'viewer' },
    { value: 'partner', label: 'partner' },
    { value: 'admin', label: 'admin' },
  ]

  return (
    <div>
      {/* Dataset selector */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Text strong>数据集：</Text>
        <Select
          style={{ width: 300 }}
          value={selectedDatasetId}
          onChange={setSelectedDatasetId}
          options={datasets.map((d) => ({ value: d.id, label: d.name }))}
          placeholder="选择数据集"
        />
      </div>

      {selectedDatasetId && (
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          {/* Access control */}
          <Card
            title="区域 A — 访问控制"
            size="small"
            extra={
              <Button size="small" onClick={() => setAddAccessOpen(true)}>添加授权</Button>
            }
          >
            <Table
              columns={accessColumns}
              dataSource={accessList}
              rowKey="id"
              loading={loadingAccess}
              size="small"
              pagination={false}
            />
          </Card>

          {/* RLS rules */}
          <Card
            title="区域 B — 行级安全规则"
            size="small"
            extra={
              <Button size="small" type="primary" onClick={() => setAddRuleOpen(true)}>添加规则</Button>
            }
          >
            {loadingRls ? (
              <Skeleton active paragraph={{ rows: 2 }} />
            ) : rlsRules.length === 0 ? (
              <Empty description="暂无规则" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              rlsRules.map((rule) => (
                <div
                  key={rule.id}
                  style={{
                    border: '1px solid #E8ECF3',
                    borderRadius: 12,
                    padding: '14px 18px',
                    marginBottom: 10,
                    background: '#FAFBFD',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 12,
                  }}
                >
                  <div>
                    <Text strong>📏 {rule.name}</Text>
                    <div style={{ marginTop: 6, fontSize: 13, color: '#5F6B7A' }}>
                      字段: <code style={{ background: '#F0EEFF', padding: '1px 5px', borderRadius: 4 }}>{rule.field}</code>
                      {' · '}操作: <code style={{ background: '#F0EEFF', padding: '1px 5px', borderRadius: 4 }}>{rule.operator}</code>
                      {' · '}值源: <code style={{ background: '#F0EEFF', padding: '1px 5px', borderRadius: 4 }}>{rule.value_source}</code>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 12, color: '#9CA3B4' }}>
                      {rule.applies_to_roles?.length ? `适用: ${rule.applies_to_roles.join(', ')}` : '适用: 全部角色'}
                      {rule.exempt_roles?.length ? ` · 豁免: ${rule.exempt_roles.join(', ')}` : ''}
                    </div>
                  </div>
                  <Button size="small" danger onClick={() => handleDeleteRule(rule.id)}>删除</Button>
                </div>
              ))
            )}
          </Card>
        </Space>
      )}

      {/* Add Access Modal */}
      <Modal
        title="添加访问权限"
        open={addAccessOpen}
        onCancel={() => { setAddAccessOpen(false); accessForm.resetFields() }}
        onOk={accessForm.submit}
        okText="添加"
      >
        <Form form={accessForm} layout="vertical" onFinish={handleAddAccess} style={{ marginTop: 16 }}>
          <Form.Item name="grantee_type" label="授权类型" rules={[{ required: true }]}>
            <Select options={[{ value: 'role', label: '角色 (role)' }, { value: 'user', label: '用户 (user)' }]} />
          </Form.Item>
          <Form.Item name="grantee_id" label="角色名 / 用户ID" rules={[{ required: true }]}>
            <Input placeholder="如: analyst 或 用户UUID" />
          </Form.Item>
          <Form.Item name="access_level" label="权限级别" initialValue="read">
            <Select options={[{ value: 'read', label: '只读 (read)' }, { value: 'admin', label: '管理 (admin)' }]} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Add RLS Rule Modal */}
      <Modal
        title="添加行级安全规则"
        open={addRuleOpen}
        onCancel={() => { setAddRuleOpen(false); ruleForm.resetFields(); setConditionType('') }}
        onOk={ruleForm.submit}
        okText="创建"
        width={560}
      >
        <Form form={ruleForm} layout="vertical" onFinish={handleAddRule} style={{ marginTop: 16 }}>
          <Form.Item name="name" label="规则名称" rules={[{ required: true }]}>
            <Input placeholder="如: 按区域过滤" />
          </Form.Item>
          <Form.Item name="field" label="过滤字段" rules={[{ required: true }]}>
            <Input placeholder="数据集中的列名，如: 业务单元" />
          </Form.Item>
          <Form.Item name="condition_type" label="条件类型" rules={[{ required: true }]}>
            <Select
              onChange={(v) => setConditionType(v as string)}
              options={[
                { value: 'attribute_match', label: 'attribute_match — 匹配用户属性' },
                { value: 'self_match', label: 'self_match — 匹配自身ID' },
                { value: 'value_list', label: 'value_list — 固定值列表' },
              ]}
            />
          </Form.Item>
          <Form.Item name="operator" label="操作符" rules={[{ required: true }]}>
            <Select options={[
              { value: 'eq', label: 'eq — 等于' },
              { value: 'like', label: 'like — 模糊包含' },
              { value: 'not_eq', label: 'not_eq — 不等于' },
              { value: 'in', label: 'in — 包含于' },
            ]} />
          </Form.Item>
          <Form.Item name="value_source" label="值来源" rules={[{ required: true }]}>
            {conditionType === 'value_list' ? (
              <Input placeholder="多个值用逗号分隔，如: 华东,华西" />
            ) : (
              <Select options={[
                { value: 'user.region', label: 'user.region — 用户区域' },
                { value: 'user.partner_id', label: 'user.partner_id — 合作伙伴' },
                { value: 'user.department', label: 'user.department — 部门' },
              ]} />
            )}
          </Form.Item>
          <Form.Item name="applies_to_roles" label="适用角色（留空=全部）">
            <Select mode="multiple" options={ROLE_OPTIONS} />
          </Form.Item>
          <Form.Item name="exempt_roles" label="豁免角色">
            <Select mode="multiple" options={ROLE_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PermissionPage() {
  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ marginBottom: 24 }}>权限管理</Title>
      <Tabs
        items={[
          { key: 'users', label: '用户管理', children: <UserManagementTab /> },
          { key: 'datasets', label: '数据权限规则', children: <DatasetPermissionsTab /> },
        ]}
      />
    </div>
  )
}
