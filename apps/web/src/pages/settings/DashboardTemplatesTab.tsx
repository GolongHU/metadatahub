import { CheckOutlined, EyeOutlined } from '@ant-design/icons'
import { Button, Checkbox, message } from 'antd'
import { useState } from 'react'
import { useThemeStore } from '../../stores/themeStore'

const TEMPLATES = [
  {
    key: 'admin',
    name: '管理员全局看板',
    desc: '6列×4行，全网KPI、层级分布、区域对比、五维雷达、月度趋势、风险预警、排名表',
    icon: '🌐',
    defaultRoles: ['admin'],
  },
  {
    key: 'region_head',
    name: '区域负责人看板',
    desc: '4列×4行，区域KPI、经理对比、行动建议热力图、区域排名',
    icon: '📍',
    defaultRoles: ['analyst'],
  },
  {
    key: 'partner_manager',
    name: '伙伴经理看板',
    desc: '3个伙伴健康卡片，五维评分条、关键指标、预警信息',
    icon: '👤',
    defaultRoles: ['viewer'],
  },
  {
    key: 'partner_self',
    name: '伙伴自服务看板',
    desc: '成绩单总览、五维雷达、历史趋势、提升建议',
    icon: '⭐',
    defaultRoles: ['partner'],
  },
]

const ALL_ROLES = [
  { value: 'admin',    label: '管理员' },
  { value: 'analyst',  label: '区域负责人' },
  { value: 'viewer',   label: '伙伴经理' },
  { value: 'partner',  label: '合作伙伴' },
]

export default function DashboardTemplatesTab() {
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  const [roleAssignments, setRoleAssignments] = useState<Record<string, string[]>>(
    Object.fromEntries(TEMPLATES.map(t => [t.key, t.defaultRoles]))
  )
  const [saving, setSaving] = useState(false)

  const cardStyle: React.CSSProperties = {
    background: isDark ? 'rgba(26,29,46,0.6)' : 'rgba(255,255,255,0.8)',
    border: `1px solid ${isDark ? 'rgba(162,155,254,0.1)' : 'rgba(108,92,231,0.08)'}`,
    borderRadius: 16, padding: 24, marginBottom: 16,
  }

  function toggleRole(templateKey: string, role: string) {
    setRoleAssignments(prev => {
      const current = prev[templateKey] || []
      const next = current.includes(role) ? current.filter(r => r !== role) : [...current, role]
      return { ...prev, [templateKey]: next }
    })
  }

  async function handleSave() {
    setSaving(true)
    // In a real implementation this would call an API
    await new Promise(r => setTimeout(r, 600))
    setSaving(false)
    message.success('看板模板配置已保存')
  }

  return (
    <div>
      <div style={{ marginBottom: 20, fontSize: 13, color: '#9CA3B4' }}>
        配置每套看板模板对哪些角色开放。用户登录后将看到对应角色的看板。
      </div>

      {TEMPLATES.map(tpl => {
        const assigned = roleAssignments[tpl.key] || []
        return (
          <div key={tpl.key} style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              {/* Icon */}
              <div style={{
                width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                background: isDark ? 'rgba(108,92,231,0.15)' : 'rgba(108,92,231,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22,
              }}>
                {tpl.icon}
              </div>

              {/* Info */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: isDark ? '#E8ECF3' : '#1A1D2E', marginBottom: 4 }}>
                  {tpl.name}
                </div>
                <div style={{ fontSize: 12, color: '#9CA3B4', marginBottom: 14 }}>
                  {tpl.desc}
                </div>

                {/* Role checkboxes */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#9CA3B4', lineHeight: '24px' }}>开放给：</span>
                  {ALL_ROLES.map(r => (
                    <label key={r.value} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <Checkbox
                        checked={assigned.includes(r.value)}
                        onChange={() => toggleRole(tpl.key, r.value)}
                      />
                      <span style={{ fontSize: 12, color: isDark ? '#E8ECF3' : '#1A1D2E' }}>{r.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Preview button */}
              <Button
                icon={<EyeOutlined />}
                size="small"
                type="text"
                style={{ color: '#9CA3B4' }}
                onClick={() => message.info(`预览 ${tpl.name}`)}
              >
                预览
              </Button>
            </div>

            {/* Assigned roles summary */}
            {assigned.length > 0 && (
              <div style={{
                marginTop: 14, padding: '8px 12px', borderRadius: 8,
                background: isDark ? 'rgba(0,196,140,0.08)' : 'rgba(0,196,140,0.06)',
                border: '1px solid rgba(0,196,140,0.15)',
                fontSize: 12, color: '#00C48C',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <CheckOutlined style={{ fontSize: 11 }} />
                已开放给：{assigned.map(r => ALL_ROLES.find(x => x.value === r)?.label).filter(Boolean).join('、')}
              </div>
            )}
          </div>
        )
      })}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <Button type="primary" loading={saving} onClick={handleSave}>
          保存配置
        </Button>
      </div>
    </div>
  )
}
