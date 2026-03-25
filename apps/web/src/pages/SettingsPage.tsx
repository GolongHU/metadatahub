import { Tabs } from 'antd'
import { useThemeStore } from '../stores/themeStore'
import AIModelsTab from './settings/AIModelsTab'
import BrandingTab from './settings/BrandingTab'
import DashboardTemplatesTab from './settings/DashboardTemplatesTab'
import SystemTab from './settings/SystemTab'

export default function SettingsPage() {
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  const tabItems = [
    { key: 'branding',   label: '品牌设置',   children: <BrandingTab /> },
    { key: 'ai',         label: 'AI 模型',    children: <AIModelsTab /> },
    { key: 'dashboards', label: '看板模板',   children: <DashboardTemplatesTab /> },
    { key: 'system',     label: '系统参数',   children: <SystemTab /> },
  ]

  return (
    <div style={{ minHeight: '100vh', padding: '72px 32px 100px' }}>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0,
          color: isDark ? '#E8ECF3' : '#1A1D2E' }}>
          平台设置
        </h1>
        <p style={{ fontSize: 13, color: '#9CA3B4', margin: '4px 0 0' }}>
          管理品牌、AI 模型供应商和系统参数
        </p>
      </div>

      <Tabs
        items={tabItems}
        size="large"
        style={{ color: isDark ? '#E8ECF3' : '#1A1D2E' }}
      />
    </div>
  )
}
