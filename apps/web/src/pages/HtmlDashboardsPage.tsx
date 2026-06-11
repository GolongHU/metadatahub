import {
  CodeOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import {
  Button,
  Collapse,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import type { UploadFile } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { datasetsApi, htmlDashboardsApi } from '../services/api'
import type { Dataset, HtmlDashboardItem } from '../types'
import { useThemeStore } from '../stores/themeStore'

const { Title, Text } = Typography

const CODE_EXAMPLE = `<!-- 平台会自动注入以下全局变量 -->
<script>
// window.MH_DATASETS — 所有绑定数据集的完整数据
// 格式: { "<dataset_id>": { name, columns: [...], rows: [[...], ...] } }

// window.MH_DATA — 按数据集名称快速访问
// 格式: { "数据集名称": { name, columns, rows } }

// 示例：把第一个数据集转成对象数组
var firstDs = Object.values(window.MH_DATASETS)[0];
if (firstDs) {
  var records = firstDs.rows.map(function(row) {
    var obj = {};
    firstDs.columns.forEach(function(col, i) { obj[col] = row[i]; });
    return obj;
  });
  console.log(records); // [{ 字段1: 值, 字段2: 值 }, ...]
}

// 如果填写了「数据初始化函数」，该函数会在数据加载后自动调用：
function processNewData(records) {
  // records 即上面的对象数组
  renderChart(records);
}
</script>`

export default function HtmlDashboardsPage() {
  const navigate = useNavigate()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  const [dashboards, setDashboards] = useState<HtmlDashboardItem[]>([])
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [form] = Form.useForm()

  // Edit datasets modal
  const [editTarget, setEditTarget] = useState<HtmlDashboardItem | null>(null)
  const [editForm] = Form.useForm()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      htmlDashboardsApi.list(),
      datasetsApi.list(),
    ]).then(([dRes, dsRes]) => {
      setDashboards(dRes.data)
      setDatasets(dsRes.data)
    }).finally(() => setLoading(false))
  }, [])

  const handleUpload = async () => {
    try {
      const values = await form.validateFields()
      if (!fileList[0]?.originFileObj) {
        message.error('请选择 HTML 文件')
        return
      }
      setUploading(true)
      const res = await htmlDashboardsApi.upload(
        fileList[0].originFileObj,
        values.name,
        values.description || '',
        values.dataset_ids || [],
        values.init_function_name || undefined,
      )
      setDashboards((prev) => [res.data, ...prev])
      setUploadOpen(false)
      form.resetFields()
      setFileList([])
      message.success('上传成功')
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error('上传失败')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await htmlDashboardsApi.delete(id)
      setDashboards((prev) => prev.filter((d) => d.id !== id))
      setConfirmId(null)
      message.success('已删除')
    } catch {
      message.error('删除失败')
    }
  }

  const openEdit = (d: HtmlDashboardItem) => {
    setEditTarget(d)
    editForm.setFieldsValue({
      dataset_ids: d.dataset_ids,
      init_function_name: d.init_function_name ?? '',
    })
  }

  const handleSaveEdit = async () => {
    if (!editTarget) return
    try {
      const values = await editForm.validateFields()
      setSaving(true)
      const res = await htmlDashboardsApi.update(editTarget.id, {
        dataset_ids: values.dataset_ids || [],
        init_function_name: values.init_function_name || undefined,
      })
      setDashboards((prev) => prev.map((d) => d.id === editTarget.id ? res.data : d))
      setEditTarget(null)
      message.success('已保存')
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const cardBg = isDark ? '#1A1D2E' : '#FFFFFF'
  const borderColor = isDark ? 'rgba(162,155,254,0.12)' : '#E8ECF3'
  const textPrimary = isDark ? '#E8ECF3' : '#1A1D2E'
  const textSecondary = isDark ? '#9CA3B4' : '#5F6B7A'

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <Title level={3} style={{ margin: 0, color: textPrimary }}>HTML 看板</Title>
          <Text style={{ color: textSecondary, fontSize: 13 }}>上传 HTML 文件并绑定数据集，看板可实时查询平台数据</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setUploadOpen(true)}>
          上传看板
        </Button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
          <Spin size="large" />
        </div>
      ) : dashboards.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<span style={{ color: textSecondary }}>还没有 HTML 看板，点击「上传看板」开始</span>}
          style={{ paddingTop: 80 }}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {dashboards.map((d) => {
            const isConfirming = confirmId === d.id
            const boundNames = d.dataset_ids
              .map((did) => datasets.find((ds) => ds.id === did)?.name ?? did.slice(0, 8) + '…')
            return (
              <div
                key={d.id}
                style={{
                  background: cardBg,
                  border: `1px solid ${isConfirming ? '#ff4757' : borderColor}`,
                  borderRadius: 16,
                  padding: '20px 20px 16px',
                  transition: 'border-color 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <FileOutlined style={{ fontSize: 22, color: isDark ? '#A29BFE' : '#6C5CE7', marginTop: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: textPrimary, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.name}
                    </div>
                    {d.description && (
                      <div style={{ color: textSecondary, fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.description}
                      </div>
                    )}
                  </div>
                </div>

                {/* Dataset tags — click to edit */}
                <div
                  style={{ display: 'flex', flexWrap: 'wrap', gap: 4, cursor: 'pointer' }}
                  onClick={() => openEdit(d)}
                  title="点击重新绑定数据集"
                >
                  {boundNames.length === 0 ? (
                    <Tag style={{ fontSize: 11, margin: 0, borderRadius: 6, borderStyle: 'dashed', color: textSecondary }}>
                      未绑定数据集，点击绑定
                    </Tag>
                  ) : (
                    boundNames.map((n, i) => (
                      <Tag key={i} style={{ fontSize: 11, margin: 0, borderRadius: 6 }}>{n}</Tag>
                    ))
                  )}
                </div>

                <div style={{ color: textSecondary, fontSize: 11 }}>
                  {new Date(d.created_at).toLocaleDateString('zh-CN')}
                </div>

                {isConfirming ? (
                  <Space size={8} style={{ marginTop: 4 }}>
                    <Button size="small" danger onClick={() => handleDelete(d.id)}>确认删除</Button>
                    <Button size="small" onClick={() => setConfirmId(null)}>取消</Button>
                  </Space>
                ) : (
                  <Space size={8} style={{ marginTop: 4 }}>
                    <Button
                      size="small"
                      type="primary"
                      icon={<EyeOutlined />}
                      onClick={() => navigate(`/html-dashboards/${d.id}`)}
                    >
                      查看
                    </Button>
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => openEdit(d)}
                    />
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => setConfirmId(d.id)}
                    />
                  </Space>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Upload modal ── */}
      <Modal
        title="上传 HTML 看板"
        open={uploadOpen}
        onCancel={() => { setUploadOpen(false); form.resetFields(); setFileList([]) }}
        onOk={handleUpload}
        okText="上传"
        confirmLoading={uploading}
        width={560}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="看板名称" rules={[{ required: true, message: '请输入看板名称' }]}>
            <Input placeholder="月度运营综合看板" />
          </Form.Item>

          <Form.Item name="description" label="描述（可选）">
            <Input placeholder="简短描述看板用途" />
          </Form.Item>

          <Form.Item name="dataset_ids" label="绑定数据集（可多选）">
            <Select
              mode="multiple"
              placeholder="选择看板可查询的数据集"
              options={datasets.map((ds) => ({ value: ds.id, label: ds.name }))}
              filterOption={(input, option) =>
                (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>

          <Form.Item name="init_function_name" label="数据初始化函数（可选）" extra="HTML 加载完成后自动调用该函数，并传入第一个绑定数据集的记录数组">
            <Input placeholder="例如：processNewData" />
          </Form.Item>

          <Form.Item label="HTML 文件" required>
            <Upload
              accept=".html"
              maxCount={1}
              fileList={fileList}
              beforeUpload={() => false}
              onChange={({ fileList: fl }) => setFileList(fl)}
            >
              <Button icon={<UploadOutlined />}>选择 HTML 文件</Button>
            </Upload>
          </Form.Item>

          {/* Code reference */}
          <Collapse
            size="small"
            ghost
            items={[{
              key: '1',
              label: <span style={{ fontSize: 12, color: textSecondary }}><CodeOutlined /> 如何在 HTML 里读取数据（代码参考）</span>,
              children: (
                <pre style={{
                  background: isDark ? '#0D0F1A' : '#F6F8FA',
                  border: `1px solid ${borderColor}`,
                  borderRadius: 8,
                  padding: '12px 14px',
                  fontSize: 11,
                  lineHeight: 1.6,
                  color: isDark ? '#A29BFE' : '#3B4260',
                  overflowX: 'auto',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {CODE_EXAMPLE}
                </pre>
              ),
            }]}
          />
        </Form>
      </Modal>

      {/* ── Edit datasets modal ── */}
      <Modal
        title="重新绑定数据集"
        open={!!editTarget}
        onCancel={() => setEditTarget(null)}
        onOk={handleSaveEdit}
        okText="保存"
        confirmLoading={saving}
        width={480}
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="dataset_ids" label="绑定数据集">
            <Select
              mode="multiple"
              placeholder="选择看板可查询的数据集"
              options={datasets.map((ds) => ({ value: ds.id, label: ds.name }))}
              filterOption={(input, option) =>
                (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
          <Form.Item name="init_function_name" label="数据初始化函数（可选）" extra="HTML 加载完成后自动调用该函数，并传入第一个数据集的记录数组">
            <Input placeholder="例如：processNewData" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
