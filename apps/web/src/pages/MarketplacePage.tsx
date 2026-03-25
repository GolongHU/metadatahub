import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Input,
  message,
  Select,
} from 'antd'
import {
  ArrowLeftOutlined,
  CloudDownloadOutlined,
  SearchOutlined,
  ShopOutlined,
} from '@ant-design/icons'
import { templateApi } from '../services/templateApi'
import type { MarketplaceItem } from '../types/template'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-CN', {
    year:  'numeric',
    month: 'short',
    day:   'numeric',
  })
}

// ── Marketplace Card ──────────────────────────────────────────────────────────

interface MarketplaceCardProps {
  item: MarketplaceItem
  onImport: (id: string) => Promise<void>
}

function MarketplaceCard({ item, onImport }: MarketplaceCardProps) {
  const [importLoading, setImportLoading] = useState(false)

  const handleImport = async () => {
    setImportLoading(true)
    try {
      await onImport(item.id)
    } finally {
      setImportLoading(false)
    }
  }

  return (
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
          height: 180,
          background: 'rgba(108,92,231,0.08)',
          borderBottom: '1px solid rgba(162,155,254,0.06)',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        {item.thumbnail_url ? (
          <img
            src={item.thumbnail_url}
            alt={item.name}
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
                fontSize: 44,
                fontWeight: 700,
                color: 'rgba(162,155,254,0.45)',
                lineHeight: 1,
              }}
            >
              {item.widget_count}
            </span>
            <span style={{ fontSize: 12, color: '#5F6B7A' }}>个组件</span>
          </div>
        )}
      </div>

      {/* Card body */}
      <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Name */}
        <div
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: '#E8ECF3',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={item.name}
        >
          {item.name}
        </div>

        {/* Tags */}
        {item.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {item.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 400,
                  background: 'rgba(162,155,254,0.1)',
                  color: '#9CA3B4',
                  border: '1px solid rgba(162,155,254,0.12)',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Stats */}
        <div style={{ fontSize: 11, color: '#9CA3B4' }}>
          {item.widget_count} 个组件 · v{item.version}
        </div>

        {/* Date */}
        <div style={{ fontSize: 11, color: '#5F6B7A' }}>
          发布于 {formatDate(item.created_at)}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Import button */}
        <Button
          type="primary"
          icon={<CloudDownloadOutlined />}
          loading={importLoading}
          onClick={handleImport}
          block
          style={{
            marginTop: 4,
            background: 'linear-gradient(135deg, #6C5CE7 0%, #A29BFE 100%)',
            border: 'none',
            borderRadius: 10,
            height: 36,
            fontWeight: 500,
            boxShadow: '0 4px 14px rgba(108,92,231,0.25)',
          }}
        >
          一键导入
        </Button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MarketplacePage() {
  const navigate = useNavigate()
  const [items,       setItems]       = useState<MarketplaceItem[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [searchText,  setSearchText]  = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  const fetchMarketplace = () => {
    setLoading(true)
    setError(null)
    templateApi
      .marketplace()
      .then((r) => setItems(r.data))
      .catch((err: unknown) => {
        const detail =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          '加载市场模板失败'
        setError(detail)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchMarketplace() }, [])

  // Collect all unique tags
  const allTags = useMemo<string[]>(() => {
    const set = new Set<string>()
    items.forEach((item) => item.tags.forEach((t) => set.add(t)))
    return Array.from(set).sort()
  }, [items])

  // Client-side filter
  const filtered = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        !searchText.trim() ||
        item.name.toLowerCase().includes(searchText.trim().toLowerCase())
      const matchesTag =
        !selectedTag || item.tags.includes(selectedTag)
      return matchesSearch && matchesTag
    })
  }, [items, searchText, selectedTag])

  const handleImport = async (id: string) => {
    try {
      const res = await templateApi.importFromMarketplace(id)
      message.success('导入成功，已加入你的模板库')
      navigate(`/templates/${res.data.id}`)
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? '导入失败'
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
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/templates')}
            style={{
              background: 'rgba(162,155,254,0.06)',
              border: '1px solid rgba(162,155,254,0.14)',
              color: '#9CA3B4',
              borderRadius: 10,
              height: 38,
              marginTop: 2,
              flexShrink: 0,
            }}
          />
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: '#E8ECF3',
                margin: 0,
                lineHeight: 1.3,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <ShopOutlined style={{ color: '#A29BFE', fontSize: 20 }} />
              模板市场
            </h1>
            <p style={{ color: '#9CA3B4', fontSize: 13, margin: '6px 0 0' }}>
              发现和导入社区模板
            </p>
          </div>
        </div>

        {/* Search & filter controls */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            flexShrink: 0,
            flexWrap: 'wrap',
          }}
        >
          <Input
            prefix={<SearchOutlined style={{ color: '#5F6B7A' }} />}
            placeholder="搜索模板..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            style={{
              width: 220,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(162,155,254,0.15)',
              borderRadius: 10,
              color: '#E8ECF3',
            }}
          />
          <Select
            placeholder="按标签筛选"
            allowClear
            value={selectedTag}
            onChange={(v) => setSelectedTag(v ?? null)}
            style={{ width: 160 }}
            options={allTags.map((tag) => ({ value: tag, label: tag }))}
            styles={{
              popup: {
                root: {
                  background: 'rgba(26,29,46,0.95)',
                  border: '1px solid rgba(162,155,254,0.15)',
                  borderRadius: 10,
                },
              },
            }}
          />
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 20,
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              style={{
                background: 'rgba(26,29,46,0.4)',
                border: '1px solid rgba(162,155,254,0.06)',
                borderRadius: 18,
                height: 320,
                animation: 'pulse 1.5s ease-in-out infinite',
                opacity: 0.6 - i * 0.06,
              }}
            />
          ))}
          <style>{`@keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:0.7} }`}</style>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#F87171' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠</div>
          <div style={{ fontSize: 14, marginBottom: 16 }}>{error}</div>
          <Button
            onClick={fetchMarketplace}
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

      {/* Empty state — no items at all */}
      {!loading && !error && items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div style={{ fontSize: 56, marginBottom: 16, opacity: 0.25 }}>
            <ShopOutlined />
          </div>
          <div style={{ fontSize: 16, color: '#9CA3B4', marginBottom: 8 }}>
            暂无已发布的模板
          </div>
          <div style={{ fontSize: 13, color: '#5F6B7A', marginBottom: 24 }}>
            管理员发布模板后将在这里显示
          </div>
          <Button
            onClick={() => navigate('/templates')}
            style={{
              background: 'rgba(108,92,231,0.15)',
              border: '1px solid rgba(108,92,231,0.3)',
              color: '#A29BFE',
              borderRadius: 10,
              height: 38,
              paddingInline: 20,
            }}
          >
            前往模板管理
          </Button>
        </div>
      )}

      {/* Empty filter result */}
      {!loading && !error && items.length > 0 && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }}>
            <SearchOutlined />
          </div>
          <div style={{ fontSize: 14, color: '#9CA3B4', marginBottom: 16 }}>
            没有符合条件的模板
          </div>
          <Button
            onClick={() => { setSearchText(''); setSelectedTag(null) }}
            style={{
              background: 'rgba(162,155,254,0.08)',
              border: '1px solid rgba(162,155,254,0.2)',
              color: '#A29BFE',
              borderRadius: 8,
            }}
          >
            清除筛选
          </Button>
        </div>
      )}

      {/* Marketplace grid */}
      {!loading && !error && filtered.length > 0 && (
        <>
          {/* Result count */}
          <div style={{ fontSize: 12, color: '#5F6B7A', marginBottom: 16 }}>
            共 {filtered.length} 个模板
            {(searchText || selectedTag) && ` (已筛选，原 ${items.length} 个)`}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 20,
            }}
          >
            {filtered.map((item) => (
              <MarketplaceCard
                key={item.id}
                item={item}
                onImport={handleImport}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
