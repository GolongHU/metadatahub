import { Table } from 'antd'
import type { ColumnType } from 'antd/es/table'
import type { WidgetData } from '../../types/template'

interface RankingTableWidgetProps {
  config: Record<string, unknown>
  data: WidgetData
}

const RANK_STYLES: Record<number, { bg: string; color: string; label: string }> = {
  1: { bg: '#FFB94620', color: '#FFB946', label: '🥇' },
  2: { bg: '#9CA3B420', color: '#9CA3B4', label: '🥈' },
  3: { bg: '#CD7F3220', color: '#CD7F32', label: '🥉' },
}

function toDisplayValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  const n = parseFloat(String(v))
  if (!isNaN(n) && String(v).trim() !== '') return n.toLocaleString()
  return String(v)
}

export default function RankingTableWidget({ config, data }: RankingTableWidgetProps) {
  const columns  = data.columns ?? []
  const rows     = data.rows    ?? []
  const pageSize = typeof config.page_size === 'number' ? config.page_size : 10

  if (!columns.length || !rows.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9CA3B4', fontSize: 13 }}>
        暂无数据
      </div>
    )
  }

  const rankColumn: ColumnType<Record<string, unknown>> = {
    title: '#',
    dataIndex: '__rank',
    key: '__rank',
    width: 48,
    render: (_: unknown, __: unknown, index: number) => {
      const rank = index + 1
      const style = RANK_STYLES[rank]
      if (style) {
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 24,
              borderRadius: 6,
              background: style.bg,
              color: style.color,
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            {rank}
          </span>
        )
      }
      return (
        <span style={{ color: '#9CA3B4', fontSize: 12, fontWeight: 500 }}>{rank}</span>
      )
    },
  }

  const dataCols: ColumnType<Record<string, unknown>>[] = columns.map((col, i) => ({
    title: (
      <span style={{ color: '#9CA3B4', fontSize: 12, fontWeight: 500 }}>{col}</span>
    ),
    dataIndex: String(i),
    key: col,
    ellipsis: true,
    render: (v: unknown) => (
      <span style={{ color: '#E8ECF3', fontSize: 13 }}>{toDisplayValue(v)}</span>
    ),
  }))

  const tableColumns = [rankColumn, ...dataCols]

  const dataSource = rows.map((row, ri) => {
    const obj: Record<string, unknown> = { key: ri, __rank: ri + 1 }
    row.forEach((cell, ci) => { obj[String(ci)] = cell })
    return obj
  })

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <Table
        columns={tableColumns}
        dataSource={dataSource}
        size="small"
        pagination={
          rows.length > pageSize
            ? { pageSize, size: 'small', showSizeChanger: false }
            : false
        }
        scroll={{ x: true }}
        style={{ '--table-row-hover-bg': 'rgba(108,92,231,0.06)' } as React.CSSProperties}
      />
    </div>
  )
}
