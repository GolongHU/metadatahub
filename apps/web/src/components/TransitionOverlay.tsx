import { useNavigate } from 'react-router-dom'
import ChartWidget from './ChartWidget'
import MobiusLoader from './MobiusLoader'
import { useViewStore } from '../stores/useViewStore'

export default function TransitionOverlay() {
  const navigate = useNavigate()
  const { viewState, result, pendingQuery, reset, keepResultForChat } = useViewStore()

  if (viewState === 'dashboard' || viewState === 'returning') return null

  const isLoading    = viewState === 'loading'
  const isCollapsing = viewState === 'collapsing'
  const isExploding  = viewState === 'exploding'
  const isResult     = viewState === 'revealing' || viewState === 'chat_result'

  return (
    <div
      style={{
        position:       'fixed',
        inset:          0,
        zIndex:         200,
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        pointerEvents:  isLoading ? 'none' : 'auto',
        background:     isCollapsing
          ? 'transparent'
          : 'rgba(var(--overlay-bg, 248,249,252), 0.55)',
        backdropFilter: isCollapsing ? 'none' : 'blur(2px)',
        transition:     'background 0.3s ease, backdrop-filter 0.3s ease',
      }}
    >
      {/* Loading / exploding phase */}
      {(isCollapsing || isLoading || isExploding) && (
        <div
          style={{
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            gap:            20,
            opacity:        isCollapsing ? 0 : 1,
            transition:     'opacity 0.3s ease 0.4s',
            animation:      isExploding ? 'mobius-explode 0.4s ease-in forwards' : 'none',
          }}
        >
          <MobiusLoader size={120} />
          <p
            style={{
              color:      'var(--text-secondary)',
              fontSize:   14,
              letterSpacing: '0.3px',
              animation:  'fade-pulse 1.4s ease-in-out infinite',
            }}
          >
            AI 正在分析…
          </p>
        </div>
      )}

      {/* Result card */}
      {isResult && result && (
        <div
          className="glass-card"
          style={{
            width:      'min(760px, calc(100vw - 100px))',
            padding:    '28px 32px',
            animation:  'card-reveal 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
            marginLeft: 64,
          }}
        >
          {/* Question */}
          <p
            style={{
              fontSize:     13,
              color:        'var(--text-tertiary)',
              marginBottom: 4,
            }}
          >
            "{pendingQuery}"
          </p>

          {/* SQL badge */}
          <p
            style={{
              fontFamily:   'monospace',
              fontSize:     11,
              color:        'var(--primary-500)',
              background:   'var(--primary-50)',
              borderRadius: 6,
              padding:      '3px 8px',
              display:      'inline-block',
              marginBottom: 16,
              maxWidth:     '100%',
              overflow:     'hidden',
              textOverflow: 'ellipsis',
              whiteSpace:   'nowrap',
            }}
          >
            {result.sql}
          </p>

          {/* Chart */}
          <ChartWidget
            chartType={result.chartType}
            columns={result.columns}
            rows={result.rows}
            height={260}
          />

          {/* Actions */}
          <div
            style={{
              display:        'flex',
              justifyContent: 'flex-end',
              gap:            10,
              marginTop:      20,
            }}
          >
            <button
              onClick={reset}
              style={{
                background:   'transparent',
                border:       '1px solid var(--border-color)',
                borderRadius: 10,
                padding:      '7px 18px',
                cursor:       'pointer',
                fontSize:     13,
                color:        'var(--text-secondary)',
              }}
            >
              ← 返回看板
            </button>
            <button
              onClick={() => {
                keepResultForChat()   // preserve result for ChatPage, trigger return animation
                navigate(`/chat?q=${encodeURIComponent(pendingQuery)}&dataset_id=${result.dataset_id}`)
              }}
              style={{
                background:   'linear-gradient(135deg, #6C5CE7 0%, #A29BFE 100%)',
                border:       'none',
                borderRadius: 10,
                padding:      '7px 18px',
                cursor:       'pointer',
                fontSize:     13,
                color:        '#fff',
                fontWeight:   500,
                boxShadow:    '0 4px 14px rgba(108,92,231,0.35)',
              }}
            >
              深入对话 →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
