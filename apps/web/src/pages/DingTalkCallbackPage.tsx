import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Spin } from 'antd'
import { authApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'

export default function DingTalkCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('authCode') || params.get('code')
    if (!code) {
      setError('未获取到授权码，请返回重试')
      return
    }
    authApi.dingtalkLogin(code)
      .then(async res => {
        const { access_token, expires_in } = res.data
        useAuthStore.getState().setAuth(access_token, (await authApi.me()).data, expires_in)
        navigate('/partners')
      })
      .catch(err => {
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
          ?? '钉钉登录失败，请重试'
        setError(msg)
      })
  }, [navigate])

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, background:'#F0EEFF' }}>
      {error ? (
        <>
          <div style={{ fontSize:16, color:'#FF4757', fontWeight:600 }}>{error}</div>
          <button onClick={() => navigate('/login')} style={{ padding:'10px 24px', borderRadius:10, background:'#6C5CE7', color:'white', border:'none', cursor:'pointer', fontSize:14 }}>
            返回登录
          </button>
        </>
      ) : (
        <>
          <Spin size="large" />
          <div style={{ fontSize:14, color:'#6B7280' }}>钉钉登录中…</div>
        </>
      )}
    </div>
  )
}
