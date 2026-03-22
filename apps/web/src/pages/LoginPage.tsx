import { DatabaseOutlined, LockOutlined, UserOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Form, Input, Space, Typography } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'

const { Title, Text } = Typography

const QUICK_USERS = [
  { label: '🔑 Admin', email: 'admin@metadatahub.local', password: 'admin123' },
  { label: '📊 华东经理', email: 'manager@metadatahub.local', password: 'manager123' },
  { label: '👁 渠道专员', email: 'rep@metadatahub.local', password: 'rep123' },
  { label: '🏢 阿里云(伙伴)', email: 'partner@metadatahub.local', password: 'partner123' },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const doLogin = async (email: string, password: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await authApi.login(email, password)
      const { access_token, expires_in } = res.data
      const { setAuth: _setAuth } = useAuthStore.getState()
      const meRes = await authApi.me()
      _setAuth(access_token, meRes.data, expires_in)
      navigate('/chat')
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? '登录失败，请检查邮箱和密码'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const onFinish = (values: { email: string; password: string }) =>
    doLogin(values.email, values.password)

  const quickLogin = (email: string, password: string) => {
    form.setFieldsValue({ email, password })
    doLogin(email, password)
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1a1f36 0%, #0f1629 100%)',
      }}
    >
      <Card
        style={{ width: 400, borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
        bodyStyle={{ padding: '40px 36px' }}
      >
        {/* Brand */}
        <Space direction="vertical" align="center" style={{ width: '100%', marginBottom: 32 }}>
          <DatabaseOutlined style={{ fontSize: 40, color: '#6C5CE7' }} />
          <Title level={3} style={{ margin: 0 }}>MetadataHub</Title>
          <Text type="secondary">AI 驱动的数据分析平台</Text>
        </Space>

        {error && (
          <Alert message={error} type="error" showIcon style={{ marginBottom: 20 }} />
        )}

        <Form form={form} layout="vertical" onFinish={onFinish} autoComplete="off">
          <Form.Item name="email" rules={[{ required: true, message: '请输入邮箱' }]}>
            <Input
              prefix={<UserOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="邮箱地址"
              size="large"
            />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password
              prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="密码"
              size="large"
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" size="large" block loading={loading}>
              登录
            </Button>
          </Form.Item>
        </Form>

        {/* Quick switch — dev only */}
        {(import.meta as unknown as { env: { DEV: boolean } }).env.DEV && (
          <div style={{ marginTop: 24 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 10,
              }}
            >
              <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
              <Text style={{ fontSize: 11, color: '#bfbfbf', whiteSpace: 'nowrap' }}>
                快速切换（DEV）
              </Text>
              <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {QUICK_USERS.map((u) => (
                <button
                  key={u.email}
                  onClick={() => quickLogin(u.email, u.password)}
                  disabled={loading}
                  style={{
                    flex: '1 1 calc(50% - 3px)',
                    padding: '6px 0',
                    fontSize: 12,
                    background: '#F8F9FF',
                    border: '1px solid #E8ECF3',
                    borderRadius: 8,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    color: '#5F6B7A',
                    fontFamily: 'inherit',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = '#6C5CE7'
                      ;(e.currentTarget as HTMLButtonElement).style.color = '#6C5CE7'
                      ;(e.currentTarget as HTMLButtonElement).style.background = '#F0EEFF'
                    }
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = '#E8ECF3'
                    ;(e.currentTarget as HTMLButtonElement).style.color = '#5F6B7A'
                    ;(e.currentTarget as HTMLButtonElement).style.background = '#F8F9FF'
                  }}
                >
                  {u.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <Text
          type="secondary"
          style={{ display: 'block', textAlign: 'center', marginTop: 20, fontSize: 12 }}
        >
          默认账号: admin@metadatahub.local / admin123
        </Text>
      </Card>
    </div>
  )
}
