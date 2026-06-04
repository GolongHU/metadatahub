import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AutoComplete, Input, Spin } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import { partnerApi } from '../services/partnerApi'
import type { PartnerListItem, PartnerProfileData } from '../types/partner'
import { useThemeStore } from '../stores/themeStore'

// inject styles (cardPop + dark-mode overrides)
if (typeof document !== 'undefined' && !document.getElementById('pd-style')) {
  const s = document.createElement('style')
  s.id = 'pd-style'
  s.textContent = `
@keyframes cardPop{from{transform:scale(.86) translateY(6px);opacity:0}to{transform:scale(1) translateY(0);opacity:1}}
.pd-dark { color: #E8ECF3 !important; }
.pd-dark h1, .pd-dark h2, .pd-dark h3 { color: #E8ECF3 !important; }
.pd-dark [style*="color: #1E2229"], .pd-dark [style*="color:#1E2229"] { color: #E8ECF3 !important; }
.pd-dark [style*="color: #374151"] { color: #D1D5DB !important; }
.pd-dark [style*="color: #6B7280"] { color: #9CA3AF !important; }
.pd-dark [style*="color: #9CA3AF"] { color: #6B7280 !important; }
.pd-dark [style*="background: rgba(255,255,255,0.5)"],
.pd-dark [style*="background:rgba(255,255,255,0.5)"],
.pd-dark [style*="background: rgba(255,255,255,0.55)"],
.pd-dark [style*="background:rgba(255,255,255,0.55)"] { background: rgba(255,255,255,0.07) !important; border-color: rgba(255,255,255,0.1) !important; }
.pd-dark [style*="background: rgba(255,255,255,0.92)"],
.pd-dark [style*="background:rgba(255,255,255,0.92)"] { background: rgba(30,35,50,0.95) !important; }
.pd-dark [style*="background: #F8F9FB"],
.pd-dark [style*="background:#F8F9FB"] { background: rgba(255,255,255,0.08) !important; }
.pd-dark [style*="borderBottom: '1px solid rgba(0,0,0"],
.pd-dark [style*="border-bottom: 1px solid rgba(0,0,0"] { border-bottom-color: rgba(255,255,255,0.08) !important; }
.pd-dark [style*="background: rgba(0,0,0,0.08)"],
.pd-dark [style*="background:rgba(0,0,0,0.08)"] { background: rgba(255,255,255,0.12) !important; }
`
  document.head.appendChild(s)
}

// ─── Design tokens ────────────────────────────────────────────────────────────

// ─── Theme-aware tokens (resolved at render time via useTheme()) ──────────────
const ACCENT      = '#FAD055'
const DARK_BG     = '#1A1D21'
const TIER_COLORS: Record<string, string> = {
  strategic: '#6C5CE7', core: '#3B82F6', growth: '#00C48C',
  observation: '#FFB946', risk: '#FF4757',
}
const DIM_LABELS: Record<string, string> = {
  performance: '业绩贡献度', growth: '增长驱动力',
  engagement: '合作紧密度', health: '运营健康度', activity: '生态活跃度',
}

function useTheme() {
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  return {
    isDark,
    INK:   isDark ? '#E8ECF3' : '#1E2229',
    GLASS: {
      background:           isDark ? 'rgba(30,35,50,0.75)' : 'rgba(255,255,255,0.4)',
      backdropFilter:       'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      border:               isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,255,255,0.35)',
    } as React.CSSProperties,
    pageBg:      isDark ? 'linear-gradient(135deg,#0d0f1a 0%,#141824 50%,#1a1d2e 100%)' : 'linear-gradient(135deg,#E2E8F0 0%,#F8FAF1 40%,#FDE4A3 100%)',
    cardPartner: isDark ? 'linear-gradient(155deg,rgba(40,35,28,.95),rgba(32,28,20,.95))' : 'linear-gradient(155deg,rgba(245,239,225,.95),rgba(232,224,207,.95))',
    textPrimary: isDark ? '#E8ECF3' : '#1E2229',
    textSec:     isDark ? '#9CA3AF' : '#6B7280',
    textTert:    isDark ? '#4B5563' : '#9CA3AF',
    divider:     isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    rowBg:       isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.4)',
    STATUS_CFG: {
      keep: [isDark?'#1a3a2a':'#E8F5E9', '#22C55E', '● keep'] as [string,string,string],
      warn: [isDark?'#3a2e10':'#FFF8E1', '#F59E0B', '⚠ warn'] as [string,string,string],
      risk: [isDark?'#3a1a1a':'#FFEEE8', '#FF4757', '× risk'] as [string,string,string],
    },
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** 从公司全名提取有意义的2-4字简称，去掉城市前缀和公司后缀 */
function abbrPartner(name: string): string {
  const CITIES = ['北京','上海','广州','深圳','杭州','成都','武汉','南京','西安','天津',
    '重庆','苏州','青岛','厦门','福州','郑州','长沙','沈阳','大连','宁波','无锡','济南',
    '哈尔滨','昆明','合肥','石家庄','太原','贵阳','南宁','兰州','海口','银川','西宁',
    '拉萨','呼和浩特','乌鲁木齐','浙江','江苏','广东','四川','湖北','湖南','山东',
    '河南','河北','安徽','福建','辽宁','吉林','黑龙江','陕西','云南','贵州','江西',
    '山西','新疆','内蒙古','中国']
  const SUFFIXES = ['股份有限公司','有限责任公司','有限公司','信息技术有限','科技有限',
    '信息科技','技术有限','网络科技','软件科技','信息技术','数字科技',
    '科技股份','科技集团','集团有限','信息','科技','技术','网络','软件','集团','数据']

  // 去括号内容
  let s = name.replace(/（[^）]*）|\([^)]*\)/g, '').trim()
  // 去城市/省份前缀
  for (const c of CITIES) {
    if (s.startsWith(c)) { s = s.slice(c.length); break }
  }
  // 去公司后缀（从长到短，已按长度排好）
  for (const suf of SUFFIXES) {
    if (s.endsWith(suf)) { s = s.slice(0, -suf.length); break }
  }
  s = s.trim()
  // 取前2-4字
  if (!s) return name.slice(0, 2)
  return s.length <= 4 ? s : s.slice(0, 4)
}

function fmt(n: number) {
  return n >= 10000 ? `¥${(n / 10000).toFixed(1)}万` : `¥${n.toLocaleString()}`
}
function scoreColor(s: number) {
  if (s >= 8.5) return TIER_COLORS.strategic
  if (s >= 7.0) return TIER_COLORS.core
  if (s >= 5.0) return TIER_COLORS.growth
  if (s >= 3.5) return TIER_COLORS.observation
  return TIER_COLORS.risk
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const { GLASS } = useTheme()
  return <div style={{ ...GLASS, borderRadius: 28, padding: 20, boxSizing: 'border-box', ...style }}>{children}</div>
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function HeroSection({ d }: { d: PartnerProfileData }) {
  const { INK, textPrimary, textSec } = useTheme()
  const kpi = (d.kpi || {}) as Record<string, number>
  const rptPct = Math.round((kpi.reports_active || 0) / Math.max(1, kpi.reports_total || 1) * 100)
  const dealPct = Math.round((kpi.reports_deal || 0) / Math.max(1, kpi.reports_total || 1) * 100)
  const revPct = Math.round((kpi.revenue_rate || 0) * 100)
  const incPct = Math.round((kpi.incentive_usage_rate || 0) * 100)

  return (
    <div style={{ gridColumn: '1/-1', gridRow: '1', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', marginBottom: 4 }}>
      <div>
        <h1 style={{ fontSize: 40, fontWeight: 300, letterSpacing: '-1px', margin: '0 0 14px', lineHeight: 1.2, color: textPrimary }}>
          欢迎查看，<br /><span style={{ fontWeight: 600 }}>{d.partner_name}</span>
        </h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {([
            [INK, 'white', `跟进 ${rptPct}%`],
            [ACCENT, INK, `成交 ${dealPct}%`],
            ['repeating-linear-gradient(-55deg,#c5c1b8 0 4px,transparent 4px 8px)', INK, `到账率 ${revPct}%`],
            ['rgba(255,255,255,0.4)', '#6B7280', `激励 ${incPct}%`],
          ] as [string, string, string][]).map(([bg, color, label], i) => (
            <div key={i} style={{ height: 32, borderRadius: 999, display: 'inline-flex', alignItems: 'center', padding: '0 14px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', background: bg, color }}>
              {label}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 28, background: 'rgba(255,255,255,0.1)', padding: '18px 28px', borderRadius: 24, border: '1px solid rgba(255,255,255,0.15)', flexShrink: 0 }}>
        {([
          [kpi.cooperate_years ?? 0, '合作年限（年）'],
          [kpi.orders_total ?? 0, '历史订单（笔）'],
          [((kpi.revenue_total ?? 0) / 10000).toFixed(1), '总回款（万元）'],
        ] as [string | number, string][]).map(([val, label], i, arr) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: '-1px', lineHeight: 1 }}>{val}</div>
              <div style={{ fontSize: 11, color: textSec, marginTop: 4 }}>{label}</div>
            </div>
            {i < arr.length - 1 && <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.3)' }} />}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Partner card ──────────────────────────────────────────────────────────────

function PartnerCard({ d }: { d: PartnerProfileData }) {
  const { cardPartner, textSec, STATUS_CFG } = useTheme()
  const abbr = abbrPartner(d.partner_name || d.short_name || '').padEnd(4, '　').slice(0, 4)
  const row1 = abbr.slice(0, 2)
  const row2 = abbr.slice(2, 4)
  const [stBg, stColor, stText] = (STATUS_CFG as Record<string,[string,string,string]>)[d.status] || STATUS_CFG.keep
  return (
    <div style={{ borderRadius: 28, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 230, background: cardPartner, border: '1px solid rgba(255,255,255,0.12)', alignSelf: 'stretch' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px 0 28px', userSelect: 'none' }}>
        <div style={{ fontSize: 60, fontWeight: 900, color: 'rgba(0,0,0,0.06)', letterSpacing: -3, lineHeight: 1.05, textAlign: 'center' }}>{row1}</div>
        <div style={{ fontSize: 60, fontWeight: 900, color: 'rgba(0,0,0,0.06)', letterSpacing: -3, lineHeight: 1.05, textAlign: 'center' }}>{row2}</div>
      </div>
      <div style={{ padding: '0 20px 24px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{d.partner_name}</div>
        <div style={{ fontSize: 11, color: textSec, marginBottom: 10 }}>{[d.team, d.manager_name].filter(Boolean).join(' · ')}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {d.level && <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 999, padding: '5px 12px', fontSize: 11, fontWeight: 600, color: 'white' }}>{d.level}</div>}
          <div style={{ background: stBg, color: stColor, borderRadius: 999, padding: '5px 10px', fontSize: 11, fontWeight: 600 }}>{stText}</div>
        </div>
      </div>
    </div>
  )
}

// ─── Business output flip card ────────────────────────────────────────────────

function BusinessOutputCard({ d }: { d: PartnerProfileData }) {
  const { GLASS, INK, textSec, rowBg, isDark } = useTheme()
  const [flipped, setFlipped] = useState(false)
  const bo = (d.business_output || {}) as Record<string, number>
  const crmAmt = bo.crm_amount || 0
  const shopAmt = bo.shop_amount || 0
  const total = crmAmt + shopAmt
  const crmPct = total > 0 ? Math.round(crmAmt / total * 100) : 50
  const trend = (d.output_trend || []) as Array<{ year: string; crm: number; shop: number; total: number }>

  const trendOpt = {
    backgroundColor: 'transparent',
    grid: { top: 14, bottom: 28, left: 40, right: 12, containLabel: false },
    tooltip: { trigger: 'axis', backgroundColor: INK, textStyle: { color: '#fff', fontSize: 11 } },
    xAxis: { type: 'category', data: trend.map(t => t.year), axisLabel: { color: textSec, fontSize: 9 }, axisLine: { show: false }, axisTick: { show: false } },
    yAxis: { type: 'value', axisLabel: { color: textSec, fontSize: 9, formatter: (v: number) => v >= 10000 ? `${(v/10000).toFixed(0)}万` : String(v) }, splitLine: { lineStyle: { color: 'rgba(0,0,0,0.06)' } }, axisLine: { show: false } },
    series: [
      { name: '总产出', type: 'line', data: trend.map(t => t.total), smooth: true, lineStyle: { color: INK, width: 2 }, itemStyle: { color: INK }, symbol: 'circle', symbolSize: 4, areaStyle: { color: 'rgba(30,34,41,0.05)' } },
      { name: '项目', type: 'line', data: trend.map(t => t.crm), smooth: true, lineStyle: { color: ACCENT, width: 1.5, type: 'dashed' as const }, symbol: 'none', itemStyle: { color: ACCENT } },
      { name: '商城', type: 'line', data: trend.map(t => t.shop), smooth: true, lineStyle: { color: '#60A5FA', width: 1.5, type: 'dashed' as const }, symbol: 'none', itemStyle: { color: '#60A5FA' } },
    ],
  }

  const faceCss: React.CSSProperties = { position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', padding: 24, display: 'flex', flexDirection: 'column' }
  const btn: React.CSSProperties = { width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.35)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: textSec, fontSize: 11 }

  return (
    <div style={{ ...GLASS, borderRadius: 28, position: 'relative', overflow: 'hidden', minHeight: 230, alignSelf: 'stretch' }}>
      <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', transition: 'transform .55s cubic-bezier(.4,0,.2,1)', transform: flipped ? 'rotateY(180deg)' : 'none' }}>
        <div style={faceCss}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>经营产出</span>
            <button style={btn} onClick={() => setFlipped(true)}>↗</button>
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-1px', lineHeight: 1, marginBottom: 2 }}>{fmt(total)}</div>
          <div style={{ fontSize: 11, color: textSec, marginBottom: 10 }}>CRM 签约额 + 商城实付（合计参考）</div>
          <div style={{ height: 8, borderRadius: 999, overflow: 'hidden', display: 'flex', gap: 2, margin: '0 0 14px' }}>
            <div style={{ width: `${crmPct}%`, background: ACCENT, borderRadius: 999 }} />
            <div style={{ flex: 1, background: INK, borderRadius: 999 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 'auto' }}>
            {[{ color: ACCENT, label: 'CRM 项目', sub: `${bo.crm_count||0} 笔成交（签约额）`, amt: crmAmt }, { color: INK, label: '万众商城', sub: `${bo.shop_count||0} 笔订单（实付）`, amt: shopAmt }].map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: rowBg, borderRadius: 16, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.35)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
                  <div><div style={{ fontSize: 11, fontWeight: 600 }}>{r.label}</div><div style={{ fontSize: 10, color: textSec }}>{r.sub}</div></div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{fmt(r.amt)}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ ...faceCss, transform: 'rotateY(180deg)', background: isDark ? 'rgba(20,24,40,0.97)' : 'rgba(255,255,255,0.4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>历年产出趋势</span>
            <button style={btn} onClick={() => setFlipped(false)}>←</button>
          </div>
          <ReactECharts option={trendOpt} style={{ flex: 1 }} opts={{ renderer: 'canvas' }} notMerge />
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 2 }}>
            {[['总产出', INK], ['项目', ACCENT], ['商城', '#60A5FA']].map(([l, c]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 14, height: 2, background: c, borderRadius: 1 }} />
                <span style={{ fontSize: 10, color: textSec }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Incentive flip card ──────────────────────────────────────────────────────

function IncentiveCard({ d }: { d: PartnerProfileData }) {
  const { GLASS, INK, textPrimary, textSec, isDark } = useTheme()
  const [flipped, setFlipped] = useState(false)
  const inc    = (d.incentive || {}) as Record<string, unknown>
  const avail  = ((inc.shop_available as number) || 0) + ((inc.crm_available as number) || 0)
  const used   = ((inc.shop_used as number) || 0) + ((inc.crm_used as number) || 0)
  const shopDetail = (inc.shop_detail || []) as Array<Record<string, unknown>>
  const crmDetail  = (inc.crm_detail  || []) as Array<Record<string, unknown>>
  const urgent = inc.urgent_expire as Record<string, unknown> | null

  const fmtAmt = (n: unknown) => `¥${Number(n || 0).toLocaleString()}`

  // colour for expire date: red < 30d, yellow < 90d, grey otherwise
  const expireColor = (exp: unknown) => {
    if (!exp) return '#9CA3AF'
    const days = Math.floor((new Date(exp as string).getTime() - Date.now()) / 86400000)
    if (days < 30) return '#FF4757'
    if (days < 90) return '#FFB946'
    return '#9CA3AF'
  }

  if (!d.incentive) return (
    <Card style={{ minHeight: 290, display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>激励金</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: textSec, fontSize: 12 }}>待下次同步更新</div>
    </Card>
  )

  const donutOpt = {
    backgroundColor: 'transparent',
    series: [{ type: 'pie', radius: ['62%', '82%'], center: ['50%', '50%'],
      data: [
        { value: avail, name: '可用', itemStyle: { color: ACCENT } },
        { value: used,  name: '已用', itemStyle: { color: INK } },
      ],
      label: { show: false },
    }],
    tooltip: { trigger: 'item', formatter: '{b}: ¥{c}' },
  }

  const faceCss: React.CSSProperties = { position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', padding: 20, display: 'flex', flexDirection: 'column' }
  const btn: React.CSSProperties = { width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.35)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: textSec, fontSize: 11 }

  return (
    <div style={{ ...GLASS, borderRadius: 28, position: 'relative', overflow: 'hidden', minHeight: 230, alignSelf: 'stretch' }}>
      <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', transition: 'transform .55s cubic-bezier(.4,0,.2,1)', transform: flipped ? 'rotateY(180deg)' : 'none' }}>

        {/* ── Front: donut ── */}
        <div style={faceCss}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>激励金</span>
            <button style={btn} onClick={() => setFlipped(true)}>↗</button>
          </div>
          <div style={{ position: 'relative', width: 130, height: 130, margin: '0 auto 10px' }}>
            <ReactECharts option={donutOpt} style={{ width: 130, height: 130 }} opts={{ renderer: 'canvas' }} notMerge />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>{fmtAmt(avail)}</div>
              <div style={{ fontSize: 11, color: textSec, marginTop: 3 }}>可用合计</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-around', paddingTop: 8, borderTop: '1px solid rgba(0,0,0,0.06)', marginTop: 'auto' }}>
            {([['商城可用', inc.shop_available, ACCENT], ['CRM可用', inc.crm_available, '#3B82F6'], ['已用', used, '#9CA3AF']] as [string, number, string][]).map(([lbl, val, clr]) => (
              <div key={lbl} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: clr }}>{fmtAmt(val)}</div>
                <div style={{ fontSize: 10, color: textSec, marginTop: 1 }}>{lbl}</div>
              </div>
            ))}
          </div>
          {urgent && (
            <div style={{ marginTop: 8, background: '#FFF8E1', borderRadius: 8, padding: '6px 10px', fontSize: 11, color: '#A07C00' }}>
              ⚠ {fmtAmt((urgent as Record<string,unknown>).amount)} 将于 {(urgent as Record<string,unknown>).expire_date as string} 到期（{(urgent as Record<string,unknown>).days_left as number} 天）
            </div>
          )}
        </div>

        {/* ── Back: detail list ── */}
        <div style={{ ...faceCss, transform: 'rotateY(180deg)', background: isDark ? 'rgba(20,24,40,0.97)' : 'rgba(255,255,255,0.4)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>激励金明细</span>
            <button style={btn} onClick={() => setFlipped(false)}>←</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* 商城激励 */}
            {shopDetail.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: textSec, letterSpacing: '0.06em', marginBottom: 5 }}>商城激励金</div>
                {shopDetail.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, color: textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name as string}</div>
                      <div style={{ fontSize: 10, color: expireColor(item.expire) }}>到期 {item.expire as string}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: (item.remain as number) > 0 ? ACCENT : '#9CA3AF' }}>
                        {fmtAmt(item.remain)}
                      </div>
                      <div style={{ fontSize: 9, color: textSec }}>可用</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* CRM 激励 */}
            {crmDetail.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: textSec, letterSpacing: '0.06em', marginBottom: 5, marginTop: 4 }}>CRM 激励金</div>
                {crmDetail.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, color: textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(item.project || '')}</div>
                      {item.expire ? <div style={{ fontSize: 10, color: expireColor(item.expire as string) }}>到期 {String(item.expire)}</div> : null}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: Number(item.can_use) > 0 ? '#3B82F6' : '#9CA3AF' }}>
                        {fmtAmt(item.can_use as number)}
                      </div>
                      <div style={{ fontSize: 9, color: textSec }}>可用</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {shopDetail.length === 0 && crmDetail.length === 0 && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: textSec, fontSize: 12 }}>暂无激励金明细</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Dark right column — 近期动态 (dark-themed timeline) ─────────────────────

function ReportsCard({ d }: { d: PartnerProfileData }) {
  const { textSec } = useTheme()
  const events = [...(d.recent_events||[]) as Array<Record<string,unknown>>]
    .sort((a,b) => String(b.date).localeCompare(String(a.date)))
  const TYPE: Record<string,{bd:string;label:string;dot:string}> = {
    revenue: { bd: ACCENT,    dot: ACCENT,    label: '回款' },
    order:   { bd: '#3B82F6', dot: '#3B82F6', label: '订单' },
    report:  { bd: '#A855F7', dot: '#A855F7', label: '报备' },
  }
  const lo = events.length ? String(events[events.length-1].date).slice(0,7).replace('-','年')+'月' : ''
  const hi = events.length ? String(events[0].date).slice(0,7).replace('-','年')+'月' : ''

  return (
    <div style={{ background: DARK_BG, borderRadius: 28, padding: 24, display: 'flex', flexDirection: 'column', color: 'white', gridColumn: '4', gridRow: '2/4' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#D1D5DB' }}>近期动态</span>
        {lo && <span style={{ fontSize: 10, color: textSec }}>{lo}—{hi}</span>}
      </div>
      <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '8px 0 14px' }} />
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {events.slice(0, 10).map((e, i) => {
          const s = TYPE[e.type as string] || { bd:'#6B7280', dot:'#6B7280', label:'事件' }
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ minWidth: 64, fontSize: 10, color: textSec, paddingTop: 3, textAlign: 'right', flexShrink: 0 }}>{String(e.date).slice(0,10)}</div>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot, marginTop: 4, flexShrink: 0, boxShadow: `0 0 5px ${s.dot}66` }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
                  <span style={{ color: s.dot, marginRight: 4 }}>{s.label}</span>{e.desc as string}
                </div>
                {(e.amount as number) > 0 && (
                  <div style={{ fontSize: 10, color: textSec, marginTop: 1 }}>¥{(e.amount as number).toLocaleString()}</div>
                )}
              </div>
            </div>
          )
        })}
        {events.length === 0 && <div style={{ textAlign:'center', color:'#4B5563', fontSize:12, paddingTop:20 }}>暂无近期动态</div>}
      </div>
    </div>
  )
}

// ─── Accordion ────────────────────────────────────────────────────────────────

function AccordionCard({ d }: { d: PartnerProfileData }) {
  const { textPrimary, textSec, divider } = useTheme()
  const [open, setOpen] = useState('cert')
  const sections = [
    { key: 'cert', label: '认证状态', body: d.cert_expire ? (
      <div style={{ fontSize: 11, display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
        <div style={{ fontWeight: 600 }}>{d.level}</div>
        <div style={{ color: textSec }}>认证到期：{d.cert_expire}</div>
        {d.cooperate_expire && <div style={{ color: textSec }}>合作协议：{d.cooperate_expire}</div>}
      </div>
    ) : <div style={{ fontSize: 11, color: textSec }}>认证数据待同步</div> },
    { key: 'flows', label: '账户流水', body: (d.account_flows || []).length > 0 ? (
      <div>{(d.account_flows as Array<Record<string,unknown>>).slice(0,4).map((f,i)=>(
        <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:`1px solid ${divider}`, fontSize:11 }}>
          <span style={{ color: (f.amount as number) > 0 ? '#16a34a' : '#dc2626', fontWeight: 500 }}>{(f.amount as number)>0?'+':''}¥{Math.abs(f.amount as number).toLocaleString()}</span>
          <span style={{ color: textSec }}>{f.date as string}</span>
        </div>
      ))}</div>
    ) : <div style={{ fontSize:11, color:'#9CA3AF' }}>流水数据待同步</div> },
    { key: 'staff', label: '人员配置', body: (
      <div style={{ fontSize:11, display:'flex', flexDirection:'column' as const, gap:4 }}>
        <div>售前工程师 {d.pre_sale_count} 人</div>
        <div>售后工程师 {d.post_sale_count} 人</div>
        {d.innovation_tag && <div style={{ color: ACCENT }}>✦ 创新标签伙伴</div>}
      </div>
    ) },
  ]
  return (
    <Card style={{ padding: 0 }}>
      {sections.map((s, i) => (
        <div key={s.key} style={{ borderBottom: i < sections.length-1 ? `1px solid ${divider}` : 'none' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 20px', cursor:'pointer' }} onClick={()=>setOpen(open===s.key?'':s.key)}>
            <span style={{ fontSize:13, fontWeight:500, color: textPrimary }}>{s.label}</span>
            <span style={{ fontSize:11, color:'#9CA3AF' }}>{open===s.key?'∧':'∨'}</span>
          </div>
          {open===s.key && <div style={{ padding:'0 20px 14px' }}>{s.body}</div>}
        </div>
      ))}
    </Card>
  )
}

// ─── Wide bottom row — 报备跟进 (light-themed reports) ───────────────────────

function TimelineCard({ d }: { d: PartnerProfileData }) {
  const { textPrimary, rowBg } = useTheme()
  const kpi     = (d.kpi || {}) as Record<string, number>
  const reports = (d.active_reports || []) as Array<Record<string, unknown>>
  const rptA    = kpi.reports_active || 0
  const rptT    = kpi.reports_total  || 0
  const pct     = Math.round(rptA / Math.max(1, rptT) * 100)

  const STATUS_CFG_LIGHT: Record<string,[string,string,string]> = {
    following: [ACCENT,    '#92400E', '跟进中'],
    deal:      ['#22C55E', '#14532D', '已成交'],
    draft:     ['#94A3B8', '#374151', '草稿'],
    lost:      ['#6B7280', '#1F2937', '流失'],
  }

  return (
    <Card style={{ gridColumn:'2/4', gridRow:'3' }}>
      {/* header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
        <span style={{ fontSize:15, fontWeight:700, color: textPrimary }}>报备跟进</span>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ display:'flex', gap:3, height:6, width:120, borderRadius:3, overflow:'hidden' }}>
            <div style={{ background: ACCENT, borderRadius:3, flex: Math.max(rptA,1) }} />
            <div style={{ background:'rgba(0,0,0,0.08)', borderRadius:3, flex: Math.max(rptT-rptA,1) }} />
          </div>
          <span style={{ fontSize:13, fontWeight:700, color: ACCENT }}>{pct}%</span>
          <span style={{ fontSize:11, color:'#9CA3AF' }}>{rptA} 跟进 / {rptT} 总报备</span>
        </div>
      </div>
      {/* report rows — horizontal card layout */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:8 }}>
        {reports.slice(0, 10).map((r, i) => {
          const [dotC, textC, label] = STATUS_CFG_LIGHT[r.status as string] || STATUS_CFG_LIGHT.draft
          const amt = (r.amount as number) >= 10000
            ? `¥${((r.amount as number)/10000).toFixed(1)}万`
            : r.amount ? `¥${(r.amount as number).toLocaleString()}` : '—'
          return (
            <div key={i} style={{ background: rowBg, borderRadius:12, padding:'10px 12px', border:'1px solid rgba(255,255,255,0.35)', display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:dotC, flexShrink:0 }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:600, color:'#1E2229', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.name as string}</div>
                <div style={{ fontSize:10, color:'#9CA3AF', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginTop:1 }}>{r.client as string} · {r.stage as string}</div>
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#1E2229' }}>{amt}</div>
                <div style={{ fontSize:10, fontWeight:600, color:textC, marginTop:1 }}>{label}</div>
              </div>
            </div>
          )
        })}
        {reports.length === 0 && (
          <div style={{ gridColumn:'1/-1', textAlign:'center', color:'#9CA3AF', fontSize:12, padding:'20px 0' }}>暂无报备数据</div>
        )}
      </div>
    </Card>
  )
}

// ─── PRI section ──────────────────────────────────────────────────────────────

function PRISection({ d }: { d: PartnerProfileData }) {
  const { INK } = useTheme()
  const pri = (d.pri||{}) as Record<string,unknown>
  const score = (pri.total_score as number)||0
  const tier = (pri.tier as string)||'growth'
  const tc = TIER_COLORS[tier]||'#9CA3AF'
  const dims = (['performance','growth','engagement','health','activity'] as const).map(k=>({ key:k, label:DIM_LABELS[k], score:(pri[k] as number)||0 }))
  const radarOpt = {
    backgroundColor: 'transparent',
    radar: { indicator: dims.map(dim=>({name:dim.label,max:10})), center:['50%','50%'], radius:'70%', splitNumber:4, axisName:{color:'#9CA3AF',fontSize:11}, splitLine:{lineStyle:{color:'rgba(0,0,0,0.06)'}}, splitArea:{areaStyle:{color:['rgba(255,255,255,0.01)','rgba(255,255,255,0.03)']}}, axisLine:{lineStyle:{color:'rgba(0,0,0,0.08)'}} },
    series:[{type:'radar',data:[{value:dims.map(dim=>dim.score),areaStyle:{color:`${tc}22`},lineStyle:{color:tc,width:2},itemStyle:{color:tc},symbol:'circle',symbolSize:4}]}],
    tooltip:{trigger:'item',backgroundColor:'rgba(255,255,255,0.95)',borderColor:'rgba(0,0,0,0.1)',textStyle:{color:INK,fontSize:11}},
  }
  return (
    <Card style={{ gridColumn:'1/-1', gridRow:'4', display:'grid', gridTemplateColumns:'280px 1fr', gap:28, alignItems:'center' }}>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
        <div style={{ fontSize:12, fontWeight:600, color:'#9CA3AF', letterSpacing:'.06em', textTransform:'uppercase', alignSelf:'flex-start' }}>PRI 合作伙伴综合指数</div>
        <div style={{ display:'flex', alignItems:'baseline', gap:6, alignSelf:'flex-start' }}>
          <span style={{ fontSize:52, fontWeight:900, color:tc, letterSpacing:'-2px', lineHeight:1 }}>{score.toFixed(1)}</span>
          <span style={{ fontSize:20, color:'#9CA3AF' }}>/10</span>
          {pri.category ? <span style={{ fontSize:11, fontWeight:700, background:`${tc}18`, color:tc, border:`1px solid ${tc}44`, borderRadius:999, padding:'2px 9px', marginLeft:6 }}>{String(pri.category)}</span> : null}
        </div>
        <ReactECharts option={radarOpt} style={{ width:240, height:240 }} opts={{ renderer:'canvas' }} notMerge />
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
        {dims.map(dim=>{
          const c = scoreColor(dim.score)
          return (
            <div key={dim.key}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                <span style={{ fontSize:13, fontWeight:600, flex:1 }}>{dim.label}</span>
                <span style={{ fontSize:13, fontWeight:700, color:c, background:`${c}18`, border:`1px solid ${c}40`, borderRadius:5, padding:'2px 8px' }}>{dim.score.toFixed(1)}</span>
              </div>
              <div style={{ height:6, borderRadius:3, background:'rgba(0,0,0,0.08)', overflow:'hidden' }}>
                <div style={{ width:`${(dim.score/10)*100}%`, height:'100%', background:c, borderRadius:3, transition:'width .6s cubic-bezier(.4,0,.2,1)' }} />
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ─── Client graph ─────────────────────────────────────────────────────────────

const SP: Record<string,number> = { deal:4, following:3, draft:2, lost:1 }
const SC: Record<string,string> = { deal:'#22C55E', following:'#FAD055', draft:'#94A3B8', lost:'#6B7280' }

function abbrName(name: string): string {
  let s = name.replace(/股份有限公司|有限责任公司|有限公司|集团有限公司/g,'').replace(/（[^）]*）/g,'').trim()
  return s.length > 6 ? s.slice(0,5)+'…' : s
}

function prodCatOf(prod: string): { icon: string; cat: string } {
  const p = (prod || '').toLowerCase()
  if (p.includes('雷池')||p.includes('waf')) return { icon:'🛡️', cat:'应用安全' }
  if (p.includes('洞鉴')||p.includes('风险评估')||p.includes('扫描')) return { icon:'🔍', cat:'风险评估' }
  if (p.includes('aisoc')||p.includes('守元')||p.includes('鉴微')) return { icon:'🤖', cat:'AI安全' }
  if (p.includes('码力')||p.includes('monkeycode')) return { icon:'💻', cat:'代码安全' }
  if (p.includes('情报')||p.includes('威胁')) return { icon:'📡', cat:'威胁情报' }
  return { icon:'📦', cat:'安全产品' }
}

interface ClientNode { name: string; projs: Array<Record<string,unknown>>; amt: number; status: string; color: string; x: number; y: number; r: number; angle: number }

function ClientGraphSection({ d }: { d: PartnerProfileData }) {
  const { rowBg, textSec, textPrimary } = useTheme()
  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<ClientNode|null>(null)
  const [cardPos, setCardPos] = useState({ x: 0, y: 0 })

  const reports = (d.active_reports || []) as Array<Record<string,unknown>>

  // aggregate by client
  const clients = useMemo<ClientNode[]>(() => {
    const map: Record<string, ClientNode> = {}
    reports.forEach(r => {
      const key = r.client as string
      if (!key) return
      if (!map[key]) map[key] = { name: key, projs: [], amt: 0, status:'draft', color:'#94A3B8', x:0, y:0, r:18, angle:0 }
      map[key].projs.push(r)
      map[key].amt += (r.amount as number) || 0
    })
    return Object.values(map).map(c => {
      let dom = 'draft', maxP = 0
      c.projs.forEach(p => { const v = SP[p.status as string]||0; if(v>maxP){maxP=v;dom=p.status as string} })
      c.status = dom
      c.color  = SC[dom]||'#94A3B8'
      return c
    })
  }, [reports])

  // layout & draw SVG
  useEffect(() => {
    const svg = svgRef.current
    if (!svg || !clients.length) return
    const W = svg.parentElement?.clientWidth || 900
    const H = Math.min(400, Math.max(300, 280 + clients.length * 8))
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
    svg.setAttribute('height', String(H))

    const cx = W/2, cy = H/2
    const R  = Math.min(W/2-120, H/2-50, 185)

    clients.forEach((c, i) => {
      const a = (i/clients.length)*2*Math.PI - Math.PI/2
      c.x = cx + R*Math.cos(a); c.y = cy + R*Math.sin(a)
      c.angle = a; c.r = Math.min(26, Math.max(16, 14 + Math.sqrt(c.amt)/400))
    })

    let out = `<defs><filter id="cgs1"><feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#1E2229" flood-opacity=".15"/></filter></defs>`
    ;[.36,.64,.93].forEach(f => out += `<circle cx="${cx}" cy="${cy}" r="${(R*f).toFixed(0)}" fill="none" stroke="rgba(0,0,0,.04)" stroke-width="1" stroke-dasharray="3 5"/>`)

    clients.forEach(c => {
      const sw  = Math.min(3.8, 1.1+c.amt/160000)
      const opa = c.status==='deal'?.62 : c.status==='following'?.52 : .15
      const dash= (c.status==='draft'||c.status==='lost') ? 'stroke-dasharray="5 3"' : ''
      const mx  = cx+(c.x-cx)*.5-(c.y-cy)*.2
      const my  = cy+(c.y-cy)*.5+(c.x-cx)*.2
      out += `<path d="M${cx},${cy} Q${mx.toFixed(1)},${my.toFixed(1)} ${c.x.toFixed(1)},${c.y.toFixed(1)}" fill="none" stroke="${c.color}" stroke-width="${sw.toFixed(1)}" ${dash} opacity="${opa}" stroke-linecap="round"/>`
      if (c.amt>0) {
        const lx=(cx*.28+mx*.44+c.x*.28).toFixed(1), ly=(cy*.28+my*.44+c.y*.28).toFixed(1)
        const lbl=c.amt>=10000?(c.amt/10000).toFixed(0)+'万':'¥'+c.amt
        out += `<rect x="${(parseFloat(lx)-14).toFixed(1)}" y="${(parseFloat(ly)-7).toFixed(1)}" width="28" height="13" rx="6" fill="white" opacity=".82"/>`
        out += `<text x="${lx}" y="${(parseFloat(ly)+3.5).toFixed(1)}" text-anchor="middle" fill="${c.color}" font-size="7.5" font-weight="600">${lbl}</text>`
      }
    })

    const ini = (d.short_name||d.partner_name||'').slice(0,2)
    out += `<circle cx="${cx}" cy="${cy}" r="38" fill="#1E2229" filter="url(#cgs1)"/>`
    out += `<circle cx="${cx}" cy="${cy}" r="38" fill="none" stroke="${ACCENT}" stroke-width="2" opacity=".85"/>`
    out += `<text x="${cx}" y="${cy+4}" text-anchor="middle" fill="${ACCENT}" font-size="14" font-weight="700">${ini}</text>`
    out += `<text x="${cx}" y="${cy+16}" text-anchor="middle" fill="rgba(255,255,255,.4)" font-size="8">伙伴</text>`

    clients.forEach((c, idx) => {
      const short = abbrName(c.name)
      const anchor = c.x<cx-10?'end':c.x>cx+10?'start':'middle'
      const lx = (c.x+(c.r+9)*Math.cos(c.angle)).toFixed(1)
      const ly = (c.y+(c.r+9)*Math.sin(c.angle)).toFixed(1)
      if (c.status==='deal'||c.status==='following') out += `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${c.r+5}" fill="none" stroke="${c.color}" stroke-width=".8" opacity=".18"/>`
      out += `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${c.r}" fill="${c.color}" opacity=".11"/>`
      out += `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${c.r}" fill="none" stroke="${c.color}" stroke-width="1.8" opacity=".9"/>`
      if (c.projs.length>1) {
        const bx=(c.x+c.r*.65).toFixed(1), by=(c.y-c.r*.65).toFixed(1)
        out += `<circle cx="${bx}" cy="${by}" r="7" fill="${c.color}"/>`
        out += `<text x="${bx}" y="${(parseFloat(by)+3.8).toFixed(1)}" text-anchor="middle" fill="white" font-size="8" font-weight="700">${c.projs.length}</text>`
      }
      out += `<text x="${lx}" y="${(parseFloat(ly)+4).toFixed(1)}" text-anchor="${anchor}" fill="#1E2229" font-size="11" font-weight="600">${short}</text>`
      out += `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${c.r+10}" fill="transparent" class="cg-hit" data-idx="${idx}"/>`
    })

    svg.innerHTML = out

    // click handlers
    svg.querySelectorAll('.cg-hit').forEach(el => {
      el.addEventListener('click', (e: Event) => {
        const me = e as MouseEvent
        const idx = parseInt((el as SVGCircleElement).dataset.idx||'0')
        const c = clients[idx]
        const pt = svg.createSVGPoint()
        pt.x = c.x; pt.y = c.y
        const sp = pt.matrixTransform(svg.getScreenCTM()!)
        const wrap = wrapRef.current
        if (wrap) {
          const wr = wrap.getBoundingClientRect()
          let lx = sp.x - wr.left + 18
          let ly = sp.y - wr.top  - 80
          if (lx + 300 > wr.width) lx = sp.x - wr.left - 318
          if (ly < 0) ly = 4
          setCardPos({ x: lx, y: ly })
        }
        setSelected(c)
        svg.querySelectorAll('.cg-hit').forEach(h => ((h as SVGElement).style.opacity = h===el?'1':'.3'))
        me.stopPropagation()
      })
    })
  }, [clients, d.partner_name, d.short_name])

  const nFollow = clients.filter(c=>c.status==='following').length
  const nDeal   = clients.filter(c=>c.status==='deal').length

  return (
    <div ref={wrapRef} style={{ gridColumn:'1/-1', gridRow:'5', padding:'16px 4px 8px', position:'relative' }}
      onClick={() => { setSelected(null); svgRef.current?.querySelectorAll('.cg-hit').forEach(h=>(h as SVGElement).style.opacity='1') }}>
      {/* header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, padding:'0 2px' }}>
        <span style={{ fontSize:12, fontWeight:600, color:'rgba(30,34,41,.45)', letterSpacing:'.06em', textTransform:'uppercase' }}>客户关联图谱</span>
        <div style={{ display:'flex', alignItems:'center', gap:14, fontSize:11, color:'#9CA3AF' }}>
          {[['#22C55E','已成交'],['#FAD055','跟进中'],['#94A3B8','其他']].map(([c,l])=>(
            <span key={l} style={{ display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:c, display:'inline-block' }}/>
              {l}
            </span>
          ))}
          <span>共 {clients.length} 个客户 · 跟进 {nFollow} · 成交 {nDeal}</span>
        </div>
      </div>

      {clients.length === 0
        ? <div style={{ textAlign:'center', color:'#9CA3AF', padding:'40px 0', fontSize:13 }}>暂无报备客户数据</div>
        : <svg ref={svgRef} width="100%" style={{ display:'block', overflow:'visible', cursor:'default' }} />
      }

      {/* floating detail card */}
      {selected && (
        <div style={{
          position:'absolute', left:cardPos.x, top:cardPos.y,
          width:288, background:'#fff', borderRadius:18, overflow:'hidden',
          boxShadow:'0 12px 40px rgba(0,0,0,.15),0 2px 8px rgba(0,0,0,.07)',
          zIndex:50, animation:'cardPop .2s cubic-bezier(.34,1.56,.64,1) forwards',
        }} onClick={e=>e.stopPropagation()}>
          {/* card header */}
          <div style={{ padding:'14px 16px 10px', borderBottom:'1px solid rgba(0,0,0,.06)' }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:textPrimary, lineHeight:1.3 }}>{selected.name}</div>
                <div style={{ fontSize:11, color:'#9CA3AF', marginTop:3 }}>
                  {selected.projs.length} 个项目 · {selected.amt>=10000?`¥${(selected.amt/10000).toFixed(1)}万`:`¥${selected.amt.toLocaleString()}`}
                </div>
              </div>
              <button onClick={()=>{ setSelected(null); svgRef.current?.querySelectorAll('.cg-hit').forEach(h=>(h as SVGElement).style.opacity='1') }}
                style={{ width:24, height:24, borderRadius:'50%', background:'#F3F4F6', border:'none', cursor:'pointer', fontSize:12, color:'#6B7280' }}>✕</button>
            </div>
          </div>
          {/* project list */}
          <div style={{ maxHeight:320, overflowY:'auto' }}>
            {selected.projs.map((p, i) => {
              const stMap: Record<string,[string,string]> = { deal:['#22C55E','已成交'], following:['#F59E0B','跟进中'], draft:['#94A3B8','草稿'], lost:['#6B7280','已流失'] }
              const [sc,sl] = stMap[p.status as string]||['#94A3B8','未知']
              const { icon, cat } = prodCatOf(p.product as string)
              const amt = (p.amount as number)>=10000 ? `¥${((p.amount as number)/10000).toFixed(1)}万` : p.amount ? `¥${(p.amount as number).toLocaleString()}` : '—'
              return (
                <div key={i} style={{ padding:'10px 16px', borderBottom:'1px solid rgba(0,0,0,.05)' }}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ fontSize:12, fontWeight:600, color:'#1E2229', flex:1, marginRight:8, lineHeight:1.4 }}>{p.name as string}</span>
                    <span style={{ fontSize:10, fontWeight:700, background:`${sc}1A`, color:sc, border:`1px solid ${sc}40`, borderRadius:999, padding:'2px 7px', whiteSpace:'nowrap' }}>{sl}</span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:5, marginBottom:5 }}>
                    <div style={{ background: rowBg, borderRadius:7, padding:'5px 8px' }}>
                      <div style={{ fontSize:9, color:'#9CA3AF', marginBottom:1 }}>分类</div>
                      <div style={{ fontSize:11, fontWeight:600, color:'#374151' }}>{icon} {cat}</div>
                    </div>
                    <div style={{ background: rowBg, borderRadius:7, padding:'5px 8px' }}>
                      <div style={{ fontSize:9, color:'#9CA3AF', marginBottom:1 }}>金额</div>
                      <div style={{ fontSize:11, fontWeight:700, color:'#1E2229' }}>{amt}</div>
                    </div>
                  </div>
                  <div style={{ fontSize:10, color:textSec }}>{p.product as string}</div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
                    <span style={{ fontSize:10, color:'#9CA3AF' }}>{p.stage as string}</span>
                    <span style={{ fontSize:10, color:'#9CA3AF' }}>{p.date as string}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:400, gap:12 }}>
      <div style={{ fontSize:52, opacity:.35 }}>🏢</div>
      <div style={{ fontSize:16, fontWeight:600, color:'#9CA3AF' }}>搜索一个伙伴开始</div>
      <div style={{ fontSize:13, color:'#CBD5E1' }}>输入伙伴名称，查看完整经营看板</div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PartnerDashboardPage() {
  const { isDark, GLASS, textPrimary } = useTheme()
  const [searchParams] = useSearchParams()
  const [query,      setQuery]      = useState('')
  const [options,    setOptions]    = useState<{value:string;label:React.ReactNode;id:string}[]>([])
  const [selectedId, setSelectedId] = useState<string|null>(searchParams.get('id'))
  const [profile,    setProfile]    = useState<PartnerProfileData|null>(null)
  const [searching,  setSearching]  = useState(false)
  const [loading,    setLoading]    = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>|null>(null)

  const handleSearch = useCallback((val: string) => {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!val.trim()) { setOptions([]); return }
    setSearching(true)
    debounceRef.current = setTimeout(() => {
      partnerApi.searchPartners(val)
        .then(r => {
          const items = (r.data as unknown) as PartnerListItem[]
          setOptions(items.map(p => ({
            value: p.name, id: p.id,
            label: <div style={{ display:'flex', justifyContent:'space-between' }}><span style={{ fontSize:13 }}>{p.name}</span><span style={{ fontSize:11, color:'#9CA3AF' }}>{p.region}</span></div>,
          })))
        })
        .finally(() => setSearching(false))
    }, 280)
  }, [])

  const handleSelect = useCallback((_: string, opt: {id:string}) => {
    setSelectedId(opt.id)
  }, [])

  useEffect(() => {
    if (!selectedId) return
    setLoading(true)
    setProfile(null)
    partnerApi.getPartnerProfile(selectedId)
      .then(r => setProfile((r.data as unknown) as PartnerProfileData))
      .finally(() => setLoading(false))
  }, [selectedId])

  return (
    <div style={{
      minHeight:'100vh', padding:'72px 24px 40px', boxSizing:'border-box',
      background: isDark
        ? 'linear-gradient(135deg,#111420 0%,#161a28 50%,#1c2035 100%)'
        : undefined,
    }}>
      <div style={{ maxWidth:620, margin:'0 auto 32px' }}>
        <AutoComplete value={query} options={options} onSearch={handleSearch} onSelect={handleSelect} style={{ width:'100%' }}>
          <Input
            prefix={searching ? <Spin size="small" /> : <SearchOutlined style={{ color:'#9CA3AF' }} />}
            placeholder="搜索伙伴名称…" size="large" allowClear
            onChange={e => { if (!e.target.value) { setOptions([]); setSelectedId(null); setProfile(null); setQuery('') } }}
            style={{ ...GLASS, borderRadius:14, fontSize:15, color: textPrimary }}
          />
        </AutoComplete>
      </div>

      {loading && <div style={{ display:'flex', justifyContent:'center', paddingTop:100 }}><Spin size="large" /></div>}
      {!loading && !profile && <EmptyState />}

      {!loading && profile && (
        <div style={{ display:'grid', gridTemplateColumns:'220px 1fr 1fr 380px', gridTemplateRows:'auto auto auto auto auto', gap:16, alignItems:'start' }}>
          <HeroSection d={profile} />
          <PartnerCard d={profile} />
          <BusinessOutputCard d={profile} />
          <IncentiveCard d={profile} />
          <ReportsCard d={profile} />
          <AccordionCard d={profile} />
          <TimelineCard d={profile} />
          <PRISection d={profile} />
          <ClientGraphSection d={profile} />
        </div>
      )}
    </div>
  )
}
