import {
  CheckCircleFilled,
  CloudUploadOutlined,
  MessageOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Col,
  Progress,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  Upload,
} from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { datasetsApi } from '../services/api'
import type { ColumnInfo, DatasetDetail } from '../types'

const { Dragger } = Upload
const { Title, Text, Paragraph } = Typography

const TYPE_COLORS: Record<string, string> = {
  string: 'purple',
  integer: 'green',
  float: 'cyan',
  date: 'orange',
  boolean: 'blue',
}

function SchemaTable({ columns }: { columns: ColumnInfo[] }) {
  const tableColumns = [
    {
      title: '字段名',
      dataIndex: 'name',
      key: 'name',
      render: (v: string) => (
        <Text
          code
          style={{
            background: '#F0EEFF',
            color: '#6C5CE7',
            border: 'none',
            borderRadius: 6,
            padding: '2px 8px',
            fontSize: 12,
          }}
        >
          {v}
        </Text>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (v: string) => <Tag color={TYPE_COLORS[v] ?? 'default'} style={{ borderRadius: 20 }}>{v}</Tag>,
    },
    {
      title: '空值率',
      dataIndex: 'null_ratio',
      key: 'null_ratio',
      render: (v: number) => (
        <Progress
          percent={Math.round(v * 100)}
          size="small"
          style={{ width: 80 }}
          strokeColor={v > 0.3 ? '#FF4757' : '#00C48C'}
          trailColor="#F1F3F9"
        />
      ),
    },
    { title: '唯一值数', dataIndex: 'distinct_count', key: 'distinct_count' },
    {
      title: '样本值',
      dataIndex: 'sample_values',
      key: 'sample_values',
      render: (vals: unknown[]) => (
        <Space wrap size={4}>
          {vals.slice(0, 3).map((v, i) => (
            <Tag key={i} style={{ fontSize: 11, borderRadius: 6 }}>
              {String(v)}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      render: (v: string) => <Text type="secondary" style={{ fontSize: 13 }}>{v}</Text>,
    },
  ]

  return (
    <Table
      dataSource={columns.map((c, i) => ({ ...c, key: i }))}
      columns={tableColumns}
      pagination={false}
      size="small"
      scroll={{ x: true }}
    />
  )
}

export default function UploadPage() {
  const navigate = useNavigate()
  const [uploading, setUploading] = useState(false)
  const [dataset, setDataset] = useState<DatasetDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleUpload = async (file: File) => {
    setUploading(true)
    setError(null)
    setDataset(null)
    try {
      const res = await datasetsApi.upload(file)
      setDataset(res.data)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? '上传失败，请重试'
      setError(msg)
    } finally {
      setUploading(false)
    }
    return false
  }

  const handleConfirm = () => {
    if (dataset) navigate(`/chat?dataset_id=${dataset.id}`)
  }

  const card: React.CSSProperties = {
    background: '#FFFFFF',
    borderRadius: 16,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
    border: '1px solid rgba(0, 0, 0, 0.03)',
    padding: '20px 24px',
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100, margin: '0 auto' }}>
      <Title level={3} style={{ marginBottom: 4, fontWeight: 600, color: '#1A1D2E' }}>
        上传数据集
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 28 }}>
        支持 Excel (.xlsx) 和 CSV 格式，上传后自动解析字段类型和分布
      </Paragraph>

      {/* Upload zone */}
      {!dataset && (
        <div style={{ ...card, marginBottom: 24 }}>
          <div
            onDragEnter={() => setDragOver(true)}
            onDragLeave={() => setDragOver(false)}
            onDrop={() => setDragOver(false)}
          >
          <Dragger
            accept=".xlsx,.xls,.csv"
            multiple={false}
            showUploadList={false}
            beforeUpload={handleUpload}
            disabled={uploading}
            style={{
              background: dragOver ? '#F0EEFF' : '#FFFFFF',
              border: `2px dashed ${dragOver ? '#B3ABFD' : '#E8ECF3'}`,
              borderRadius: 20,
              padding: '60px 40px',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <CloudUploadOutlined style={{ fontSize: 48, color: '#6C5CE7', marginBottom: 16 }} />
              <p style={{ fontSize: 16, color: '#2D3142', marginBottom: 8, fontWeight: 500 }}>
                点击或拖拽文件到此区域上传
              </p>
              <p style={{ fontSize: 14, color: '#9CA3B4' }}>
                支持 .xlsx / .xls / .csv · 最大 50 MB
              </p>
            </div>
          </Dragger>
          </div>

          {uploading && (
            <div style={{ marginTop: 20, textAlign: 'center' }}>
              <Progress
                percent={99}
                status="active"
                strokeColor={{ from: '#6C5CE7', to: '#A29BFE' }}
                trailColor="#F1F3F9"
                style={{ marginBottom: 8 }}
              />
              <Text type="secondary">正在解析数据…</Text>
            </div>
          )}
        </div>
      )}

      {error && (
        <Alert
          type="error"
          showIcon
          message="上传失败"
          description={error}
          style={{ marginBottom: 24, borderRadius: 12 }}
          closable
          onClose={() => setError(null)}
        />
      )}

      {dataset && (
        <>
          <Alert
            type="success"
            showIcon
            icon={<CheckCircleFilled />}
            message={`"${dataset.name}" 上传成功`}
            style={{ marginBottom: 20, borderRadius: 12 }}
          />

          {/* Stats */}
          <Row gutter={16} style={{ marginBottom: 20 }}>
            {[
              { title: '数据行数', value: dataset.row_count.toLocaleString() },
              { title: '字段数', value: dataset.schema_info.columns.length },
              { title: '文件格式', value: dataset.source_type.toUpperCase() },
              { title: '空值字段数', value: dataset.schema_info.columns.filter((c) => c.nullable).length },
            ].map((s) => (
              <Col span={6} key={s.title}>
                <div style={{ ...card, padding: '16px 20px' }}>
                  <Statistic
                    title={<span style={{ color: '#9CA3B4', fontSize: 12 }}>{s.title}</span>}
                    value={s.value}
                    valueStyle={{ color: '#2D3142', fontSize: 22, fontWeight: 600 }}
                  />
                </div>
              </Col>
            ))}
          </Row>

          {/* Schema table */}
          <div style={{ ...card, marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#2D3142', marginBottom: 16 }}>
              字段 Schema
            </div>
            <SchemaTable columns={dataset.schema_info.columns} />
          </div>

          {/* Actions */}
          <Space>
            <Button
              type="primary"
              size="large"
              icon={<MessageOutlined />}
              onClick={handleConfirm}
              style={{ borderRadius: 12, height: 44, paddingInline: 24, fontWeight: 500 }}
            >
              开始对话分析
            </Button>
            <Button
              size="large"
              onClick={() => { setDataset(null); setError(null) }}
              style={{ borderRadius: 12, height: 44, paddingInline: 24 }}
            >
              上传其他文件
            </Button>
          </Space>
        </>
      )}
    </div>
  )
}
