import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Input,
  message,
  Modal,
  Popconfirm,
  Spin,
} from 'antd'
import {
  AppstoreOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SendOutlined,
  ShopOutlined,
} from '@ant-design/icons'
import { templateApi } from '../services/templateApi'
import type { TemplateOut } from '../types/template'

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_COLOR: Record<string, { bg: string; color: string; label: string }> = {
  admin:   { bg: 'rgba(108,92,231,0.18)',  color: '#A29BFE', label: '管理员' },
  analyst: { bg: 'rgba(59,130,246,0.18)',  color: '#60A5FA', label: '分析师' },
  viewer:  { bg: 'rgba(0,196,140,0.18)',   color: '#34D399', label: '查看者' },
  partner: { bg: 'rgba(251,146,60,0.18)',  color: '#FB923C', label: '合作伙伴' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 1)  return '刚刚'
  if (mins  < 60) return `${mins} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days  < 30) return `${days} 天前`
  return new Date(iso).toLocaleDateString('zh-CN')
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RolePill({ role }: { role: string }) {
  const cfg = ROLE_COLOR[role] ?? { bg: 'rgba(162,155,254,0.12)', color: '#9CA3B4', label: role }
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 9px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 500,
        background: cfg.bg,
        color: cfg.color,
        marginRight: 4,
        marginBottom: 4,
      }}
    >
      {cfg.label}
    </span>
  )
}

interface TemplateCardProps {
  template: TemplateOut
  onClone:   (id: string, newName: string) => Promise<void>
  onPublish: (id: string) => Promise<void>
  onDelete:  (id: string) => Promise<void>
}

function TemplateCard({ template, onClone, onPublish, onDelete }: TemplateCardProps) {
  const navigate = useNavigate()
  const [cloneModalOpen, setCloneModalOpen]   = useState(false)
  const [cloneName,      setCloneName]        = useState('')
  const [cloneLoading,   setCloneLoading]     = useState(false)
  const [publishLoading, setPublishLoading]   = useState(false)
  const [deleteLoading,  setDeleteLoading]    = useState(false)

  const handleCloneOk = async () => {
    if (!cloneName.trim()) {
      message.warning('请输入新模板名称')
      return
    }
    setCloneLoading(true)
    try {
      await onClone(template.id, cloneName.trim())
      setCloneModalOpen(false)
      setCloneName('')
    } finally {
      setCloneLoading(false)
    }
  }

  const handlePublish = async () => {
    setPublishLoading(true)
    try {
      await onPublish(template.id)
    } finally {
      setPublishLoading(false)
    }
  }

  const handleDelete = async () => {
    setDeleteLoading(true)
    try {
      await onDelete(template.id)
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <>
      <div
        style={{
          background: 'rgba(26,29,46,0.4)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(162,155,254,0.06)',
          borderRadius: 18,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLDivElement
          el.style.borderColor = 'rgba(162,155,254,0.2)'
          el.style.boxShadow   = '0 8px 32px rgba(108,92,231,0.12)'
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLDivElement
          el.style.borderColor = 'rgba(162,155,254,0.06)'
          el.style.boxShadow   = 'none'
        }}
      >
        {/* Thumbnail */}
        <div
          style={{
            height: 200,
            position: 'relative',
            background: 'rgba(108,92,231,0.08)',
            borderBottom: '1px solid rgba(162,155,254,0.06)',
            flexShrink: 0,
          }}
        >
          {template.thumbnail_url ? (
            <img
              src={template.thumbnail_url}
              alt={template.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
            >
              <span
                style={{
                  fontSize: 48,
                  fontWeight: 700,
                  color: 'rgba(162,155,254,0.5)',
                  lineHeight: 1,
                }}
              >
                {template.widget_count}
              </span>
              <span style={{ fontSize: 12, color: '#5F6B7A' }}>个组件</span>
            </div>
          )}

          {/* Published badge overlay */}
          {template.is_published && (
            <span
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                padding: '3px 10px',
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 500,
                background: 'rgba(0,196,140,0.18)',
                color: '#34D399',
                border: '1px solid rgba(0,196,140,0.25)',
                backdropFilter: 'blur(8px)',
              }}
            >
              已发布
            </span>
          )}
        </div>

        {/* Card body */}
        <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Name */}
          <div
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: '#E8ECF3',
              marginBottom: 8,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={template.name}
          >
            {template.name}
          </div>

          {/* Roles */}
          {template.assigned_roles.length > 0 && (
            <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap' }}>
              {template.assigned_roles.map((role) => (
                <RolePill key={role} role={role} />
              ))}
            </div>
          )}

          {/* Stats */}
          <div style={{ fontSize: 11, color: '#9CA3B4', marginBottom: 4 }}>
            {template.widget_count} 个组件 · v{template.version}
          </div>

          {/* Time */}
          <div style={{ fontSize: 11, color: '#5F6B7A', marginBottom: 8 }}>
            更新于 {relativeTime(template.updated_at)}
          </div>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Actions */}
          <div
            style={{
              marginTop: 12,
              paddingTop: 10,
              borderTop: '1px solid rgba(255,255,255,0.05)',
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
            }}
          >
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => navigate(`/templates/${template.id}`)}
              style={{
                background: 'rgba(108,92,231,0.15)',
                border: '1px solid rgba(108,92,231,0.3)',
                color: '#A29BFE',
                borderRadius: 8,
              }}
            >
              编辑
            </Button>

            <Button
              size="small"
              icon={<CopyOutlined />}
              onClick={() => { setCloneName(`${template.name} 副本`); setCloneModalOpen(true) }}
              style={{
                background: 'rgba(59,130,246,0.12)',
                border: '1px solid rgba(59,130,246,0.25)',
                color: '#60A5FA',
                borderRadius: 8,
              }}
            >
              克隆
            </Button>

            {!template.is_published && (
              <Button
                size="small"
                icon={<SendOutlined />}
                loading={publishLoading}
                onClick={handlePublish}
                style={{
                  background: 'rgba(0,196,140,0.12)',
                  border: '1px solid rgba(0,196,140,0.25)',
                  color: '#34D399',
                  borderRadius: 8,
                }}
              >
                发布
              </Button>
            )}

            <Popconfirm
              title="确认删除"
              description="删除后无法恢复，确定要删除这个模板吗？"
              onConfirm={handleDelete}
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button
                size="small"
                icon={<DeleteOutlined />}
                loading={deleteLoading}
                style={{
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.22)',
                  color: '#F87171',
                  borderRadius: 8,
                }}
              >
                删除
              </Button>
            </Popconfirm>
          </div>
        </div>
      </div>

      {/* Clone modal */}
      <Modal
        title={
          <span style={{ color: '#E8ECF3' }}>克隆模板</span>
        }
        open={cloneModalOpen}
        onCancel={() => { setCloneModalOpen(false); setCloneName('') }}
        onOk={handleCloneOk}
        okText="克隆"
        cancelText="取消"
        confirmLoading={cloneLoading}
        styles={{
          content: {
            background: 'rgba(26,29,46,0.95)',
            border: '1px solid rgba(162,155,254,0.12)',
          },
          header: { background: 'transparent' },
          footer: { background: 'transparent' },
        }}
      >
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, color: '#9CA3B4', marginBottom: 8 }}>新模板名称</div>
          <Input
            value={cloneName}
            onChange={(e) => setCloneName(e.target.value)}
            placeholder="请输入新模板名称"
            onPressEnter={handleCloneOk}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(162,155,254,0.15)',
              color: '#E8ECF3',
              borderRadius: 8,
            }}
          />
        </div>
      </Modal>
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<TemplateOut[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  const fetchTemplates = () => {
    setLoading(true)
    setError(null)
    templateApi
      .list()
      .then((r) => setTemplates(r.data))
      .catch((err: unknown) => {
        const detail =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          '加载模板列表失败'
        setError(detail)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchTemplates() }, [])

  const handleClone = async (id: string, newName: string) => {
    try {
      const res = await templateApi.clone(id, { new_name: newName })
      message.success('克隆成功')
      navigate(`/templates/${res.data.id}`)
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? '克隆失败'
      message.error(detail)
      throw err
    }
  }

  const handlePublish = async (id: string) => {
    try {
      await templateApi.publish(id)
      message.success('模板已发布到市场')
      fetchTemplates()
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? '发布失败'
      message.error(detail)
      throw err
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await templateApi.delete(id)
      message.success('模板已删除')
      setTemplates((prev) => prev.filter((t) => t.id !== id))
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? '删除失败'
      message.error(detail)
      throw err
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'transparent',
        padding: '72px 20px 20px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 28,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: '#E8ECF3',
              margin: 0,
              lineHeight: 1.3,
            }}
          >
            看板模板管理
          </h1>
          <p style={{ color: '#9CA3B4', fontSize: 13, margin: '6px 0 0' }}>
            创建和管理看板模板，支持角色分配、版本控制与市场发布
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
          <Button
            icon={<ShopOutlined />}
            onClick={() => navigate('/marketplace')}
            style={{
              background: 'rgba(162,155,254,0.08)',
              border: '1px solid rgba(162,155,254,0.2)',
              color: '#A29BFE',
              borderRadius: 10,
              height: 38,
              paddingInline: 18,
            }}
          >
            市场
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/templates/new')}
            style={{
              background: 'linear-gradient(135deg, #6C5CE7 0%, #A29BFE 100%)',
              border: 'none',
              borderRadius: 10,
              height: 38,
              paddingInline: 18,
              fontWeight: 500,
              boxShadow: '0 4px 14px rgba(108,92,231,0.35)',
            }}
          >
            新建模板
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 300,
          }}
        >
          <Spin size="large" />
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div
          style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: '#F87171',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠</div>
          <div style={{ fontSize: 14, marginBottom: 16 }}>{error}</div>
          <Button
            onClick={fetchTemplates}
            style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: '#F87171',
              borderRadius: 8,
            }}
          >
            重试
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && templates.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '80px 20px',
          }}
        >
          <div style={{ fontSize: 56, marginBottom: 16, opacity: 0.3 }}>
            <AppstoreOutlined />
          </div>
          <div style={{ fontSize: 16, color: '#9CA3B4', marginBottom: 8 }}>
            还没有任何模板
          </div>
          <div style={{ fontSize: 13, color: '#5F6B7A', marginBottom: 24 }}>
            创建你的第一个看板模板，或从市场导入
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/templates/new')}
            style={{
              background: 'linear-gradient(135deg, #6C5CE7 0%, #A29BFE 100%)',
              border: 'none',
              borderRadius: 10,
              height: 38,
              paddingInline: 20,
              fontWeight: 500,
            }}
          >
            新建模板
          </Button>
        </div>
      )}

      {/* Templates grid */}
      {!loading && !error && templates.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 20,
          }}
        >
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onClone={handleClone}
              onPublish={handlePublish}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
