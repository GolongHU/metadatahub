import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Input, Select, message, Spin, InputNumber, Switch } from 'antd'
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons'
import { templateApi } from '../services/templateApi'
import type { TemplateDetail, WidgetConfig, WidgetLibraryItem } from '../types/template'

function deepMerge<T>(base: T, patch: Partial<T>): T {
  return { ...base, ...patch }
}

function getWidgetIcon(widgetId: string): string {
  const icons: Record<string, string> = {
    kpi_card: '📊',
    line_chart: '📈',
    bar_chart: '📉',
    pie_chart: '🥧',
    radar_chart: '🕸️',
    ranking_table: '🏆',
    alert_list: '⚠️',
    action_items: '✅',
  }
  return icons[widgetId] ?? '🔲'
}

const ROLE_OPTIONS = [
  { value: 'admin', label: '管理员' },
  { value: 'analyst', label: '分析师' },
  { value: 'viewer', label: '查看者' },
  { value: 'partner', label: '合作伙伴' },
]

export default function TemplateEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [_template, setTemplate] = useState<TemplateDetail | null>(null)
  const [name, setName] = useState('')
  const [assignedRoles, setAssignedRoles] = useState<string[]>([])
  const [widgets, setWidgets] = useState<WidgetConfig[]>([])
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null)
  const [widgetLibrary, setWidgetLibrary] = useState<WidgetLibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        if (id !== 'new') {
          const res = await templateApi.get(id!)
          const t = res.data
          setTemplate(t)
          setName(t.name)
          setAssignedRoles(t.assigned_roles ?? [])
          setWidgets(t.config?.widgets ?? [])
        }
        const libRes = await templateApi.widgetLibrary()
        setWidgetLibrary(libRes.data)
      } catch {
        message.error('加载失败')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const handleAddWidget = useCallback((item: WidgetLibraryItem) => {
    setWidgets(prev => {
      const maxRow = prev.length > 0 ? Math.max(...prev.map(w => w.position.row)) : -1
      const newWidget: WidgetConfig = {
        id: crypto.randomUUID(),
        type: item.id,
        title: item.name,
        config: item.default_config ?? {},
        position: {
          row: maxRow + 1,
          col: 0,
          col_span: 2,
          row_span: 1,
        },
      }
      return [...prev, newWidget]
    })
  }, [])

  const moveWidget = useCallback((index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= widgets.length) return
    setWidgets(prev => {
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }, [widgets.length])

  const removeWidget = useCallback((wid: string) => {
    setWidgets(prev => prev.filter(w => w.id !== wid))
    setSelectedWidgetId(prev => (prev === wid ? null : prev))
  }, [])

  const updateWidget = useCallback((wid: string, patch: Partial<WidgetConfig>) => {
    setWidgets(prev => prev.map(w => w.id === wid ? deepMerge(w, patch) : w))
  }, [])

  const handleSave = async () => {
    if (!name.trim()) {
      message.error('请输入模板名称')
      return
    }
    setSaving(true)
    try {
      const configData = {
        layout: { columns: 6, row_height: 160 },
        widgets,
        filters: [],
      }
      if (id === 'new') {
        const r = await templateApi.create({ name, config: configData, assigned_roles: assignedRoles })
        message.success('模板已创建')
        navigate(`/templates/${r.data.id}`)
      } else {
        await templateApi.update(id!, { name, config: configData, assigned_roles: assignedRoles })
        message.success('模板已保存')
      }
    } catch {
      message.error('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0a0c14',
      }}>
        <Spin size="large" />
      </div>
    )
  }

  const selectedWidget = widgets.find(w => w.id === selectedWidgetId) ?? null
  const selectedLibraryItem = selectedWidget
    ? widgetLibrary.find(item => item.id === selectedWidget.type) ?? null
    : null
  const hasQueryField = selectedLibraryItem
    ? 'query' in (selectedLibraryItem.config_schema?.properties as Record<string, unknown> ?? {})
    : false

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      background: '#0a0c14',
      zIndex: 300,
    }}>
      {/* ── Toolbar ── */}
      <div style={{
        height: 56, flexShrink: 0,
        background: 'rgba(26,29,46,0.8)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(162,155,254,0.06)',
        padding: '0 20px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/templates')}
          type="text"
          style={{ color: '#9CA3B4' }}
        >
          返回
        </Button>

        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="模板名称"
          style={{
            width: 280,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(162,155,254,0.1)',
            borderRadius: 8,
            color: '#E8ECF3',
          }}
        />

        <Select
          mode="multiple"
          value={assignedRoles}
          onChange={setAssignedRoles}
          options={ROLE_OPTIONS}
          placeholder="分配角色"
          style={{ width: 200 }}
          styles={{
            popup: {
              root: {
                background: 'rgba(26,29,46,0.95)',
              },
            },
          }}
        />

        <div style={{ flex: 1 }} />

        <Button
          icon={<SaveOutlined />}
          type="primary"
          onClick={handleSave}
          loading={saving}
          style={{ background: '#6C5CE7', borderColor: '#6C5CE7' }}
        >
          保存
        </Button>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Left: Widget Palette ── */}
        <div style={{
          width: 220, flexShrink: 0,
          background: 'rgba(13,14,22,0.6)',
          borderRight: '1px solid rgba(162,155,254,0.06)',
          overflowY: 'auto',
          padding: 12,
        }}>
          <div style={{
            fontSize: 11,
            textTransform: 'uppercase',
            color: '#5F6B7A',
            letterSpacing: '0.8px',
            marginBottom: 10,
          }}>
            组件库
          </div>

          {widgetLibrary.map(item => (
            <div
              key={item.id}
              onClick={() => handleAddWidget(item)}
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                background: 'rgba(26,29,46,0.3)',
                border: '1px solid rgba(162,155,254,0.06)',
                marginBottom: 6,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                transition: 'all 0.15s',
                fontSize: 13,
                color: '#E8ECF3',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(162,155,254,0.2)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(162,155,254,0.06)'
              }}
            >
              <span style={{ fontSize: 16 }}>{getWidgetIcon(item.id)}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500 }}>{item.name}</div>
                {item.description && (
                  <div style={{ fontSize: 10, color: '#5F6B7A', marginTop: 1 }}>
                    {item.description}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── Center: Canvas ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 12,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#E8ECF3' }}>画布</span>
            <span style={{ fontSize: 11, color: '#5F6B7A' }}>
              {widgets.length} 个组件
            </span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: 10,
            minHeight: 400,
            background: 'rgba(162,155,254,0.02)',
            border: '1px dashed rgba(162,155,254,0.08)',
            borderRadius: 12,
            padding: 10,
          }}>
            {widgets.map((widget, index) => (
              <div
                key={widget.id}
                onClick={() => setSelectedWidgetId(widget.id)}
                style={{
                  gridColumn: `span ${widget.position.col_span}`,
                  minHeight: 120,
                  borderRadius: 12,
                  padding: 10,
                  background: selectedWidgetId === widget.id
                    ? 'rgba(108,92,231,0.15)'
                    : 'rgba(26,29,46,0.4)',
                  border: selectedWidgetId === widget.id
                    ? '2px solid rgba(108,92,231,0.5)'
                    : '1px dashed rgba(162,155,254,0.15)',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ fontSize: 11, color: '#9CA3B4', marginBottom: 4 }}>
                  {getWidgetIcon(widget.type)} {widget.title || widget.type}
                </div>
                <div style={{ fontSize: 10, color: '#5F6B7A' }}>
                  span {widget.position.col_span} · row {widget.position.row + 1}
                </div>

                {/* Action buttons */}
                <div style={{
                  position: 'absolute', top: 6, right: 6,
                  display: 'flex', gap: 3,
                }}>
                  <button
                    onClick={e => { e.stopPropagation(); moveWidget(index, -1) }}
                    style={{
                      background: 'rgba(0,0,0,0.3)', border: 'none', borderRadius: 4,
                      color: '#9CA3B4', cursor: 'pointer',
                      width: 20, height: 20, fontSize: 10,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    ↑
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); moveWidget(index, 1) }}
                    style={{
                      background: 'rgba(0,0,0,0.3)', border: 'none', borderRadius: 4,
                      color: '#9CA3B4', cursor: 'pointer',
                      width: 20, height: 20, fontSize: 10,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    ↓
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); removeWidget(widget.id) }}
                    style={{
                      background: 'rgba(255,71,87,0.2)', border: 'none', borderRadius: 4,
                      color: '#FF4757', cursor: 'pointer',
                      width: 20, height: 20, fontSize: 10,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}

            {widgets.length === 0 && (
              <div style={{
                gridColumn: 'span 6',
                height: 200,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#3A3F55', fontSize: 13,
              }}>
                点击左侧组件添加到画布
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Properties Panel ── */}
        <div style={{
          width: 280, flexShrink: 0,
          background: 'rgba(13,14,22,0.6)',
          borderLeft: '1px solid rgba(162,155,254,0.06)',
          overflowY: 'auto',
          padding: 14,
        }}>
          <div style={{
            fontSize: 11,
            textTransform: 'uppercase',
            color: '#5F6B7A',
            letterSpacing: '0.8px',
            marginBottom: 14,
          }}>
            属性
          </div>

          {!selectedWidget ? (
            <div style={{
              textAlign: 'center',
              color: '#3A3F55',
              fontSize: 12,
              marginTop: 40,
              lineHeight: 1.8,
            }}>
              点击画布中的组件<br />以编辑属性
            </div>
          ) : (
            <>
              {/* Title */}
              <div style={{ marginBottom: 14 }}>
                <label style={{
                  fontSize: 11, color: '#5F6B7A',
                  display: 'block', marginBottom: 4,
                }}>
                  组件标题
                </label>
                <Input
                  value={selectedWidget.title}
                  onChange={e => updateWidget(selectedWidget.id, { title: e.target.value })}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(162,155,254,0.1)',
                    borderRadius: 8,
                    color: '#E8ECF3',
                  }}
                />
              </div>

              {/* Col span */}
              <div style={{ marginBottom: 14 }}>
                <label style={{
                  fontSize: 11, color: '#5F6B7A',
                  display: 'block', marginBottom: 4,
                }}>
                  列宽 (1-6)
                </label>
                <InputNumber
                  min={1}
                  max={6}
                  value={selectedWidget.position.col_span}
                  onChange={v => updateWidget(selectedWidget.id, {
                    position: { ...selectedWidget.position, col_span: v ?? 1 },
                  })}
                  style={{ width: '100%' }}
                />
              </div>

              {/* SQL / Query */}
              {hasQueryField && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{
                    fontSize: 11, color: '#5F6B7A',
                    display: 'block', marginBottom: 4,
                  }}>
                    SQL 查询
                  </label>
                  <textarea
                    value={String(selectedWidget.config.query ?? '')}
                    onChange={e => updateWidget(selectedWidget.id, {
                      config: { ...selectedWidget.config, query: e.target.value },
                    })}
                    rows={6}
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.4)',
                      border: '1px solid rgba(162,155,254,0.1)',
                      borderRadius: 8,
                      color: '#E8ECF3',
                      fontSize: 12,
                      fontFamily: 'monospace',
                      padding: '8px 10px',
                      resize: 'vertical',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              {/* Format (kpi_card only) */}
              {selectedWidget.type === 'kpi_card' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{
                    fontSize: 11, color: '#5F6B7A',
                    display: 'block', marginBottom: 4,
                  }}>
                    格式
                  </label>
                  <Select
                    value={String(selectedWidget.config.format ?? 'number')}
                    onChange={v => updateWidget(selectedWidget.id, {
                      config: { ...selectedWidget.config, format: v },
                    })}
                    style={{ width: '100%' }}
                  >
                    <Select.Option value="number">数字</Select.Option>
                    <Select.Option value="currency">货币 (¥)</Select.Option>
                    <Select.Option value="percent">百分比 (%)</Select.Option>
                  </Select>
                </div>
              )}

              {/* Smooth (line_chart only) */}
              {selectedWidget.type === 'line_chart' && (
                <div style={{
                  marginBottom: 14,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <label style={{ fontSize: 11, color: '#5F6B7A' }}>平滑曲线</label>
                  <Switch
                    size="small"
                    checked={!!selectedWidget.config.smooth}
                    onChange={v => updateWidget(selectedWidget.id, {
                      config: { ...selectedWidget.config, smooth: v },
                    })}
                  />
                </div>
              )}

              {/* Donut (pie_chart only) */}
              {selectedWidget.type === 'pie_chart' && (
                <div style={{
                  marginBottom: 14,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <label style={{ fontSize: 11, color: '#5F6B7A' }}>环形图</label>
                  <Switch
                    size="small"
                    checked={!!selectedWidget.config.donut}
                    onChange={v => updateWidget(selectedWidget.id, {
                      config: { ...selectedWidget.config, donut: v },
                    })}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
