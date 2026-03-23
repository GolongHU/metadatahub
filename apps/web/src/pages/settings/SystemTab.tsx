import { Checkbox, InputNumber } from 'antd'
import { useThemeStore } from '../../stores/themeStore'

const LABEL: React.CSSProperties = {
  fontSize: 12, color: '#9CA3B4', width: 180, flexShrink: 0,
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
      borderBottom: '1px solid transparent' }}>
      <span style={LABEL}>{label}</span>
      {children}
    </div>
  )
}

export default function SystemTab() {
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  const cardBg = isDark ? 'rgba(26,29,46,0.5)' : 'rgba(255,255,255,0.8)'
  const border = isDark ? 'rgba(162,155,254,0.10)' : 'rgba(108,92,231,0.08)'
  const sectionTitle: React.CSSProperties = {
    fontWeight: 600, fontSize: 13, marginBottom: 14,
    color: isDark ? '#E8ECF3' : '#1A1D2E',
  }
  const divider: React.CSSProperties = {
    height: 1, background: isDark ? 'rgba(162,155,254,0.06)' : '#F1F3F9',
    margin: '4px 0',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Limits */}
      <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: 24 }}>
        <div style={sectionTitle}>限制参数</div>
        <Row label="上传文件大小限制">
          <InputNumber defaultValue={50} min={1} max={500} addonAfter="MB" style={{ width: 140 }} disabled />
        </Row>
        <div style={divider} />
        <Row label="SQL 查询超时时间">
          <InputNumber defaultValue={30} min={5} max={300} addonAfter="秒" style={{ width: 140 }} disabled />
        </Row>
        <div style={divider} />
        <Row label="数据导出行数上限">
          <InputNumber defaultValue={10000} min={100} max={100000} style={{ width: 140 }} disabled />
        </Row>
        <div style={divider} />
        <Row label="会话超时时间">
          <InputNumber defaultValue={60} min={15} max={480} addonAfter="分钟" style={{ width: 140 }} disabled />
        </Row>
        <div style={{ marginTop: 12, fontSize: 11, color: '#9CA3B4' }}>
          * 参数配置功能即将上线
        </div>
      </div>

      {/* Feature flags */}
      <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: 24 }}>
        <div style={sectionTitle}>功能开关</div>
        {[
          { label: '看板市场',  checked: false, disabled: true  },
          { label: '数据导出',  checked: false, disabled: true  },
          { label: 'AI 对话',   checked: true,  disabled: true  },
          { label: '数据看板',  checked: true,  disabled: true  },
        ].map(item => (
          <div key={item.label} style={{ marginBottom: 10 }}>
            <Checkbox checked={item.checked} disabled={item.disabled}>
              <span style={{ fontSize: 13, color: isDark ? '#9CA3B4' : '#5F6B7A' }}>
                {item.label}
                {item.disabled && (
                  <span style={{ marginLeft: 8, fontSize: 10,
                    background: isDark ? 'rgba(255,255,255,0.06)' : '#F1F3F9',
                    color: '#9CA3B4', borderRadius: 4, padding: '1px 6px' }}>
                    即将上线
                  </span>
                )}
              </span>
            </Checkbox>
          </div>
        ))}
      </div>

    </div>
  )
}
