import { DeleteOutlined, UploadOutlined } from '@ant-design/icons'
import { Button, Input, message, Upload } from 'antd'
import { useEffect, useState } from 'react'
import { configApi } from '../../services/api'
import { useBrandingStore } from '../../stores/brandingStore'
import { useThemeStore } from '../../stores/themeStore'
import { applyColorRamp } from '../../utils/colorUtils'

const PRESET_COLORS = [
  '#6C5CE7', '#3B82F6', '#00C48C', '#F59E0B',
  '#EF4444', '#EC4899', '#06B6D4', '#1A1D2E',
]

const LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: '#9CA3B4', marginBottom: 6, display: 'block',
}

export default function BrandingTab() {
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const branding = useBrandingStore()

  // Local form state
  const [platformName, setPlatformName]   = useState(branding.platformName)
  const [primaryColor, setPrimaryColor]   = useState(branding.primaryColor)
  const [loginTagline, setLoginTagline]   = useState(branding.loginTagline)
  const [logoLightUrl, setLogoLightUrl]   = useState<string | null>(branding.logoLightUrl)
  const [logoDarkUrl, setLogoDarkUrl]     = useState<string | null>(branding.logoDarkUrl)
  const [faviconUrl, setFaviconUrl]       = useState<string | null>(branding.faviconUrl)
  const [saving, setSaving]               = useState(false)
  const [dirty, setDirty]                 = useState(false)

  // Keep in sync with store after external changes
  useEffect(() => {
    setPlatformName(branding.platformName)
    setPrimaryColor(branding.primaryColor)
    setLoginTagline(branding.loginTagline)
    setLogoLightUrl(branding.logoLightUrl)
    setLogoDarkUrl(branding.logoDarkUrl)
    setFaviconUrl(branding.faviconUrl)
    setDirty(false)
  }, [branding.loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  function markDirty() { setDirty(true) }

  async function handleSave() {
    setSaving(true)
    try {
      await configApi.updateBranding({
        platform_name: platformName,
        primary_color: primaryColor,
        login_tagline: loginTagline,
      })
      branding.apply({
        platform_name: platformName,
        primary_color: primaryColor,
        login_tagline: loginTagline,
        logo_light_url: logoLightUrl,
        logo_dark_url: logoDarkUrl,
        favicon_url: faviconUrl,
      })
      setDirty(false)
      message.success('品牌配置已保存')
    } catch {
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setPlatformName(branding.platformName)
    setPrimaryColor(branding.primaryColor)
    setLoginTagline(branding.loginTagline)
    setLogoLightUrl(branding.logoLightUrl)
    setLogoDarkUrl(branding.logoDarkUrl)
    setFaviconUrl(branding.faviconUrl)
    setDirty(false)
  }

  async function handleLogoUpload(type: 'light' | 'dark', file: File) {
    try {
      const res = await configApi.uploadLogo(type, file)
      if (type === 'light') setLogoLightUrl(res.data.url)
      else setLogoDarkUrl(res.data.url)
      markDirty()
      message.success('Logo 上传成功')
    } catch {
      message.error('上传失败')
    }
    return false
  }

  async function handleLogoDelete(type: 'light' | 'dark') {
    try {
      await configApi.deleteLogo(type)
      if (type === 'light') setLogoLightUrl(null)
      else setLogoDarkUrl(null)
      markDirty()
      message.success('Logo 已删除')
    } catch {
      message.error('删除失败')
    }
  }

  async function handleFaviconDelete() {
    try {
      await configApi.deleteFavicon()
      setFaviconUrl(null)
      markDirty()
      message.success('Favicon 已删除')
    } catch {
      message.error('删除失败')
    }
  }

  async function handleFaviconUpload(file: File) {
    try {
      const res = await configApi.uploadFavicon(file)
      setFaviconUrl(res.data.url)
      markDirty()
      message.success('Favicon 上传成功')
    } catch {
      message.error('上传失败')
    }
    return false
  }

  const cardStyle: React.CSSProperties = {
    background: isDark ? 'rgba(26,29,46,0.6)' : 'rgba(255,255,255,0.8)',
    border: `1px solid ${isDark ? 'rgba(162,155,254,0.1)' : 'rgba(108,92,231,0.08)'}`,
    borderRadius: 16, padding: 24,
  }

  const inputStyle = {
    background: isDark ? 'rgba(10,12,20,0.5)' : 'rgba(248,249,252,0.8)',
    borderColor: isDark ? 'rgba(162,155,254,0.12)' : '#E8ECF3',
    color: isDark ? '#E8ECF3' : '#1A1D2E',
  }

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      {/* ── Left: form ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Platform name */}
        <div style={cardStyle}>
          <span style={LABEL}>平台名称</span>
          <Input
            value={platformName}
            onChange={e => { setPlatformName(e.target.value); markDirty() }}
            style={inputStyle}
          />
        </div>

        {/* Primary color */}
        <div style={cardStyle}>
          <span style={LABEL}>主题色</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: primaryColor, flexShrink: 0,
              boxShadow: `0 2px 8px ${primaryColor}66`,
            }} />
            <Input
              value={primaryColor}
              onChange={e => {
                if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) {
                  setPrimaryColor(e.target.value)
                  if (e.target.value.length === 7) {
                    applyColorRamp(e.target.value)
                    markDirty()
                  }
                }
              }}
              style={{ ...inputStyle, width: 120, fontFamily: 'monospace' }}
            />
          </div>
          {/* Preset swatches */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PRESET_COLORS.map(color => (
              <button
                key={color}
                onClick={() => { setPrimaryColor(color); applyColorRamp(color); markDirty() }}
                style={{
                  width: 28, height: 28, borderRadius: 6, background: color, border: 'none',
                  cursor: 'pointer', flexShrink: 0,
                  outline: color === primaryColor ? `2px solid ${color}` : 'none',
                  outlineOffset: 2,
                  boxShadow: `0 2px 6px ${color}55`,
                  transition: 'transform 0.1s',
                }}
                title={color}
              />
            ))}
          </div>
        </div>

        {/* Logos */}
        <div style={cardStyle}>
          <span style={LABEL}>Logo 上传</span>
          <div style={{ display: 'flex', gap: 16 }}>
            {(['light', 'dark'] as const).map(type => (
              <div key={type} style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: '#9CA3B4', marginBottom: 8 }}>
                  {type === 'light' ? '亮色模式 Logo' : '暗色模式 Logo'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Upload
                    accept=".svg,.png,.jpg,.jpeg"
                    showUploadList={false}
                    beforeUpload={file => handleLogoUpload(type, file)}
                  >
                    <div style={{
                      border: `1.5px dashed ${isDark ? 'rgba(162,155,254,0.2)' : '#E8ECF3'}`,
                      borderRadius: 10, padding: '12px 8px', cursor: 'pointer', textAlign: 'center',
                      background: isDark ? 'rgba(10,12,20,0.3)' : 'rgba(248,249,252,0.6)',
                      transition: 'border-color 0.2s', minWidth: 80,
                    }}>
                      {(type === 'light' ? logoLightUrl : logoDarkUrl) ? (
                        <img
                          src={type === 'light' ? logoLightUrl! : logoDarkUrl!}
                          alt="logo preview"
                          style={{ maxHeight: 40, maxWidth: 80, objectFit: 'contain' }}
                        />
                      ) : (
                        <div style={{ color: '#9CA3B4', fontSize: 12 }}>
                          <UploadOutlined style={{ display: 'block', fontSize: 18, marginBottom: 4 }} />
                          SVG / PNG
                        </div>
                      )}
                    </div>
                  </Upload>
                  {(type === 'light' ? logoLightUrl : logoDarkUrl) && (
                    <Button
                      size="small" danger type="text" icon={<DeleteOutlined />}
                      onClick={() => handleLogoDelete(type)}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Favicon */}
        <div style={cardStyle}>
          <span style={LABEL}>Favicon</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Upload
              accept=".ico,.png,.svg"
              showUploadList={false}
              beforeUpload={file => handleFaviconUpload(file)}
            >
              <div style={{
                border: `1.5px dashed ${isDark ? 'rgba(162,155,254,0.2)' : '#E8ECF3'}`,
                borderRadius: 10, padding: '10px 14px', cursor: 'pointer', textAlign: 'center',
                background: isDark ? 'rgba(10,12,20,0.3)' : 'rgba(248,249,252,0.6)',
              }}>
                {faviconUrl ? (
                  <img src={faviconUrl} alt="favicon" style={{ width: 32, height: 32 }} />
                ) : (
                  <div style={{ color: '#9CA3B4', fontSize: 12 }}>
                    <UploadOutlined style={{ display: 'block', fontSize: 18, marginBottom: 4 }} />
                    .ico / .png
                  </div>
                )}
              </div>
            </Upload>
            {faviconUrl && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <img src={faviconUrl} alt="16px" style={{ width: 16, height: 16 }} />
                <img src={faviconUrl} alt="32px" style={{ width: 32, height: 32 }} />
                <Button
                  size="small" danger type="text" icon={<DeleteOutlined />}
                  onClick={handleFaviconDelete}
                />
              </div>
            )}
          </div>
        </div>

        {/* Login tagline */}
        <div style={cardStyle}>
          <span style={LABEL}>登录页标语</span>
          <Input
            value={loginTagline}
            onChange={e => { setLoginTagline(e.target.value); markDirty() }}
            style={inputStyle}
          />
        </div>

        {/* Save bar */}
        {dirty && (
          <div style={{
            position: 'sticky', bottom: 0, zIndex: 10,
            background: isDark ? 'rgba(10,12,20,0.9)' : 'rgba(244,243,255,0.95)',
            backdropFilter: 'blur(12px)', borderRadius: 12,
            border: `1px solid ${isDark ? 'rgba(162,155,254,0.1)' : 'rgba(108,92,231,0.1)'}`,
            padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', gap: 10,
          }}>
            <Button onClick={handleCancel}>取消</Button>
            <Button type="primary" loading={saving} onClick={handleSave}>
              保存更改
            </Button>
          </div>
        )}
      </div>

      {/* ── Right: live preview ────────────────────────────────────────── */}
      <div style={{ width: 280, flexShrink: 0 }}>
        <div style={{
          ...cardStyle,
          padding: 0, overflow: 'hidden',
          position: 'sticky', top: 80,
        }}>
          <div style={{
            padding: '10px 14px',
            borderBottom: `1px solid ${isDark ? 'rgba(162,155,254,0.08)' : '#E8ECF3'}`,
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: '#9CA3B4',
          }}>
            实时预览
          </div>

          {/* Login page preview */}
          <div style={{
            padding: 16,
            background: isDark ? '#0A0C14' : '#F4F3FF',
            borderBottom: `1px solid ${isDark ? 'rgba(162,155,254,0.08)' : '#E8ECF3'}`,
          }}>
            <div style={{
              background: isDark ? 'rgba(26,29,46,0.7)' : 'rgba(255,255,255,0.85)',
              borderRadius: 10, padding: '14px 16px', textAlign: 'center',
              backdropFilter: 'blur(8px)',
              border: `1px solid ${isDark ? 'rgba(162,155,254,0.1)' : 'rgba(255,255,255,0.6)'}`,
            }}>
              {/* Logo or letter avatar */}
              {(isDark ? logoDarkUrl : logoLightUrl) ? (
                <img
                  src={isDark ? logoDarkUrl! : logoLightUrl!}
                  alt="logo"
                  style={{ height: 28, maxWidth: 100, objectFit: 'contain', marginBottom: 6 }}
                />
              ) : (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: 6,
                  background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}88 100%)`,
                  color: '#fff', fontSize: 13, fontWeight: 700, marginBottom: 6,
                }}>
                  {platformName[0] ?? 'M'}
                </div>
              )}
              <div style={{
                fontSize: 13, fontWeight: 600,
                color: isDark ? '#E8ECF3' : '#1A1D2E', marginBottom: 2,
              }}>
                {platformName || 'MetadataHub'}
              </div>
              <div style={{ fontSize: 10, color: '#9CA3B4', marginBottom: 10 }}>
                {loginTagline}
              </div>
              <div style={{
                background: primaryColor, borderRadius: 6,
                color: '#fff', fontSize: 10, padding: '4px 0', fontWeight: 500,
              }}>
                登 录
              </div>
            </div>
          </div>

          {/* Sidebar preview */}
          <div style={{
            padding: 12,
            background: isDark ? 'rgba(10,12,20,0.8)' : 'rgba(255,255,255,0.85)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{
                width: 22, height: 22, borderRadius: 5,
                background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}88 100%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 10, fontWeight: 700, flexShrink: 0,
              }}>
                {platformName[0] ?? 'M'}
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: isDark ? '#E8ECF3' : '#1A1D2E' }}>
                {platformName}
              </span>
            </div>
            {['数据对话', '数据看板', '上传数据'].map((label, i) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '4px 6px', borderRadius: 6, marginBottom: 2,
                background: i === 0 ? `${primaryColor}18` : 'transparent',
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: i === 0 ? primaryColor : (isDark ? '#3D4255' : '#D1D5DB'),
                }} />
                <span style={{
                  fontSize: 11,
                  color: i === 0 ? primaryColor : (isDark ? '#9CA3B4' : '#5F6B7A'),
                  fontWeight: i === 0 ? 500 : 400,
                }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
