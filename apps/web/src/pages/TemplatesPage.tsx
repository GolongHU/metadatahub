import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Dropdown,
  Input,
  message,
  Modal,
  Spin,
} from 'antd'
import type { MenuProps } from 'antd'
import {
  AppstoreOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  PlusOutlined,
  SendOutlined,
  ShopOutlined,
} from '@ant-design/icons'
import { templateApi } from '../services/templateApi'
import type { TemplateOut, WidgetConfig } from '../types/template'
import { useThemeStore } from '../stores/themeStore'

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_COLOR: Record<string, { bg: string; color: string; label: string }> = {
  admin:   { bg: 'rgba(162,155,254,0.12)', color: '#A29BFE', label: '管理员' },
  analyst: { bg: 'rgba(59,130,246,0.12)',  color: '#60A5FA', label: '区域主管' },
  viewer:  { bg: 'rgba(0,200,140,0.12)',   color: '#00E6A0', label: '伙伴经理' },
  partner: { bg: 'rgba(255,185,70,0.12)',  color: '#FFD166', label: '合作伙伴' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 1)  return '刚刚'
  if (mins  < 60) return `${mins} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days  < 30) return `${days} 天前`
  return new Date(iso).toLocaleDateString('zh-CN')
}

// ── TemplateThumbnail ─────────────────────────────────────────────────────────

function TemplateThumbnail({ widgets, isDark }: { widgets: WidgetConfig[]; isDark: boolean }) {
  const kpis    = widgets.filter((w) => w.type === 'kpi_card')
  const charts  = widgets.filter((w) => w.type !== 'kpi_card' && w.type !== 'ranking_table')
  const ranking = widgets.filter((w) => w.type === 'ranking_table')

  const bg      = isDark ? 'rgba(0,0,0,0.20)' : 'rgba(108,92,231,0.04)'
  const border  = isDark ? 'rgba(162,155,254,0.04)' : 'rgba(108,92,231,0.06)'

  return (
    <div
      style={{
        height: 140,
        padding: 12,
        background: bg,
        borderBottom: `1px solid ${border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        flexShrink: 0,
      }}
    >
      {/* Row 1: KPI blocks */}
      {kpis.length > 0 && (
        <div style={{ display: 'flex', gap: 4, height: 26 }}>
          {kpis.slice(0, 5).map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                borderRadius: 5,
                background: isDark ? 'rgba(162,155,254,0.14)' : 'rgba(108,92,231,0.10)',
              }}
            />
          ))}
        </div>
      )}

      {/* Row 2: Chart blocks */}
      <div style={{ display: 'flex', gap: 4, flex: 1 }}>
        {charts.length > 0 ? (
          <>
            <div style={{
              flex: 3,
              borderRadius: 5,
              background: isDark ? 'rgba(108,92,231,0.10)' : 'rgba(108,92,231,0.07)',
            }} />
            <div style={{
              flex: 2,
              borderRadius: 5,
              background: isDark ? 'rgba(0,200,140,0.09)' : 'rgba(0,200,140,0.07)',
            }} />
          </>
        ) : (
          <div style={{
            flex: 1,
            borderRadius: 5,
            background: isDark ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.06)',
          }} />
        )}
      </div>

      {/* Row 3: Ranking / table bar */}
      {(ranking.length > 0 || widgets.length > 2) && (
        <div style={{
          height: 22,
          borderRadius: 5,
          background: isDark ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.06)',
        }} />
      )}

      {/* Mini shimmer lines for low-widget templates */}
      {widgets.length <= 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
          {[70, 50, 60].map((w, i) => (
            <div key={i} style={{
              height: 4,
              width: `${w}%`,
              borderRadius: 2,
              background: isDark ? 'rgba(162,155,254,0.08)' : 'rgba(108,92,231,0.06)',
            }} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── RolePill ──────────────────────────────────────────────────────────────────

function RolePill({ role }: { role: string }) {
  const cfg = ROLE_COLOR[role] ?? { bg: 'rgba(162,155,254,0.10)', color: '#9CA3B4', label: role }
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 500,
        background: cfg.bg,
        color: cfg.color,
        marginRight: 4,
      }}
    >
      {cfg.label}
    </span>
  )
}

// ── TemplateCard ──────────────────────────────────────────────────────────────

interface TemplateCardProps {
  template:  TemplateOut
  isDark:    boolean
  onClone:   (id: string, newName: string) => Promise<void>
  onPublish: (id: string) => Promise<void>
  onDelete:  (id: string) => Promise<void>
}

function TemplateCard({ template, isDark, onClone, onPublish, onDelete }: TemplateCardProps) {
  const navigate = useNavigate()
  const [hovered,       setHovered]       = useState(false)
  const [cloneOpen,     setCloneOpen]     = useState(false)
  const [cloneName,     setCloneName]     = useState('')
  const [cloneLoading,  setCloneLoading]  = useState(false)
  const [publishLoading,setPublishLoading]= useState(false)

  const handleCloneOk = async () => {
    if (!cloneName.trim()) { message.warning('请输入新模板名称'); return }
    setCloneLoading(true)
    try {
      await onClone(template.id, cloneName.trim())
      setCloneOpen(false)
      setCloneName('')
    } finally {
      setCloneLoading(false)
    }
  }

  const handlePublish = async () => {
    setPublishLoading(true)
    try { await onPublish(template.id) }
    finally { setPublishLoading(false) }
  }

  const menuItems: MenuProps['items'] = [
    {
      key: 'edit',
      icon: <EditOutlined />,
      label: '编辑模板',
      onClick: () => navigate(`/templates/${template.id}`),
    },
    {
      key: 'clone',
      icon: <CopyOutlined />,
      label: '克隆',
      onClick: () => { setCloneName(`${template.name} 副本`); setCloneOpen(true) },
    },
    ...(!template.is_published ? [{
      key: 'publish',
      icon: <SendOutlined />,
      label: publishLoading ? '发布中…' : '发布到市场',
      onClick: handlePublish,
    }] : []),
    { type: 'divider' as const },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: '删除',
      danger: true,
      onClick: () => {
        Modal.confirm({
          title: '确认删除',
          content: '删除后无法恢复，确定要删除这个模板吗？',
          okText: '删除',
          cancelText: '取消',
          okButtonProps: { danger: true },
          onOk: () => onDelete(template.id),
        })
      },
    },
  ]

  const cardBg     = isDark ? 'rgba(26,29,46,0.45)' : 'rgba(255,255,255,0.70)'
  const cardBorder = isDark
    ? (hovered ? 'rgba(162,155,254,0.18)' : 'rgba(162,155,254,0.06)')
    : (hovered ? 'rgba(108,92,231,0.18)'  : 'rgba(108,92,231,0.08)')
  const cardShadow = hovered
    ? (isDark ? '0 8px 32px rgba(0,0,0,0.25)' : '0 8px 24px rgba(108,92,231,0.10)')
    : (isDark ? '0 4px 16px rgba(0,0,0,0.15)' : '0 2px 12px rgba(108,92,231,0.05)')

  return (
    <>
      <div
        style={{
          background: cardBg,
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: `1px solid ${cardBorder}`,
          borderRadius: 20,
          boxShadow: cardShadow,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          cursor: 'pointer',
          transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
          transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.2s',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Thumbnail with hover overlay */}
        <div style={{ position: 'relative' }}>
          {template.thumbnail_url ? (
            <img
              src={template.thumbnail_url}
              alt={template.name}
              style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <TemplateThumbnail
              widgets={(template.config?.widgets as WidgetConfig[]) ?? []}
              isDark={isDark}
            />
          )}

          {/* Hover overlay → "编辑" CTA */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.38)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: hovered ? 1 : 0,
              transition: 'opacity 0.2s',
              borderRadius: '20px 20px 0 0',
            }}
            onClick={() => navigate(`/templates/${template.id}`)}
          >
            <span
              style={{
                padding: '8px 22px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.28)',
                background: 'rgba(255,255,255,0.10)',
                backdropFilter: 'blur(8px)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 500,
                letterSpacing: '0.01em',
              }}
            >
              编辑模板
            </span>
          </div>

          {/* Published badge */}
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
        <div style={{ padding: '14px 16px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Name */}
          <div
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: isDark ? '#E8ECF3' : '#1A1D2E',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={template.name}
          >
            {template.name}
          </div>

          {/* Meta */}
          <div style={{ fontSize: 12, color: '#5F6B7A' }}>
            {template.widget_count} 个组件 · 更新于 {relativeTime(template.updated_at)}
          </div>

          {/* Role tags */}
          {template.assigned_roles.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
              {template.assigned_roles.map((role) => (
                <RolePill key={role} role={role} />
              ))}
            </div>
          )}

          {/* Bottom row: version + more-menu */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 'auto',
              paddingTop: 8,
            }}
          >
            <span style={{ fontSize: 11, color: isDark ? 'rgba(162,155,254,0.35)' : 'rgba(108,92,231,0.35)', letterSpacing: '0.02em' }}>
              v{template.version}
            </span>

            <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: isDark ? '#5F6B7A' : '#9CA3B4',
                  fontSize: 16,
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLDivElement
                  el.style.background = 'rgba(162,155,254,0.10)'
                  el.style.color = '#A29BFE'
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLDivElement
                  el.style.background = 'transparent'
                  el.style.color = isDark ? '#5F6B7A' : '#9CA3B4'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreOutlined />
              </div>
            </Dropdown>
          </div>
        </div>
      </div>

      {/* Clone modal */}
      <Modal
        title={<span style={{ color: '#E8ECF3', fontWeight: 500 }}>克隆模板</span>}
        open={cloneOpen}
        onCancel={() => { setCloneOpen(false); setCloneName('') }}
        onOk={handleCloneOk}
        okText="克隆"
        cancelText="取消"
        confirmLoading={cloneLoading}
        styles={{
          content: { background: 'rgba(26,29,46,0.95)', border: '1px solid rgba(162,155,254,0.12)' },
          header:  { background: 'transparent' },
          footer:  { background: 'transparent' },
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
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

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

  const btnGhostStyle: React.CSSProperties = {
    height: 36,
    padding: '0 18px',
    borderRadius: 12,
    border: `1px solid ${isDark ? 'rgba(162,155,254,0.18)' : 'rgba(108,92,231,0.18)'}`,
    background: 'transparent',
    color: '#A29BFE',
    fontSize: 13,
    fontWeight: 400,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    transition: 'all 0.15s',
  }

  const btnPrimaryStyle: React.CSSProperties = {
    height: 36,
    padding: '0 18px',
    borderRadius: 12,
    border: 'none',
    background: 'linear-gradient(135deg, #6C5CE7, #A29BFE)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    boxShadow: '0 4px 14px rgba(108,92,231,0.30)',
    transition: 'box-shadow 0.15s',
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'transparent',
        padding: '72px 24px 40px',
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          marginBottom: 32,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: isDark ? '#E8ECF3' : '#1A1D2E', margin: 0, lineHeight: 1.3 }}>
            看板模板
          </h1>
          <p style={{ fontSize: 13, color: '#5F6B7A', margin: '5px 0 0' }}>
            创建和管理看板模板，支持角色分配与市场发布
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <button style={btnGhostStyle} onClick={() => navigate('/marketplace')}>
            <ShopOutlined style={{ fontSize: 13 }} />
            市场
          </button>
          <button style={btnPrimaryStyle} onClick={() => navigate('/templates/new')}>
            <PlusOutlined style={{ fontSize: 13 }} />
            新建模板
          </button>
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
          <Spin size="large" />
        </div>
      )}

      {/* ── Error ── */}
      {!loading && error && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#F87171' }}>
          <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.6 }}>⚠</div>
          <div style={{ fontSize: 14, marginBottom: 20 }}>{error}</div>
          <button
            style={{
              ...btnGhostStyle,
              margin: '0 auto',
              color: '#F87171',
              borderColor: 'rgba(239,68,68,0.3)',
            }}
            onClick={fetchTemplates}
          >
            重试
          </button>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !error && templates.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div style={{ marginBottom: 20 }}>
            <AppstoreOutlined style={{ fontSize: 52, color: isDark ? 'rgba(162,155,254,0.20)' : 'rgba(108,92,231,0.15)' }} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 500, color: isDark ? '#9CA3B4' : '#5F6B7A', marginBottom: 8 }}>
            还没有看板模板
          </div>
          <div style={{ fontSize: 13, color: '#5F6B7A', marginBottom: 28 }}>
            创建你的第一个模板，或从市场导入
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button style={btnPrimaryStyle} onClick={() => navigate('/templates/new')}>
              <PlusOutlined style={{ fontSize: 13 }} />
              新建模板
            </button>
            <button style={btnGhostStyle} onClick={() => navigate('/marketplace')}>
              <ShopOutlined style={{ fontSize: 13 }} />
              浏览市场
            </button>
          </div>
        </div>
      )}

      {/* ── Grid ── */}
      {!loading && !error && templates.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              isDark={isDark}
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
