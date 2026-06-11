import { useEffect, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import api, { datasetsApi } from '../services/api'

// ── Design tokens (match original HTML) ──────────────────────────────────────
const T = {
  bg:     '#f2f4f7',
  white:  '#fff',
  raised: '#f8f9fb',
  navy:   '#0d1f3c',
  blue:   '#2457c5',
  blueL:  '#eef3fd',
  green:  '#0d9f6e',
  greenL: '#e8faf5',
  amber:  '#d97706',
  amberL: '#fffbeb',
  red:    '#dc2626',
  redL:   '#fff1f1',
  text:   '#111827',
  text2:  '#4b5563',
  text3:  '#9ca3af',
  border: '#e5e8ef',
  inner:  '#e6e6e9',
}

const card: React.CSSProperties = {
  background: T.white, borderRadius: 20,
  boxShadow: '0 1px 4px rgba(0,0,0,.06),0 3px 10px rgba(0,0,0,.04)',
  padding: '22px 24px',
}

interface KpiItem  { value: number; target: number; label: string; unit: string }
interface Region   { name: string; count: number; amount: number }
interface Trend    { date: string; count: number }
interface PriLayer { name: string; count: number; color: string }
interface SummaryData {
  kpis: Record<string, KpiItem>
  region_breakdown: Region[]
  cert_trend: Trend[]
  sources: Record<string, string | null>
  dataset_id: string | null
  data_available: boolean
}

function pct(v: number, t: number) { return t ? Math.min(100, Math.round(v / t * 100)) : 0 }
function statusCls(p: number): 'up' | 'w' | 'dn' {
  return p >= 25 ? 'up' : p >= 18 ? 'w' : 'dn'
}
const fillColor = { up: 'linear-gradient(90deg,rgba(74,222,128,.15),#4ADE80)', w: 'linear-gradient(90deg,rgba(251,191,36,.15),#F59E0B)', dn: 'linear-gradient(90deg,rgba(239,68,68,.12),#EF4444)' }
const badgeStyle = {
  up: { background: 'rgba(74,222,128,.22)', color: '#15803D' } as React.CSSProperties,
  w:  { background: 'rgba(251,191,36,.2)',  color: '#78350F' } as React.CSSProperties,
  dn: { background: 'rgba(220,38,38,.12)',  color: '#B91C1C' } as React.CSSProperties,
}
const pctColor = { up: T.text3, w: T.amber, dn: T.red }

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KcCard({ kpi }: { kpi: KpiItem }) {
  const p   = pct(kpi.value, kpi.target)
  const cls = statusCls(p)
  const rhythm = 20

  return (
    <div style={{ ...card, cursor: 'default' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <span style={{ fontSize:15, fontWeight:600, color:T.text2 }}>{kpi.label}</span>
        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
          <span style={{ fontSize:11, color:T.text3 }}>完成</span>
          <span style={{ display:'inline-flex', alignItems:'center', padding:'4px 10px', borderRadius:8, background:'#555', color:'#fff', fontSize:12, fontWeight:700 }}>
            {p}%
          </span>
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'baseline', flexWrap:'nowrap', gap:0, marginBottom:6 }}>
        <span style={{ fontSize:44, fontWeight:900, letterSpacing:-2, lineHeight:1, color:T.text, flexShrink:0 }}>
          {kpi.value.toLocaleString()}
        </span>
        <span style={{ fontSize:28, fontWeight:200, color:T.text3, margin:'0 4px 0 2px', lineHeight:1 }}>/</span>
        <span style={{ fontSize:15, fontWeight:700, fontStyle:'italic', color:T.text3, letterSpacing:-.3, flexShrink:0 }}>
          {kpi.target.toLocaleString()}
        </span>
        <span style={{ fontSize:11, color:T.text3, marginLeft:3, flexShrink:0 }}>{kpi.unit}目标</span>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:12 }}>
        <span style={{ display:'inline-flex', alignItems:'center', padding:'2px 9px', borderRadius:7, fontSize:11, fontWeight:700, ...badgeStyle[cls] }}>
          {cls === 'dn' ? '落后' : cls === 'w' ? '持平' : '进度'}
        </span>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:14 }}>
        <div style={{ flex:1, height:12, background:'rgba(0,0,0,.08)', borderRadius:6, overflow:'hidden', position:'relative' }}>
          <div style={{ height:'100%', borderRadius:6, background:fillColor[cls], width:`${p * 1.5}%`, maxWidth:'100%' }} />
        </div>
        <span style={{ fontSize:18, fontWeight:700, color:pctColor[cls], whiteSpace:'nowrap', minWidth:42, textAlign:'right' }}>{p}%</span>
      </div>
      <div style={{ marginTop:5, fontSize:10, color:T.text3 }}>节奏线 {rhythm}%</div>
    </div>
  )
}

// ── KL Row (horizontal progress bar list) ────────────────────────────────────
function KlRow({ label, fillPct, cls, pctLabel }: { label:string; fillPct:number; cls:'up'|'w'|'dn'; pctLabel:string }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'80px 1fr 46px', alignItems:'center', gap:12 }}>
      <span style={{ fontSize:13, fontWeight:600, color:T.text }}>{label}</span>
      <div style={{ height:20, background:'rgba(0,0,0,.06)', borderRadius:10, position:'relative' }}>
        <div style={{ position:'absolute', left:0, top:0, height:'100%', borderRadius:10, background:fillColor[cls], width:`${fillPct}%` }} />
        <div style={{ position:'absolute', left:'33.3%', top:-4, width:2, height:28, background:'rgba(0,0,0,.2)', borderRadius:1 }} />
      </div>
      <span style={{ fontSize:14, fontWeight:800, textAlign:'right', color: cls==='up'?T.text:cls==='w'?T.amber:T.red }}>{pctLabel}</span>
    </div>
  )
}

// ── Yi Row (YoY highlight) ────────────────────────────────────────────────────
function YiRow({ label, val }: { label:string; val:string }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 13px', background:T.inner, borderRadius:10 }}>
      <span style={{ fontSize:12.5, color:T.text, fontWeight:500 }}>{label}</span>
      <span style={{ fontSize:15, fontWeight:900, color:'#16A34A', letterSpacing:-.5 }}>{val}</span>
    </div>
  )
}

// ── PRI layer bar ─────────────────────────────────────────────────────────────
function PriBar({ name, count, color, total }: { name:string; count:number; color:string; total:number }) {
  const w = total > 0 ? Math.max(2, count / total * 100) : 0
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <span style={{ width:52, fontSize:11.5, color:T.text2, flexShrink:0 }}>{name}</span>
      <div style={{ flex:1, height:7, background:'#eef0f4', borderRadius:4, overflow:'hidden' }}>
        <div style={{ width:`${w}%`, height:'100%', background:color, borderRadius:4 }} />
      </div>
      <span style={{ width:46, textAlign:'right', fontSize:11, fontWeight:700, color }}>{count.toLocaleString()}家</span>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function KpiDashboardPage() {
  const [data, setData]           = useState<SummaryData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRef]      = useState(false)
  const [downloading, setDl]      = useState(false)
  const [lastRefresh, setLast]    = useState('')
  const [showModal, setShowModal] = useState(false)
  const [months, setMonths]       = useState<string[]>([])
  const [selectedYear, setYear]   = useState<string>('')
  const [selectedMonth, setSel]   = useState<string>('')
  const [appliedMonth, setApplied]= useState<string>('')
  const [datasetId, setDatasetId] = useState<string>('')

  const load = async (periodEnd?: string, showRef = false) => {
    showRef ? setRef(true) : setLoading(true)
    try {
      const params = periodEnd ? `?period_end=${periodEnd}` : ''
      const res = await api.get<SummaryData>(`/kpi-dashboard/summary${params}`)
      setData(res.data)
      setDatasetId(res.data.dataset_id || '')
      setApplied(periodEnd || '')
      setLast(new Date().toLocaleString('zh-CN'))
    } catch { setData(null) }
    finally { setLoading(false); setRef(false) }
  }

  const download = async () => {
    if (!datasetId) {
      alert('数据集未加载，请先刷新数据')
      return
    }
    setDl(true)
    try {
      const res = await datasetsApi.download(datasetId)
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `月度运营数据_${appliedMonth || new Date().toISOString().slice(0,7)}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch {
      alert('下载失败，请重试')
    } finally {
      setDl(false)
    }
  }

  useEffect(() => {
    load()
    api.get<{ months: string[]; default: string | null }>('/kpi-dashboard/available-months')
      .then(r => {
        setMonths(r.data.months)
        if (r.data.default) {
          setSel(r.data.default)
          setYear(r.data.default.slice(0, 4))
        }
      })
      .catch(() => {})
  }, [])

  const kpis = data?.kpis || {}

  // Chart.js-style cert trend via ECharts (daily granularity)
  const certOpt = data?.cert_trend?.length ? {
    backgroundColor: 'transparent',
    grid: { top:8, bottom:28, left:36, right:12 },
    xAxis: { type:'category', data: data.cert_trend.map(t => t.date.slice(5)), axisLabel:{fontSize:9,color:T.text3,interval:Math.max(0,Math.floor(data.cert_trend.length/20)-1)}, axisLine:{lineStyle:{color:T.border}}, axisTick:{show:false} },
    yAxis: { type:'value', axisLabel:{fontSize:10,color:T.text3}, splitLine:{lineStyle:{color:T.border,type:'dashed'}}, axisLine:{show:false} },
    series: [{ type:'bar', data: data.cert_trend.map(t=>t.count), itemStyle:{color:T.blue, borderRadius:[4,4,0,0]}, barMaxWidth:8 }],
    tooltip: { trigger:'axis', backgroundColor:'#111827', borderColor:'transparent', textStyle:{color:'#f9fafb',fontSize:12}, formatter:(p:{axisValue:string;value:number}[])=>`${p[0].axisValue}: ${p[0].value}家` },
  } : null

  // Region bar chart
  const regionOpt = data?.region_breakdown?.length ? {
    backgroundColor: 'transparent',
    grid: { top:8, bottom:36, left:12, right:12, containLabel:true },
    xAxis: { type:'category', data: data.region_breakdown.slice(0,8).map(r=>r.name.length>6?r.name.slice(0,6)+'…':r.name), axisLabel:{fontSize:10,color:T.text3,rotate:20}, axisLine:{lineStyle:{color:T.border}}, axisTick:{show:false} },
    yAxis: { type:'value', axisLabel:{fontSize:10,color:T.text3}, splitLine:{lineStyle:{color:T.border,type:'dashed'}}, axisLine:{show:false} },
    series: [{ type:'bar', data: data.region_breakdown.slice(0,8).map((r,i)=>({ value:r.count, itemStyle:{color:`hsl(${215+i*15},60%,${55-i*2}%)`,borderRadius:[4,4,0,0]} })), barMaxWidth:36 }],
    tooltip: { trigger:'axis', backgroundColor:'#111827', borderColor:'transparent', textStyle:{color:'#f9fafb',fontSize:12}, formatter:(p:{name:string;value:number}[])=>`${p[0].name}: ${p[0].value}条` },
  } : null

  // KPI list items
  const klItems = [
    { label:'商机报备', p: pct(kpis.report_count?.value||0, kpis.report_count?.target||1) },
    { label:'产单伙伴', p: pct(kpis.partner_count?.value||0, kpis.partner_count?.target||1) },
    { label:'认证级',   p: pct(kpis.cert_new?.value||0, kpis.cert_new?.target||1) },
    { label:'非直签',   p: pct(kpis.nozh_amount?.value||0, kpis.nozh_amount?.target||1) },
  ]

  // PRI layers (from partner data)
  const priLayers: PriLayer[] = [
    { name:'核心伙伴', count:9,    color:'#DC2626' },
    { name:'价值伙伴', count:156,  color:'#0d9f6e' },
    { name:'潜力伙伴', count:202,  color:'#d97706' },
    { name:'增长引擎', count:281,  color:'#2457c5' },
    { name:'普通伙伴', count:2591, color:'#9ca3af' },
  ]
  const priTotal = priLayers.reduce((s,l)=>s+l.count,0)

  const kpiOrder = ['report_count','partner_count','nozh_amount','cert_new']

  return (
    <div style={{ padding:'20px 32px 40px', minHeight:'100vh', background:T.bg, fontFamily:"'PingFang SC','Microsoft YaHei','Helvetica Neue',Arial,sans-serif" }}>

      {/* Header bar */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:18, fontWeight:800, color:T.navy, margin:0, letterSpacing:-.3 }}>月度运营 KPI 总览</h1>
          <p style={{ fontSize:11, color:T.text3, margin:'4px 0 0', fontFamily:"'Courier New',monospace" }}>
            {appliedMonth
              ? `统计范围：${appliedMonth.slice(0,4)}年 1月 – ${parseInt(appliedMonth.slice(5))}月`
              : lastRefresh ? `最后刷新 ${lastRefresh}` : '上传月度考核文件后点刷新即可同步'}
          </p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={download} disabled={downloading || !data?.data_available} style={{
            background: '#10b981', color:'#fff', border:'none', padding:'7px 16px',
            borderRadius:8, cursor: downloading || !data?.data_available ? 'not-allowed' : 'pointer',
            fontSize:12, fontWeight:600, opacity: downloading || !data?.data_available ? .7 : 1,
            display:'flex', alignItems:'center', gap:6,
          }}>
            <svg viewBox="0 0 16 16" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M8 2v8M5 7l3 3 3-3" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 13h12" strokeLinecap="round"/>
            </svg>
            {downloading ? '下载中…' : '下载数据'}
          </button>
          <button onClick={() => setShowModal(true)} disabled={refreshing} style={{
            background: T.blue, color:'#fff', border:'none', padding:'7px 16px',
            borderRadius:8, cursor: refreshing ? 'not-allowed' : 'pointer',
            fontSize:12, fontWeight:600, opacity: refreshing ? .7 : 1,
            display:'flex', alignItems:'center', gap:6,
          }}>
            <svg viewBox="0 0 16 16" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="1.8"
              style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }}>
              <path d="M14 8A6 6 0 1 1 8 2" strokeLinecap="round"/>
              <path d="M14 2v4h-4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {refreshing ? '刷新中…' : '刷新数据'}
          </button>
        </div>
      </div>

      {/* 时间范围弹窗：先选年，再选月 */}
      {showModal && (() => {
        const years = [...new Set(months.map(m => m.slice(0,4)))].sort((a,b) => b.localeCompare(a))
        const curYearMonths = months.filter(m => m.startsWith(selectedYear)).sort()
        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.35)', zIndex:1000,
            display:'flex', alignItems:'center', justifyContent:'center' }}
            onClick={() => setShowModal(false)}>
            <div style={{ background:'#fff', borderRadius:20, padding:'28px 32px', width:400,
              boxShadow:'0 20px 60px rgba(0,0,0,.18)' }}
              onClick={e => e.stopPropagation()}>

              <div style={{ fontSize:16, fontWeight:800, color:T.navy, marginBottom:4 }}>选择统计截止月份</div>
              <div style={{ fontSize:12, color:T.text3, marginBottom:22 }}>统计范围：所选年份 1月 起至所选截止月</div>

              {/* 第一步：选年 */}
              <div style={{ fontSize:11, fontWeight:700, color:T.text3, letterSpacing:.4, marginBottom:8, textTransform:'uppercase' }}>年份</div>
              <div style={{ display:'flex', gap:8, marginBottom:22 }}>
                {(years.length > 0 ? years : [String(new Date().getFullYear())]).map(y => (
                  <button key={y} onClick={() => { setYear(y); setSel('') }} style={{
                    flex:1, padding:'10px 0', borderRadius:10, border:'none', cursor:'pointer',
                    fontWeight:700, fontSize:15,
                    background: selectedYear === y ? T.navy : T.blueL,
                    color:      selectedYear === y ? '#fff'  : T.blue,
                    transition:'all .15s',
                  }}>{y}</button>
                ))}
              </div>

              {/* 第二步：选月 */}
              <div style={{ fontSize:11, fontWeight:700, color:T.text3, letterSpacing:.4, marginBottom:8, textTransform:'uppercase' }}>截止月份</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:26 }}>
                {Array.from({length:12}, (_,i) => {
                  const mo = `${selectedYear}-${String(i+1).padStart(2,'0')}`
                  const hasData = curYearMonths.includes(mo)
                  const active  = selectedMonth === mo
                  return (
                    <button key={mo} onClick={() => hasData && setSel(mo)} style={{
                      padding:'10px 0', borderRadius:10, border:'none',
                      cursor: hasData ? 'pointer' : 'default',
                      fontWeight:700, fontSize:13,
                      background: active ? T.blue : hasData ? T.blueL : '#f3f4f6',
                      color:      active ? '#fff'  : hasData ? T.blue  : T.text3,
                      transition:'all .15s',
                    }}>{i+1}月</button>
                  )
                })}
              </div>

              <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
                <button onClick={() => setShowModal(false)} style={{
                  padding:'8px 20px', borderRadius:9, border:`1px solid ${T.border}`,
                  background:'#fff', color:T.text2, fontSize:13, fontWeight:600, cursor:'pointer',
                }}>取消</button>
                <button
                  disabled={!selectedMonth}
                  onClick={() => { setShowModal(false); load(selectedMonth, true) }}
                  style={{
                    padding:'8px 20px', borderRadius:9, border:'none',
                    background: selectedMonth ? T.blue : '#d1d5db',
                    color:'#fff', fontSize:13, fontWeight:600,
                    cursor: selectedMonth ? 'pointer' : 'not-allowed',
                  }}>确认刷新</button>
              </div>
            </div>
          </div>
        )
      })()}

      {loading ? (
        <div style={{ textAlign:'center', padding:'80px 0', color:T.text3, fontSize:14 }}>加载中…</div>
      ) : !data?.data_available ? (
        <div style={{ textAlign:'center', padding:'80px 0' }}>
          <div style={{ fontSize:48, marginBottom:16 }}>📊</div>
          <p style={{ fontSize:16, color:T.navy, fontWeight:700, margin:'0 0 10px' }}>暂无考核数据</p>
          <p style={{ fontSize:13, color:T.text3, marginBottom:8 }}>请先上传月度考核 Excel 文件，上传后点「刷新数据」</p>
          <p style={{ fontSize:11, color:T.text3 }}>
            文件名需包含：
            {['明细表','商机报备明细表','非直签项目明细表','认证级新增伙伴明细表'].map(k=>(
              <code key={k} style={{ background:'#f3f4f6', padding:'1px 6px', borderRadius:4, margin:'0 3px' }}>{k}</code>
            ))}
          </p>
        </div>
      ) : (<>

        {/* Row 1: 4 KPI Cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:12 }}>
          {kpiOrder.map(k => kpis[k] && <KcCard key={k} kpi={kpis[k]} />)}
        </div>

        {/* Row 2: radar | KPI list | YoY */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr 1fr', gap:12, marginBottom:12 }}>

          {/* 区域分布 */}
          <div style={card}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18, paddingBottom:12, borderBottom:`1px solid rgba(0,0,0,.06)` }}>
              <span style={{ fontSize:14, color:T.text, fontWeight:800, letterSpacing:-.3 }}>区域报备分布</span>
            </div>
            {regionOpt
              ? <ReactECharts option={regionOpt} style={{ height:260 }} opts={{ renderer:'canvas' }} notMerge />
              : <div style={{ height:260, display:'flex', alignItems:'center', justifyContent:'center', color:T.text3, fontSize:13 }}>暂无数据</div>
            }
          </div>

          {/* 六大KPI完成率 */}
          <div style={card}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18, paddingBottom:12, borderBottom:`1px solid rgba(0,0,0,.06)` }}>
              <span style={{ fontSize:14, color:T.text, fontWeight:800, letterSpacing:-.3 }}>六大KPI完成率</span>
              <span style={{ fontSize:10, color:T.text3 }}>竖线 = 节奏线 20%</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {klItems.map(({ label, p }) => (
                <KlRow key={label} label={label} fillPct={Math.min(p * 1.5, 100)} cls={statusCls(p)} pctLabel={`${p}%`} />
              ))}
            </div>
            <div style={{ marginTop:16, paddingTop:13, borderTop:`1px solid rgba(0,0,0,.06)`, fontSize:12.5, color:T.text2, display:'flex', gap:20, fontWeight:600 }}>
              <span>过程指标 <b style={{ color:'#16A34A' }}>{klItems.filter(i=>i.p>=20).length >= 2 ? '健康' : '待改善'}</b></span>
              <span>产出转化 <b style={{ color:T.red }}>待攻坚</b></span>
            </div>
          </div>

          {/* 同比亮点 */}
          <div style={card}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18, paddingBottom:12, borderBottom:`1px solid rgba(0,0,0,.06)` }}>
              <span style={{ fontSize:14, color:T.text, fontWeight:800, letterSpacing:-.3 }}>同比亮点</span>
              <span style={{ fontSize:10, color:T.text3 }}>vs 2025同期</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              <YiRow label="商机报备" val="+32%" />
              <YiRow label="商城订单" val="+61%" />
              <YiRow label="非直签金额" val="+23%" />
              <YiRow label="认证级伙伴" val="+29%" />
              <YiRow label="产单伙伴" val="+20%" />
              <YiRow label="核心伙伴" val="+10%" />
            </div>
          </div>
        </div>

        {/* Row 3: 认证趋势 | 运营资产 */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>

          {/* 认证级伙伴新增趋势 */}
          <div style={card}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18, paddingBottom:12, borderBottom:`1px solid rgba(0,0,0,.06)` }}>
              <span style={{ fontSize:14, color:T.text, fontWeight:800, letterSpacing:-.3 }}>认证级伙伴新增趋势</span>
              <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap', justifyContent:'flex-end' }}>
                <span style={{ fontSize:11, color:T.text3 }}>数据截至 {appliedMonth ? `${appliedMonth.slice(0,4)}年${parseInt(appliedMonth.slice(5))}月` : '最新上传'}</span>
                {data.cert_trend.length > 0 && (() => {
                  const totalCert = data.cert_trend.reduce((s,t)=>s+t.count,0)
                  return (
                    <span style={{ fontSize:11, background:'#EEF7F5', color:'#4a8080', padding:'2px 8px', borderRadius:6, fontWeight:600, whiteSpace:'nowrap' }}>
                      累计 {totalCert} 家 &nbsp;<span style={{ color:'#16A34A' }}>+29%↑</span>
                    </span>
                  )
                })()}
              </div>
            </div>
            {certOpt
              ? <ReactECharts option={certOpt} style={{ height:190 }} opts={{ renderer:'canvas' }} notMerge />
              : <div style={{ height:190, display:'flex', alignItems:'center', justifyContent:'center', color:T.text3, fontSize:13 }}>暂无趋势数据</div>
            }
          </div>

          {/* 运营资产 & 活跃度 */}
          <div style={card}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18, paddingBottom:12, borderBottom:`1px solid rgba(0,0,0,.06)` }}>
              <span style={{ fontSize:14, color:T.text, fontWeight:800, letterSpacing:-.3 }}>运营资产 &amp; 活跃度</span>
              <span style={{ fontSize:10, color:T.text3 }}>来自伙伴数据仓</span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1px 1fr', gap:'0 14px', height:'calc(100% - 52px)' }}>
              {/* PRI 分层 */}
              <div>
                <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:10 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:T.text3, letterSpacing:.05 }}>PRI 伙伴健康分层</div>
                  <div style={{ fontSize:11, color:T.text2 }}>均值 <strong style={{ color:T.navy, fontSize:16 }}>3.30</strong> <span style={{ fontSize:10, color:T.text3 }}>/10</span></div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                  {priLayers.map(l=>(
                    <PriBar key={l.name} name={l.name} count={l.count} color={l.color} total={priTotal} />
                  ))}
                </div>
                <div style={{ marginTop:10, padding:'7px 11px', background:'#FFF1F1', borderRadius:8, fontSize:11, color:'#991B1B' }}>
                  高价值层（核心+价值）仅 <strong>{priLayers.slice(0,2).reduce((s,l)=>s+l.count,0)}家</strong>，培育空间大
                </div>
              </div>
              {/* 分隔线 */}
              <div style={{ background:T.border }} />
              {/* 万众活跃度 */}
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:T.text3, letterSpacing:.05, marginBottom:10 }}>万众平台 30日活跃率（大区）</div>
                <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                  {[
                    { name:'华南', w:56, color:'#16A34A', val:'14.0%' },
                    { name:'华中', w:53.6, color:'#16A34A', val:'13.4%' },
                    { name:'华东', w:50.4, color:'#7B9ED9', val:'12.6%' },
                    { name:'北区', w:39.2, color:'#C97070', val:'9.8%' },
                    { name:'西南西北', w:39.2, color:'#C97070', val:'9.8%' },
                  ].map(({ name, w, color, val }) => (
                    <div key={name} style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ width:52, fontSize:11.5, color:T.text2, flexShrink:0 }}>{name}</span>
                      <div style={{ flex:1, height:7, background:'#eef0f4', borderRadius:4, overflow:'hidden' }}>
                        <div style={{ width:`${w}%`, height:'100%', background:color, borderRadius:4 }} />
                      </div>
                      <span style={{ width:40, textAlign:'right', fontSize:11, fontWeight:700, color }}>{val}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop:10, padding:'7px 11px', background:'#EEF3FD', borderRadius:8, fontSize:11, color:'#1E40AF' }}>
                  活跃账号 <strong>757</strong>（伙伴 <strong>469</strong>家）&nbsp;<span style={{ color:'#16A34A', fontWeight:700 }}>环比 +110%↑</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Data sources footer */}
        <div style={{ marginTop:12, padding:'10px 18px', background:T.white, borderRadius:12, border:`1px solid ${T.border}`, display:'flex', gap:20, flexWrap:'wrap', alignItems:'center' }}>
          <span style={{ fontSize:11, color:T.text3, fontWeight:600, flexShrink:0 }}>当前数据来源：</span>
          {Object.entries(data.sources).map(([k,v]) => (
            <span key={k} style={{ fontSize:11, color: v ? T.text2 : '#FCA5A5' }}>
              {k}：{v ? <span style={{ color:T.text, fontWeight:500 }}>{v}</span> : '未上传'}
            </span>
          ))}
        </div>
      </>)}

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
