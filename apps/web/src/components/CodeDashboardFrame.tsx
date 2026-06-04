import { useEffect, useMemo, useRef, useState } from 'react'
import { dashboardApi } from '../services/api'
import { message } from 'antd'

interface CodeDashboardFrameProps {
  dashboardId: string
  codeSnapshot: string
  isDark: boolean
  canRefine?: boolean
}

export default function CodeDashboardFrame({
  dashboardId,
  codeSnapshot,
  isDark,
  canRefine = false,
}: CodeDashboardFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeHeight, setIframeHeight] = useState(600)
  const [refineInput, setRefineInput] = useState('')
  const [refining, setRefining] = useState(false)
  const [currentHtml, setCurrentHtml] = useState(codeSnapshot)

  // Listen for iframe height postMessage
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'iframe-height' && typeof e.data.height === 'number') {
        setIframeHeight(Math.max(400, e.data.height + 32))
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  // Inject dark mode class when theme changes
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    if (isDark) {
      doc.documentElement.style.colorScheme = 'dark'
    } else {
      doc.documentElement.style.colorScheme = 'light'
    }
  }, [isDark])

  const handleRefine = async () => {
    if (!refineInput.trim()) return
    setRefining(true)
    try {
      const res = await dashboardApi.refine(dashboardId, refineInput.trim())
      if (res.data.code_snapshot) {
        setCurrentHtml(res.data.code_snapshot)
      }
      setRefineInput('')
      message.success('看板已更新')
    } catch {
      message.error('优化失败，请重试')
    } finally {
      setRefining(false)
    }
  }

  const blobUrl = useMemo(() => {
    const blob = new Blob([currentHtml], { type: 'text/html' })
    return URL.createObjectURL(blob)
  }, [currentHtml])

  useEffect(() => () => URL.revokeObjectURL(blobUrl), [blobUrl])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <iframe
        ref={iframeRef}
        src={blobUrl}
        sandbox="allow-scripts"
        style={{
          width: '100%',
          height: iframeHeight,
          border: 'none',
          borderRadius: 12,
          background: 'transparent',
        }}
        title="AI 生成看板"
        onLoad={() => {
          // Try to get height after load
          setTimeout(() => {
            try {
              const h = iframeRef.current?.contentDocument?.body?.scrollHeight
              if (h && h > 200) setIframeHeight(h + 32)
            } catch {
              // cross-origin may throw; rely on postMessage instead
            }
          }, 1000)
        }}
      />

      {canRefine && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '10px 14px',
            borderRadius: 12,
            background: isDark ? 'rgba(26,29,46,0.55)' : 'rgba(255,255,255,0.72)',
            border: '1px solid rgba(162,155,254,0.1)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <input
            value={refineInput}
            onChange={(e) => setRefineInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleRefine()}
            placeholder="描述你的优化需求，例如：增加区域对比图、改为深色主题…"
            disabled={refining}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 13,
              color: isDark ? '#E8ECF3' : '#1A1D2E',
            }}
          />
          <button
            onClick={handleRefine}
            disabled={refining || !refineInput.trim()}
            style={{
              padding: '4px 14px',
              borderRadius: 8,
              background: refining || !refineInput.trim() ? 'rgba(108,92,231,0.3)' : '#6C5CE7',
              color: 'white',
              border: 'none',
              cursor: refining || !refineInput.trim() ? 'not-allowed' : 'pointer',
              fontSize: 12,
              fontWeight: 500,
              whiteSpace: 'nowrap',
            }}
          >
            {refining ? '生成中…' : 'AI 优化'}
          </button>
        </div>
      )}
    </div>
  )
}
