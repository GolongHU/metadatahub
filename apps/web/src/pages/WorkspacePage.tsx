import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import api from '../services/api'

// ─── Types ────────────────────────────────────────────────────────────────────
interface WorkspaceData {
  manager_name: string
  role: string
  stats: { total_partners: number; monthly_revenue: number; active_reports: number; deal_rate: number }
  output_trends: Array<{ year: string; total: number }>
  recent_events: Array<{ partner: string; date: string; type: string; desc: string; amount: number }>
  top_partners: Array<{ id: string; name: string; score: number; tier: string; revenue: number; category: string }>
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bgBody:  '#e8e8e8',
  bgWhite: '#ffffff',
  bgGrey:  '#f8f9fa',
  main:    '#1a1b1e',
  muted:   '#8d8d8d',
  border:  '#f1f1f1',
  blue:    '#4a90e2',
  green:   '#34c27f',
  red:     '#f45c5c',
  orange:  '#f5a623',
}

const TIER_COLOR: Record<string,string> = {
  strategic:'#6C5CE7', core:'#3B82F6', growth:'#00C48C', observation:'#FFB946', risk:'#FF4757',
}
const TIER_LABEL: Record<string,string> = {
  strategic:'战略', core:'核心', growth:'成长', observation:'观察', risk:'风险',
}

function scoreColor(s: number) {
  if (s>=8.5) return TIER_COLOR.strategic
  if (s>=7.0) return TIER_COLOR.core
  if (s>=5.0) return TIER_COLOR.growth
  if (s>=3.5) return TIER_COLOR.observation
  return TIER_COLOR.risk
}

// ─── Mini Calendar ────────────────────────────────────────────────────────────
function MiniCalendar({ events }: { events: Array<{date:string}> }) {
  const today = new Date()
  const year = today.getFullYear(), month = today.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month+1, 0).getDate()
  const eventDates = new Set(events.map(e => e.date?.slice(0,10)).filter(Boolean))
  const DAYS = ['日','一','二','三','四','五','六']
  const cells: (number|null)[] = Array(firstDay).fill(null)
  for (let d=1; d<=daysInMonth; d++) cells.push(d)

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <span style={{ fontSize:14, fontWeight:700, color:C.main }}>
          {year}年{month+1}月
        </span>
        <span style={{ fontSize:11, color:C.muted }}>{today.toLocaleDateString('zh-CN',{weekday:'long'})}</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2, marginBottom:6 }}>
        {DAYS.map(d=><div key={d} style={{ textAlign:'center',fontSize:10,color:C.muted,padding:'3px 0',fontWeight:600 }}>{d}</div>)}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
        {cells.map((d,i)=>{
          if (!d) return <div key={i} />
          const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
          const isToday = d===today.getDate()
          const hasEvent = eventDates.has(ds)
          return (
            <div key={i} style={{ textAlign:'center', fontSize:11, padding:'5px 2px', borderRadius:7, position:'relative', background:isToday?C.main:'transparent', color:isToday?'#fff':C.main, fontWeight:isToday?700:400 }}>
              {d}
              {hasEvent && !isToday && (
                <span style={{ position:'absolute', bottom:1, left:'50%', transform:'translateX(-50%)', width:3, height:3, borderRadius:'50%', background:C.blue, display:'block' }} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function WorkspacePage() {
  const navigate = useNavigate()
  const [data, setData] = useState<WorkspaceData|null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<WorkspaceData>('/workspace')
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  const today = new Date()
  const hour = today.getHours()
  const greeting = hour<12 ? '早上好' : hour<18 ? '下午好' : '晚上好'
  const dateStr = today.toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric'})

  const chartOpt = data?.output_trends.length ? {
    backgroundColor: 'transparent',
    grid:{top:16,bottom:22,left:44,right:12,containLabel:false},
    tooltip:{trigger:'axis',backgroundColor:'#0b1126',borderColor:'transparent',textStyle:{color:'#fff',fontSize:12},formatter:(p:{axisValue:string;value:number}[])=>`${p[0].axisValue}年<br/>产出 ¥${p[0].value}万`},
    xAxis:{type:'category',data:data.output_trends.map(t=>t.year),axisLabel:{color:C.muted,fontSize:10},axisLine:{lineStyle:{color:C.border}},axisTick:{show:false}},
    yAxis:{type:'value',axisLabel:{color:C.muted,fontSize:10,formatter:(v:number)=>`${v}万`},splitLine:{lineStyle:{color:C.border,type:'dashed'}},axisLine:{show:false}},
    series:[{type:'line',data:data.output_trends.map(t=>t.total),smooth:true,symbol:'circle',symbolSize:5,lineStyle:{color:C.blue,width:2.5},itemStyle:{color:C.blue},areaStyle:{color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:'rgba(74,144,226,0.2)'},{offset:1,color:'rgba(74,144,226,0)'}]}}}],
  } : null

  const EVENT_CFG: Record<string,{color:string;label:string}> = {
    report: {color:C.blue, label:'报备'},
    revenue:{color:C.green,label:'回款'},
    order:  {color:C.orange,label:'订单'},
  }

  return (
    <div style={{ minHeight:'100vh', padding:'24px 28px', fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", boxSizing:'border-box' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:20, alignItems:'start' }}>

        {/* Main */}
        <main style={{ background:C.bgWhite, borderRadius:16, padding:'28px 32px', display:'flex', flexDirection:'column', boxShadow:'0 2px 8px rgba(0,0,0,0.04)', border:`1px solid ${C.border}` }}>
          {loading ? (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:C.muted, fontSize:14 }}>加载中…</div>
          ) : !data ? (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:C.red, fontSize:14 }}>数据加载失败</div>
          ) : (<>
            {/* Header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:26 }}>
              <div>
                <h1 style={{ fontSize:22, fontWeight:700, color:C.main, margin:'0 0 5px' }}>{greeting}，{data.manager_name}</h1>
                <p style={{ fontSize:13, color:C.muted, margin:0 }}>这里是你管辖伙伴的实时动态</p>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:7, fontSize:12, fontWeight:500, color:C.main, background:C.bgGrey, padding:'8px 14px', borderRadius:9 }}>
                {dateStr}
              </div>
            </div>

            {/* Stats */}
            <div style={{ display:'flex', borderTop:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}`, padding:'18px 0', marginBottom:28 }}>
              {[
                { label:'管辖伙伴',  val:String(data.stats.total_partners),  unit:'家', color:C.main},
                { label:'总回款额',  val:`${data.stats.monthly_revenue}`,    unit:'万', color:C.blue},
                { label:'跟进中报备', val:String(data.stats.active_reports), unit:'条', color:C.orange},
                { label:'成交率',    val:`${data.stats.deal_rate}`,          unit:'%',  color:C.green},
              ].map((s,i,arr)=>(
                <div key={s.label} style={{ flex:1, display:'flex', alignItems:'center', gap:12, padding:`0 ${i===0?0:20}px`, paddingLeft:i===0?0:20, borderRight:i<arr.length-1?`1px solid ${C.border}`:'none' }}>
                  <div style={{ width:3, height:36, borderRadius:2, background:s.color, flexShrink:0 }} />
                  <div>
                    <div style={{ fontSize:11, fontWeight:500, color:C.main, marginBottom:3 }}>{s.label}</div>
                    <div style={{ fontSize:19, fontWeight:700, color:s.color, lineHeight:1 }}>
                      {s.val}<span style={{ fontSize:11, color:C.muted, marginLeft:2 }}>{s.unit}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Chart */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <h2 style={{ fontSize:15, fontWeight:600, color:C.main, margin:0 }}>伙伴产出趋势</h2>
              <span style={{ fontSize:11, color:C.muted }}>历年合计 · 万元</span>
            </div>
            <div style={{ background:C.bgGrey, borderRadius:14, padding:'14px 10px 6px', marginBottom:28 }}>
              {chartOpt
                ? <ReactECharts option={chartOpt} style={{ height:148 }} opts={{ renderer:'canvas' }} notMerge />
                : <div style={{ height:148, display:'flex', alignItems:'center', justifyContent:'center', color:C.muted, fontSize:13 }}>暂无趋势数据</div>
              }
            </div>

            {/* Events */}
            <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:14 }}>
              <h2 style={{ fontSize:15, fontWeight:600, color:C.main, margin:0 }}>近期动态</h2>
              <span style={{ fontSize:12, color:C.muted, borderLeft:`1px solid ${C.border}`, paddingLeft:14 }}>共 {data.recent_events.length} 条</span>
            </div>
            <div>
              {data.recent_events.slice(0,8).map((e,i)=>{
                const et = EVENT_CFG[e.type]||{icon:'📌',color:C.muted,label:'动态'}
                return (
                  <div key={i} style={{ display:'flex', alignItems:'center', padding:'10px 0', borderBottom:i<7?`1px solid ${C.border}`:'none' }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:et.color, marginRight:16, flexShrink:0 }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <span style={{ fontSize:13, fontWeight:600, color:et.color }}>{e.partner}</span>
                      <span style={{ fontSize:13, color:C.main }}> · {e.desc}</span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginLeft:10, flexShrink:0 }}>
                      {e.amount>0 && <span style={{ fontSize:12, fontWeight:600, color:C.main }}>¥{(e.amount/10000).toFixed(1)}万</span>}
                      <span style={{ fontSize:11, background:`${et.color}18`, color:et.color, padding:'2px 7px', borderRadius:6, fontWeight:600 }}>{et.label}</span>
                      <span style={{ fontSize:11, color:C.muted, minWidth:60, textAlign:'right' }}>{e.date?.slice(0,10)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </>)}
        </main>

        {/* Right panel */}
        <div style={{ background:C.bgWhite, borderRadius:16, padding:'24px 20px', display:'flex', flexDirection:'column', gap:20, boxShadow:'0 2px 8px rgba(0,0,0,0.04)', border:`1px solid ${C.border}` }}>
          <MiniCalendar events={data?.recent_events||[]} />
          <div style={{ height:1, background:C.border }} />
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:C.main, marginBottom:14 }}>重点伙伴</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {(data?.top_partners||[]).map((p,i)=>(
                <div key={p.id}
                  onClick={()=>navigate(`/partners?id=${p.id}`)}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 11px', background:C.bgGrey, borderRadius:11, cursor:'pointer', transition:'background 0.15s' }}
                  onMouseEnter={e=>(e.currentTarget.style.background='#f0f0f0')}
                  onMouseLeave={e=>(e.currentTarget.style.background=C.bgGrey)}
                >
                  <div style={{ width:28, height:28, borderRadius:'50%', background:`${scoreColor(p.score)}22`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:scoreColor(p.score), flexShrink:0 }}>{i+1}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:C.main, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.name}</div>
                    <div style={{ fontSize:10, color:C.muted, marginTop:1 }}>¥{p.revenue}万 · {TIER_LABEL[p.tier]||p.tier}</div>
                  </div>
                  <div style={{ fontSize:13, fontWeight:700, color:scoreColor(p.score), flexShrink:0 }}>{p.score.toFixed(1)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
