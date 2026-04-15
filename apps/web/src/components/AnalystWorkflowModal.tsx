import { useEffect, useState } from 'react'
import { message } from 'antd'
import api from '../services/api'

interface ProposedWidget {
  title: string
  chart_type: string
  purpose: string
  sql_hint: string
  col_span: number
}

interface AnalysisAngle {
  id: string
  title: string
  business_question: string
  reasoning: string
  is_recommended: boolean
  proposed_widgets: ProposedWidget[]
}

interface AnalysisPlan {
  data_understanding: string
  angles: AnalysisAngle[]
}

interface Props {
  open: boolean
  datasetId: string
  datasetName: string
  isDark: boolean
  onClose: () => void
  onSuccess: (dashboardId: string) => void
}

type Step = 'analyzing' | 'select_angles' | 'generating'

export function AnalystWorkflowModal({
  open, datasetId, datasetName, isDark, onClose, onSuccess,
}: Props) {
  const [step, setStep] = useState<Step>('analyzing')
  const [plan, setPlan] = useState<AnalysisPlan | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [followup, setFollowup] = useState('')
  const [refining, setRefining] = useState(false)

  useEffect(() => {
    if (open) {
      setPlan(null)
      setSelectedIds(new Set())
      setFollowup('')
      setStep('analyzing')
      callPropose()
    }
  }, [open])  // eslint-disable-line react-hooks/exhaustive-deps

  const callPropose = async (userFollowup?: string, prevPlan?: AnalysisPlan) => {
    setStep('analyzing')
    try {
      const res = await api.post('/dashboards/propose', {
        dataset_id: datasetId,
        user_followup: userFollowup || null,
        previous_plan: prevPlan || null,
      })
      const newPlan: AnalysisPlan = res.data
      setPlan(newPlan)
      setSelectedIds(new Set(newPlan.angles.filter((a) => a.is_recommended).map((a) => a.id)))
      setStep('select_angles')
    } catch {
      message.error('AI 分析师暂时不可用，请重试')
      onClose()
    }
  }

  const handleFollowup = async () => {
    if (!followup.trim() || !plan) return
    setRefining(true)
    await callPropose(followup, plan)
    setFollowup('')
    setRefining(false)
  }

  const toggleAngle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleGenerate = async () => {
    if (!plan || selectedIds.size === 0) {
      message.warning('请至少选择一个分析角度')
      return
    }
    setStep('generating')
    try {
      const res = await api.post('/dashboards/generate-from-plan', {
        dataset_id: datasetId,
        plan,
        selected_angle_ids: Array.from(selectedIds),
      })
      message.success('看板已生成')
      onSuccess(res.data.id)
      onClose()
    } catch {
      message.error('生成失败，请重试')
      setStep('select_angles')
    }
  }

  const totalWidgets = plan?.angles
    .filter((a) => selectedIds.has(a.id))
    .reduce((sum, a) => sum + a.proposed_widgets.length, 0) ?? 0

  if (!open) return null

  // ── Overlay ──────────────────────────────────────────────────────────────
  const bg = isDark ? 'rgba(8,10,18,0.7)' : 'rgba(0,0,0,0.3)'
  const cardBg = isDark ? 'rgba(13,16,31,0.97)' : 'rgba(255,255,255,0.98)'
  const border = isDark ? 'rgba(162,155,254,0.12)' : 'rgba(108,92,231,0.15)'
  const textPrimary = isDark ? '#E8ECF3' : '#1A1D2E'
  const textSecondary = isDark ? '#9CA3B4' : '#5F6B7A'
  const textMuted = isDark ? '#5F6B7A' : '#9CA3B4'
  const cardInner = isDark ? 'rgba(26,29,46,0.6)' : 'rgba(245,243,255,0.5)'

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: bg,
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 720,
        background: cardBg,
        backdropFilter: 'blur(24px)',
        border: `1px solid ${border}`,
        borderRadius: 20,
        padding: '28px 32px',
        maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 16, right: 16,
            background: 'none', border: 'none', cursor: 'pointer',
            color: textMuted, fontSize: 18, lineHeight: 1, padding: 4,
          }}
        >✕</button>

        {step === 'analyzing' && <AnalyzingView datasetName={datasetName} textSecondary={textSecondary} textMuted={textMuted} />}

        {step === 'select_angles' && plan && (
          <SelectAnglesView
            plan={plan}
            datasetName={datasetName}
            selectedIds={selectedIds}
            onToggle={toggleAngle}
            followup={followup}
            setFollowup={setFollowup}
            onFollowup={handleFollowup}
            refining={refining}
            totalWidgets={totalWidgets}
            onGenerate={handleGenerate}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
            textMuted={textMuted}
            cardInner={cardInner}
            border={border}
          />
        )}

        {step === 'generating' && (
          <GeneratingView count={totalWidgets} textSecondary={textSecondary} textMuted={textMuted} />
        )}
      </div>
    </div>
  )
}

// ── Sub-views ─────────────────────────────────────────────────────────────────

function AnalyzingView({ datasetName, textSecondary, textMuted }: {
  datasetName: string; textSecondary: string; textMuted: string
}) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <div style={{
        width: 52, height: 52, margin: '0 auto 20px', borderRadius: '50%',
        background: 'rgba(108,92,231,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'mh-pulse 2s ease-in-out infinite',
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6C5CE7" strokeWidth="1.8">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 8v4l3 3"/>
        </svg>
      </div>
      <div style={{ fontSize: 14, color: textSecondary, marginBottom: 6 }}>AI 分析师正在阅读数据</div>
      <div style={{ fontSize: 12, color: textMuted }}>{datasetName}</div>
      <style>{`@keyframes mh-pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.08);opacity:0.75} }`}</style>
    </div>
  )
}

function GeneratingView({ count, textSecondary, textMuted }: {
  count: number; textSecondary: string; textMuted: string
}) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <div style={{
        width: 52, height: 52, margin: '0 auto 20px', borderRadius: '50%',
        background: 'rgba(108,92,231,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'mh-spin 1.4s linear infinite',
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6C5CE7" strokeWidth="2">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
      </div>
      <div style={{ fontSize: 14, color: textSecondary, marginBottom: 6 }}>
        正在生成 {count} 个图表组件
      </div>
      <div style={{ fontSize: 12, color: textMuted }}>AI 正在为每个组件编写 SQL 查询</div>
      <style>{`@keyframes mh-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function SelectAnglesView({
  plan, datasetName, selectedIds, onToggle,
  followup, setFollowup, onFollowup, refining,
  totalWidgets, onGenerate,
  textPrimary, textSecondary, textMuted, cardInner, border,
}: {
  plan: AnalysisPlan
  datasetName: string
  selectedIds: Set<string>
  onToggle: (id: string) => void
  followup: string
  setFollowup: (v: string) => void
  onFollowup: () => void
  refining: boolean
  totalWidgets: number
  onGenerate: () => void
  textPrimary: string
  textSecondary: string
  textMuted: string
  cardInner: string
  border: string
}) {
  return (
    <>
      {/* Header */}
      <div style={{ marginBottom: 16, flexShrink: 0 }}>
        <div style={{ fontSize: 11, color: textMuted, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4 }}>
          Step 1 of 2 · AI 数据分析方案
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: textPrimary }}>{datasetName}</div>
      </div>

      {/* Data understanding */}
      <div style={{
        background: cardInner,
        border: `1px solid ${border}`,
        borderRadius: 14,
        padding: '14px 16px',
        marginBottom: 16,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#A29BFE" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
          </svg>
          <span style={{ fontSize: 11, color: '#A29BFE', fontWeight: 500 }}>AI 数据理解</span>
        </div>
        <div style={{
          fontSize: 13, lineHeight: 1.75, color: textSecondary,
          paddingLeft: 12, borderLeft: '2px solid rgba(108,92,231,0.4)',
        }}>
          {plan.data_understanding}
        </div>
      </div>

      {/* Angles list — scrollable */}
      <div style={{ fontSize: 12, color: textMuted, marginBottom: 10, flexShrink: 0 }}>
        推荐 <strong style={{ color: textPrimary }}>{plan.angles.length} 个分析角度</strong>，请勾选你想要的：
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {plan.angles.map((angle) => {
          const selected = selectedIds.has(angle.id)
          return (
            <div
              key={angle.id}
              onClick={() => onToggle(angle.id)}
              style={{
                background: selected ? 'rgba(108,92,231,0.06)' : cardInner,
                border: selected ? '1.5px solid #6C5CE7' : `1px solid ${border}`,
                borderRadius: 14, padding: '14px 16px',
                cursor: 'pointer', position: 'relative',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              {/* Checkbox */}
              <div style={{
                position: 'absolute', top: 14, right: 16,
                width: 18, height: 18, borderRadius: '50%',
                background: selected ? '#6C5CE7' : 'transparent',
                border: selected ? 'none' : `1.5px solid ${border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {selected && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                )}
              </div>

              {/* Title row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, paddingRight: 28 }}>
                {angle.is_recommended && (
                  <span style={{
                    fontSize: 10, padding: '1px 7px', borderRadius: 10,
                    background: 'rgba(108,92,231,0.15)', color: '#A29BFE', fontWeight: 500,
                  }}>推荐</span>
                )}
                <span style={{ fontSize: 13, fontWeight: 600, color: textPrimary }}>{angle.title}</span>
              </div>

              <div style={{ fontSize: 12, color: textSecondary, lineHeight: 1.6, marginBottom: 6 }}>
                {angle.business_question}
              </div>

              <div style={{ fontSize: 11, color: textMuted }}>
                包含 {angle.proposed_widgets.length} 个组件：
                {angle.proposed_widgets.map((w) => w.title).join(' · ')}
              </div>
            </div>
          )
        })}
      </div>

      {/* Followup input */}
      <div style={{
        background: cardInner, border: `1px solid ${border}`,
        borderRadius: 12, padding: '10px 14px',
        marginBottom: 14, flexShrink: 0,
      }}>
        <div style={{ fontSize: 10, color: textMuted, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          或者，告诉 AI 你想要什么
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={followup}
            onChange={(e) => setFollowup(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onFollowup()}
            disabled={refining}
            placeholder="例如：加一个按销售负责人分组的逾期金额对比"
            style={{
              flex: 1, background: 'transparent',
              border: `1px solid ${border}`, borderRadius: 8,
              padding: '7px 12px', fontSize: 12, color: textPrimary,
              outline: 'none', fontFamily: 'inherit',
            }}
          />
          <button
            onClick={onFollowup}
            disabled={refining || !followup.trim()}
            style={{
              background: 'linear-gradient(135deg, #6C5CE7, #A29BFE)',
              color: '#fff', border: 'none', borderRadius: 8,
              padding: '7px 16px', fontSize: 12, fontWeight: 500,
              cursor: refining || !followup.trim() ? 'not-allowed' : 'pointer',
              opacity: refining || !followup.trim() ? 0.5 : 1,
              fontFamily: 'inherit', whiteSpace: 'nowrap',
            }}
          >
            {refining ? '思考中…' : '追问'}
          </button>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 12, color: textMuted }}>
          已选 <strong style={{ color: textPrimary }}>{selectedIds.size}</strong> 个角度
          · 预计 <strong style={{ color: textPrimary }}>{totalWidgets}</strong> 个组件
        </div>
        <button
          onClick={onGenerate}
          disabled={selectedIds.size === 0}
          style={{
            background: 'linear-gradient(135deg, #6C5CE7, #A29BFE)',
            color: '#fff', border: 'none', borderRadius: 10,
            padding: '10px 24px', fontSize: 13, fontWeight: 500,
            cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer',
            opacity: selectedIds.size === 0 ? 0.4 : 1,
            fontFamily: 'inherit',
          }}
        >
          生成看板 →
        </button>
      </div>
    </>
  )
}
