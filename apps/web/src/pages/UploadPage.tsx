import { MessageOutlined } from '@ant-design/icons'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { datasetsApi } from '../services/api'
import type { DuplicateCheckMatch } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import { useThemeStore } from '../stores/themeStore'
import type { ColumnInfo, Dataset, DatasetDetail } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Möbius path ───────────────────────────────────────────────────────────────
const MP = 'M24,56 C24,24 56,8 80,40 C104,72 136,56 136,56 C136,56 136,88 112,72 C88,40 56,56 24,56 Z'

// ── Type tag ──────────────────────────────────────────────────────────────────
function TypeTag({ type }: { type: string }) {
  const lower = type.toLowerCase()
  const isNum  = ['int', 'float', 'double', 'decimal', 'numeric', 'bigint', 'real', 'number'].some(t => lower.includes(t))
  const isDate = lower.includes('date') || lower.includes('timestamp')
  const isBool = lower.includes('bool')
  const [bg, color, border] = isNum
    ? ['rgba(0,200,140,0.10)', '#00C48C', 'rgba(0,200,140,0.18)']
    : isDate
    ? ['rgba(255,185,70,0.10)', '#FFB946', 'rgba(255,185,70,0.18)']
    : isBool
    ? ['rgba(162,155,254,0.10)', '#A29BFE', 'rgba(162,155,254,0.18)']
    : ['rgba(59,130,246,0.10)', '#3B82F6', 'rgba(59,130,246,0.18)']
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 6,
      background: bg, color, border: `1px solid ${border}`,
      fontSize: 11, fontWeight: 500, letterSpacing: 0.3,
      fontFamily: 'Inter, -apple-system, sans-serif',
      whiteSpace: 'nowrap',
    }}>
      {type}
    </span>
  )
}

// ── File type icon ────────────────────────────────────────────────────────────
function FileTypeIcon({ type, size = 40 }: { type: string; size?: number }) {
  const lower = type.toLowerCase()
  const [bg, color] = lower === 'xlsx' || lower === 'xls'
    ? [lower === 'xlsx' ? 'rgba(0,200,140,0.10)' : 'rgba(255,185,70,0.10)',
       lower === 'xlsx' ? '#00C48C' : '#FFB946']
    : lower === 'csv'
    ? ['rgba(59,130,246,0.10)', '#3B82F6']
    : ['rgba(162,155,254,0.10)', '#A29BFE']
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.3), flexShrink: 0,
      background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ fontSize: size * 0.27, fontWeight: 700, color, letterSpacing: 0.3, fontFamily: 'monospace' }}>
        {lower.toUpperCase().slice(0, 4)}
      </span>
    </div>
  )
}

// ── Schema preview table ──────────────────────────────────────────────────────
function SchemaPreview({
  dataset, isDark, onCancel, onConfirm,
}: {
  dataset: DatasetDetail; isDark: boolean; onCancel: () => void; onConfirm: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const cols = dataset.schema_info.columns
  const display: ColumnInfo[] = expanded ? cols : cols.slice(0, 6)
  const hiddenCount = cols.length - 6

  const bg     = isDark ? 'rgba(26,29,46,0.50)' : 'rgba(255,255,255,0.72)'
  const border = isDark ? 'rgba(162,155,254,0.12)' : 'rgba(108,92,231,0.10)'
  const th     = isDark ? '#5F6B7A' : '#9CA3B4'
  const rowDiv = isDark ? 'rgba(162,155,254,0.04)' : 'rgba(108,92,231,0.04)'

  return (
    <div style={{
      width: '100%',
      borderRadius: 24,
      background: bg,
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: `1.5px solid ${border}`,
      boxShadow: isDark
        ? '0 8px 32px rgba(0,0,0,0.28), inset 0 1px 0 rgba(162,155,254,0.04)'
        : '0 8px 24px rgba(108,92,231,0.08), inset 0 1px 0 rgba(255,255,255,0.8)',
      padding: '28px 28px 24px',
      animation: 'up-enter 0.4s ease',
    }}>
      {/* File header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <FileTypeIcon type={dataset.source_type} size={44} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 500, color: isDark ? '#E8ECF3' : '#1A1D2E', marginBottom: 4, fontFamily: 'Inter, -apple-system, sans-serif' }}>
            {dataset.name}
          </div>
          <div style={{ fontSize: 13, color: isDark ? '#5F6B7A' : '#9CA3B4', fontFamily: 'Inter, -apple-system, sans-serif' }}>
            {dataset.row_count.toLocaleString()} 行 · {cols.length} 字段 · {dataset.source_type.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Schema table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {['字段', '类型', '样本值'].map(h => (
              <th key={h} style={{
                textAlign: 'left', padding: '8px 12px',
                color: th, fontWeight: 500, fontSize: 11,
                textTransform: 'uppercase', letterSpacing: '0.5px',
                borderBottom: `1px solid ${isDark ? 'rgba(162,155,254,0.10)' : 'rgba(108,92,231,0.08)'}`,
                fontFamily: 'Inter, -apple-system, sans-serif',
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {display.map((col) => (
            <tr key={col.name}>
              <td style={{ padding: '8px 12px', color: isDark ? '#A29BFE' : '#6C5CE7', borderBottom: `1px solid ${rowDiv}`, fontFamily: 'monospace', fontSize: 12 }}>
                {col.name}
              </td>
              <td style={{ padding: '8px 12px', borderBottom: `1px solid ${rowDiv}` }}>
                <TypeTag type={col.type} />
              </td>
              <td style={{ padding: '8px 12px', borderBottom: `1px solid ${rowDiv}`, color: isDark ? '#9CA3B4' : '#5F6B7A', fontFamily: 'monospace', fontSize: 12 }}>
                {col.sample_values.slice(0, 2).map(String).join(', ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Show more */}
      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: isDark ? '#5F6B7A' : '#9CA3B4', fontSize: 12,
            padding: '8px 12px',
            fontFamily: 'Inter, -apple-system, sans-serif',
          }}
        >
          {expanded ? '收起' : `... 还有 ${hiddenCount} 个字段`}
        </button>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
        <button onClick={onCancel} style={{
          padding: '10px 24px', borderRadius: 12,
          border: `1px solid ${isDark ? 'rgba(162,155,254,0.12)' : 'rgba(108,92,231,0.12)'}`,
          background: 'transparent',
          color: isDark ? '#9CA3B4' : '#5F6B7A',
          fontSize: 14, cursor: 'pointer',
          fontFamily: 'Inter, -apple-system, sans-serif',
          transition: 'all 0.2s',
        }}>
          重新上传
        </button>
        <button onClick={onConfirm} style={{
          padding: '10px 28px', borderRadius: 12, border: 'none',
          background: 'linear-gradient(135deg, #6C5CE7 0%, #A29BFE 100%)',
          color: '#FFFFFF', fontSize: 14, fontWeight: 500,
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(108,92,231,0.30)',
          display: 'flex', alignItems: 'center', gap: 8,
          fontFamily: 'Inter, -apple-system, sans-serif',
          transition: 'all 0.2s',
        }}>
          <MessageOutlined />
          开始对话分析
        </button>
      </div>
    </div>
  )
}

// ── Recent dataset row ────────────────────────────────────────────────────────
function RecentItem({ ds, isDark, onDelete, onError }: { ds: Dataset; isDark: boolean; onDelete: (id: string) => void; onError: (msg: string) => void }) {
  const [hovered,    setHovered]    = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleting,   setDeleting]   = useState(false)
  const [downloading, setDownloading] = useState(false)
  const navigate = useNavigate()
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin')

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirming) { setConfirming(true); return }
    setDeleting(true)
    onDelete(ds.id.toString())
  }

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirming(false)
  }

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setDownloading(true)
    try {
      const res = await datasetsApi.download(ds.id.toString())
      const url = window.URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${ds.name}.xlsx`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err: unknown) {
      const e = err as { response?: { data?: Blob; status?: number } }
      if (e.response?.data instanceof Blob) {
        const text = await e.response.data.text().catch(() => '')
        try {
          const json = JSON.parse(text)
          onError(json.detail ?? '下载失败')
        } catch {
          onError(`下载失败 (${e.response.status ?? ''})`)
        }
      } else {
        onError('下载失败，请重试')
      }
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConfirming(false) }}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px', borderRadius: 14,
        background: confirming
          ? isDark ? 'rgba(255,71,87,0.06)' : 'rgba(255,71,87,0.04)'
          : hovered
          ? isDark ? 'rgba(42,37,80,0.35)' : 'rgba(255,255,255,0.72)'
          : isDark ? 'rgba(26,29,46,0.30)' : 'rgba(255,255,255,0.50)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: `1px solid ${confirming
          ? isDark ? 'rgba(255,71,87,0.20)' : 'rgba(255,71,87,0.15)'
          : hovered
          ? isDark ? 'rgba(162,155,254,0.14)' : 'rgba(108,92,231,0.14)'
          : isDark ? 'rgba(162,155,254,0.05)' : 'rgba(108,92,231,0.05)'}`,
        transition: 'all 0.15s',
        cursor: 'default',
      }}
    >
      <FileTypeIcon type={ds.source_type} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: isDark ? '#E8ECF3' : '#1A1D2E', marginBottom: 2, fontFamily: 'Inter, -apple-system, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ds.name}
        </div>
        <div style={{ fontSize: 11, color: isDark ? '#5F6B7A' : '#9CA3B4', fontFamily: 'Inter, -apple-system, sans-serif' }}>
          {ds.row_count.toLocaleString()} 行 · {ds.column_count} 字段 · {formatDate(ds.created_at)}
        </div>
      </div>

      {confirming ? (
        /* Confirm row */
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: '#FF4757', fontFamily: 'Inter, -apple-system, sans-serif' }}>确认删除?</span>
          <button
            onClick={handleDeleteClick}
            disabled={deleting}
            style={{
              padding: '4px 10px', borderRadius: 7, border: 'none',
              background: '#FF4757', color: '#fff', fontSize: 12,
              cursor: deleting ? 'not-allowed' : 'pointer',
              fontFamily: 'Inter, -apple-system, sans-serif', opacity: deleting ? 0.6 : 1,
            }}
          >
            {deleting ? '删除中' : '删除'}
          </button>
          <button
            onClick={handleCancelDelete}
            style={{
              padding: '4px 10px', borderRadius: 7,
              border: `1px solid ${isDark ? 'rgba(162,155,254,0.15)' : 'rgba(108,92,231,0.15)'}`,
              background: 'transparent', color: isDark ? '#9CA3B4' : '#5F6B7A',
              fontSize: 12, cursor: 'pointer',
              fontFamily: 'Inter, -apple-system, sans-serif',
            }}
          >
            取消
          </button>
        </div>
      ) : (
        /* Normal row actions */
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginRight: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00C48C', boxShadow: '0 0 6px rgba(0,196,140,0.5)' }} />
            <span style={{ fontSize: 11, color: '#00C48C', fontFamily: 'Inter, -apple-system, sans-serif' }}>Ready</span>
          </div>
          {/* Download */}
          <button
            onClick={handleDownload}
            disabled={downloading}
            title="下载"
            style={{
              width: 28, height: 28, borderRadius: 8,
              background: hovered ? isDark ? 'rgba(108,151,218,0.12)' : 'rgba(108,151,218,0.08)' : 'transparent',
              border: `1px solid ${hovered ? isDark ? 'rgba(108,151,218,0.20)' : 'rgba(108,151,218,0.15)' : 'transparent'}`,
              color: isDark ? '#5F6B7A' : '#9CA3B4',
              cursor: downloading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s', opacity: downloading ? 0.6 : 1,
            }}
            onMouseEnter={e => { if (!downloading) (e.currentTarget as HTMLButtonElement).style.color = '#6C97DA' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = isDark ? '#5F6B7A' : '#9CA3B4' }}
          >
            <svg viewBox="0 0 16 16" width={14} height={14} fill="none"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v8M3 10l5 4 5-4M2 14h12" />
            </svg>
          </button>
          {/* Delete — admin only */}
          {isAdmin && (
            <button
              onClick={handleDeleteClick}
              title="删除"
              style={{
                width: 28, height: 28, borderRadius: 8,
                background: hovered ? 'rgba(255,71,87,0.08)' : 'transparent',
                border: `1px solid ${hovered ? 'rgba(255,71,87,0.18)' : 'transparent'}`,
                color: isDark ? '#5F6B7A' : '#9CA3B4',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#FF4757' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = isDark ? '#5F6B7A' : '#9CA3B4' }}
            >
              <svg viewBox="0 0 16 16" width={14} height={14} fill="none"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 4h12M6 4V2h4v2M5 4l1 9h4l1-9" />
              </svg>
            </button>
          )}
          {/* Explore */}
          <button
            onClick={() => navigate(`/chat?dataset_id=${ds.id}`)}
            title="开始探索"
            style={{
              width: 28, height: 28, borderRadius: 8,
              background: hovered ? isDark ? 'rgba(162,155,254,0.12)' : 'rgba(108,92,231,0.08)' : 'transparent',
              border: `1px solid ${hovered ? isDark ? 'rgba(162,155,254,0.20)' : 'rgba(108,92,231,0.15)' : 'transparent'}`,
              color: isDark ? '#A29BFE' : '#6C5CE7',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >
            <svg viewBox="0 0 16 16" width={14} height={14} fill="none"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3l5 5-5 5M3 8h10" />
            </svg>
          </button>
        </>
      )}
    </div>
  )
}

// ── Trash item row ────────────────────────────────────────────────────────────
function TrashItem({ ds, isDark, onRestore }: { ds: Dataset; isDark: boolean; onRestore: (id: string) => void }) {
  const [restoring, setRestoring] = useState(false)

  const handleRestore = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setRestoring(true)
    try {
      await datasetsApi.restore(ds.id.toString())
      onRestore(ds.id.toString())
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 16px', borderRadius: 12,
      background: isDark ? 'rgba(26,29,46,0.25)' : 'rgba(255,255,255,0.40)',
      border: `1px solid ${isDark ? 'rgba(162,155,254,0.05)' : 'rgba(108,92,231,0.05)'}`,
      opacity: 0.7,
    }}>
      <FileTypeIcon type={ds.source_type} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: isDark ? '#9CA3B4' : '#5F6B7A', fontFamily: 'Inter, -apple-system, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ds.name}
        </div>
        <div style={{ fontSize: 11, color: isDark ? '#3D4256' : '#C4CBD6', fontFamily: 'Inter, -apple-system, sans-serif' }}>
          {ds.row_count.toLocaleString()} 行 · {formatDate(ds.created_at)}
        </div>
      </div>
      <button
        onClick={handleRestore}
        disabled={restoring}
        title="恢复"
        style={{
          padding: '4px 12px', borderRadius: 7, border: `1px solid ${isDark ? 'rgba(0,200,140,0.25)' : 'rgba(0,200,140,0.30)'}`,
          background: 'transparent', color: '#00C48C',
          fontSize: 12, cursor: restoring ? 'not-allowed' : 'pointer',
          fontFamily: 'Inter, -apple-system, sans-serif', opacity: restoring ? 0.5 : 1,
        }}
      >
        {restoring ? '恢复中' : '恢复'}
      </button>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type Phase = 'idle' | 'checking' | 'confirm_replace' | 'uploading' | 'preview' | 'success'

export default function UploadPage() {
  const navigate          = useNavigate()
  const { theme }         = useThemeStore()
  const isDark            = theme === 'dark'
  const fileInputRef      = useRef<HTMLInputElement>(null)
  const progressRef       = useRef<ReturnType<typeof setInterval> | null>(null)

  const [phase,           setPhase]          = useState<Phase>('idle')
  const [dataset,         setDataset]        = useState<DatasetDetail | null>(null)
  const [currentFile,     setCurrentFile]    = useState<File | null>(null)
  const [duplicate,       setDuplicate]      = useState<DuplicateCheckMatch['dataset'] | null>(null)
  const [error,           setError]          = useState<string | null>(null)
  const [isDragging,      setIsDragging]     = useState(false)
  const [isHovered,       setIsHovered]      = useState(false)
  const [fakeProgress,    setFakeProgress]   = useState(0)
  const [recentDatasets,  setRecentDatasets] = useState<Dataset[]>([])
  const [trashDatasets,   setTrashDatasets]  = useState<Dataset[]>([])
  const [trashOpen,       setTrashOpen]      = useState(false)
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin')

  const loadDatasets = () => {
    datasetsApi.list().then((r) => setRecentDatasets(r.data)).catch(() => {})
  }

  const loadTrash = () => {
    datasetsApi.trash().then((r) => setTrashDatasets(r.data)).catch(() => {})
  }

  const handleDelete = (id: string) => {
    datasetsApi.delete(id)
      .then(() => { loadDatasets(); loadTrash() })
      .catch(() => setError('删除失败，请重试'))
  }

  const handleRestore = (id: string) => {
    loadDatasets()
    setTrashDatasets((prev) => prev.filter((d) => d.id.toString() !== id))
  }

  useEffect(() => { loadDatasets() }, [])
  useEffect(() => { if (isAdmin) loadTrash() }, [isAdmin])

  // Fake progress animation during upload
  useEffect(() => {
    if (phase !== 'uploading') {
      if (progressRef.current) clearInterval(progressRef.current)
      return
    }
    setFakeProgress(0)
    progressRef.current = setInterval(() => {
      setFakeProgress((p) => {
        if (p >= 88) return 88
        return Math.min(88, p + Math.random() * 10 + 3)
      })
    }, 200)
    return () => { if (progressRef.current) clearInterval(progressRef.current) }
  }, [phase])

  // ── Core upload (with optional replaceId) ─────────────────────────────────
  const doUpload = async (file: File, replaceId?: string) => {
    setPhase('uploading')
    setError(null)
    setDataset(null)
    try {
      const res = await datasetsApi.upload(file, replaceId)
      if (progressRef.current) clearInterval(progressRef.current)
      setFakeProgress(100)
      setTimeout(() => {
        setDataset(res.data)
        setPhase('preview')
        loadDatasets()
      }, 600)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? '上传失败，请重试'
      setError(msg)
      setPhase('idle')
      setFakeProgress(0)
    }
  }

  // ── File selected: check for name collision first ──────────────────────────
  const handleFileSelected = async (file: File) => {
    setCurrentFile(file)
    setError(null)
    setDuplicate(null)

    const stem = file.name.replace(/\.[^.]+$/, '')
    setPhase('checking')
    try {
      const res = await datasetsApi.checkName(stem)
      if (res.data.exists) {
        setDuplicate(res.data.dataset)
        setPhase('confirm_replace')
        return
      }
    } catch {
      // If check fails, proceed with normal upload
    }
    doUpload(file)
  }

  const handleConfirm = () => {
    if (!dataset) return
    setPhase('success')
    setTimeout(() => navigate(`/chat?dataset_id=${dataset.id}`), 1200)
  }

  // ── Drag / file select handlers ────────────────────────────────────────────
  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = ()                   => setIsDragging(false)
  const onDrop      = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelected(file)
  }
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) { handleFileSelected(file); e.target.value = '' }
  }

  // ── Theme tokens ──────────────────────────────────────────────────────────
  const dzBg = isDragging
    ? isDark ? 'rgba(42,37,80,0.45)'   : 'rgba(240,238,255,0.70)'
    : isHovered
    ? isDark ? 'rgba(42,37,80,0.30)'   : 'rgba(240,238,255,0.60)'
    : isDark ? 'rgba(26,29,46,0.35)'   : 'rgba(255,255,255,0.50)'
  const dzBorderColor = isDragging
    ? isDark ? 'rgba(162,155,254,0.60)' : 'rgba(108,92,231,0.55)'
    : isHovered
    ? isDark ? 'rgba(162,155,254,0.35)' : 'rgba(108,92,231,0.32)'
    : isDark ? 'rgba(162,155,254,0.15)' : 'rgba(108,92,231,0.15)'
  const dzBorderStyle = isDragging ? 'solid' : 'dashed'

  const ringStroke  = isDark ? '#A29BFE' : '#6C5CE7'
  const ringOpacity = (o: number) => isDark ? o : o * 1.5

  return (
    <>
      <style>{`
        @keyframes arrow-bounce {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-8px); }
        }
        @keyframes up-enter {
          0%   { opacity: 0; transform: translateY(16px) scale(0.97); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes success-pop {
          0%   { opacity: 0; transform: scale(0.7); }
          60%  { opacity: 1; transform: scale(1.1); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes success-fade-in {
          0%   { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes check-draw {
          0%   { stroke-dashoffset: 28; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes ul-move {
          0%   { offset-distance: 0%; }
          100% { offset-distance: 100%; }
        }
        @keyframes ul-trail {
          0%   { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -280; }
        }
        @keyframes ul-glow {
          0%, 100% { filter: drop-shadow(0 0 4px rgba(162,155,254,0.5)); }
          50%       { filter: drop-shadow(0 0 9px rgba(162,155,254,0.85)); }
        }
        .ul-ball {
          offset-path: path('${MP}');
          offset-rotate: 0deg;
          animation: ul-move 2s ease-in-out infinite, ul-glow 2s ease-in-out infinite;
        }
        .ul-trail {
          animation: ul-trail 2s linear infinite;
        }
        .dz-arrow-bounce {
          animation: arrow-bounce 0.6s ease-in-out infinite;
        }
      `}</style>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={onFileChange}
        style={{ display: 'none' }}
      />

      {/* ── Page layout ── */}
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
      }}>
        <div style={{ width: 'min(580px, 100%)', display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* ── Header text ── */}
          {phase !== 'success' && phase !== 'confirm_replace' && phase !== 'checking' && (
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <h2 style={{
                fontSize: 24, fontWeight: 500, margin: '0 0 10px',
                color: isDark ? '#E8ECF3' : '#1A1D2E',
                fontFamily: 'Inter, -apple-system, sans-serif',
              }}>
                把你的数据带进来
              </h2>
              <p style={{
                fontSize: 14, color: isDark ? '#5F6B7A' : '#9CA3B4',
                lineHeight: 1.6, margin: 0,
                fontFamily: 'Inter, -apple-system, sans-serif',
              }}>
                拖入文件即可开始，系统将自动识别数据结构
              </p>
            </div>
          )}

          {/* ── Error banner ── */}
          {error && (
            <div style={{
              padding: '12px 16px', borderRadius: 14, marginBottom: 16,
              background: 'rgba(255,71,87,0.08)',
              border: '1px solid rgba(255,71,87,0.22)',
              color: '#FF4757', fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontFamily: 'Inter, -apple-system, sans-serif',
            }}>
              <span>{error}</span>
              <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#FF4757', cursor: 'pointer', fontSize: 16, padding: 0 }}>×</button>
            </div>
          )}

          {/* ── Phase: idle / uploading ── */}
          {(phase === 'idle' || phase === 'uploading') && (
            <div
              onClick={() => phase === 'idle' && fileInputRef.current?.click()}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              style={{
                width: '100%',
                padding: '56px 40px',
                borderRadius: 24,
                background: dzBg,
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: `1.5px ${dzBorderStyle} ${dzBorderColor}`,
                cursor: phase === 'idle' ? 'pointer' : 'default',
                transition: 'all 0.3s ease',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 20,
                boxShadow: isDragging
                  ? `0 0 40px rgba(108,92,231,0.12)`
                  : isDark ? '0 8px 32px rgba(0,0,0,0.2)' : '0 4px 20px rgba(108,92,231,0.06)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Background radial glow */}
              <div style={{
                position: 'absolute',
                top: '50%', left: '50%',
                transform: 'translate(-50%,-50%)',
                width: 200, height: 200,
                background: 'radial-gradient(ellipse at center, rgba(108,92,231,0.06) 0%, transparent 70%)',
                pointerEvents: 'none',
              }} />

              {phase === 'idle' ? (
                <>
                  {/* Concentric rings + arrow */}
                  <div style={{
                    width: 80, height: 80, borderRadius: '50%', position: 'relative',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: `1.5px solid rgba(${isDark ? '162,155,254' : '108,92,231'},${ringOpacity(0.22)})`,
                    transform: isHovered || isDragging ? 'scale(1.05)' : 'scale(1)',
                    transition: 'transform 0.3s ease',
                  }}>
                    <div style={{
                      width: 60, height: 60, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: `1px solid rgba(${isDark ? '162,155,254' : '108,92,231'},${ringOpacity(0.12)})`,
                    }}>
                      <svg viewBox="0 0 24 24" width={24} height={24} fill="none"
                        stroke={ringStroke} strokeWidth="1.5"
                        strokeLinecap="round" strokeLinejoin="round"
                        className={isDragging ? 'dz-arrow-bounce' : undefined}
                        style={{ transition: 'transform 0.2s', transform: isHovered && !isDragging ? 'translateY(-4px)' : 'translateY(0)' }}
                      >
                        <path d="M12 19V5M5 12l7-7 7 7" />
                      </svg>
                    </div>
                  </div>

                  {/* Main text */}
                  <p style={{
                    fontSize: 16, fontWeight: 500, margin: 0,
                    color: isDark ? '#E8ECF3' : '#1A1D2E',
                    fontFamily: 'Inter, -apple-system, sans-serif',
                    textAlign: 'center',
                  }}>
                    拖拽文件到此处，或点击浏览
                  </p>

                  {/* Format tags */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[
                      { label: '.XLSX', bg: 'rgba(0,200,140,0.08)',   color: '#00C48C', border: 'rgba(0,200,140,0.14)'   },
                      { label: '.XLS',  bg: 'rgba(255,185,70,0.08)',  color: '#FFB946', border: 'rgba(255,185,70,0.14)'  },
                      { label: '.CSV',  bg: 'rgba(59,130,246,0.08)',  color: '#3B82F6', border: 'rgba(59,130,246,0.14)'  },
                    ].map((t) => (
                      <span key={t.label} style={{
                        padding: '4px 12px', borderRadius: 8,
                        background: t.bg, color: t.color,
                        border: `1px solid ${t.border}`,
                        fontSize: 11, fontWeight: 500, letterSpacing: '0.5px',
                        fontFamily: 'Inter, -apple-system, sans-serif',
                      }}>
                        {t.label}
                      </span>
                    ))}
                  </div>

                  {/* Size limit */}
                  <span style={{ fontSize: 11, color: isDark ? '#3D4256' : '#C4CBD6', fontFamily: 'Inter, -apple-system, sans-serif' }}>
                    Max 50 MB per file
                  </span>
                </>
              ) : (
                /* Uploading state */
                <>
                  {/* Möbius loader */}
                  <svg viewBox="0 0 160 112" width={100} height={70} style={{ overflow: 'visible' }}>
                    <path d={MP} fill="none"
                      stroke={isDark ? 'rgba(162,155,254,0.18)' : 'rgba(108,92,231,0.15)'}
                      strokeWidth="3" strokeLinecap="round" />
                    <path d={MP} fill="none"
                      stroke={isDark ? '#A29BFE' : '#6C5CE7'}
                      strokeWidth="3" strokeLinecap="round"
                      strokeDasharray="65 215"
                      className="ul-trail"
                      style={{ opacity: 0.7 }}
                    />
                    <circle r="7" fill={isDark ? '#A29BFE' : '#6C5CE7'} className="ul-ball" />
                  </svg>

                  {/* Status text */}
                  <p style={{
                    fontSize: 14, margin: 0,
                    color: isDark ? '#A29BFE' : '#6C5CE7',
                    fontFamily: 'Inter, -apple-system, sans-serif',
                  }}>
                    解析文件结构中...
                  </p>

                  {/* Progress bar */}
                  <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{
                      height: 4, borderRadius: 2,
                      background: isDark ? 'rgba(162,155,254,0.10)' : 'rgba(108,92,231,0.08)',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%', borderRadius: 2,
                        background: fakeProgress >= 100
                          ? '#00C48C'
                          : 'linear-gradient(90deg, #6C5CE7, #A29BFE)',
                        width: `${fakeProgress}%`,
                        transition: 'width 0.3s ease, background 0.4s ease',
                      }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: isDark ? '#5F6B7A' : '#9CA3B4', fontFamily: 'Inter, -apple-system, sans-serif' }}>
                      <span>{currentFile?.name ?? ''}</span>
                      <span>{fakeProgress >= 100 ? '解析完成' : `${Math.round(fakeProgress)}%`}</span>
                    </div>
                  </div>

                  {/* File info */}
                  {currentFile && (
                    <p style={{ fontSize: 13, color: isDark ? '#5F6B7A' : '#9CA3B4', margin: 0, fontFamily: 'Inter, -apple-system, sans-serif' }}>
                      {currentFile.name} · {formatSize(currentFile.size)}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Phase: checking (name lookup spinner) ── */}
          {phase === 'checking' && (
            <div style={{
              width: '100%', padding: '48px 40px', borderRadius: 24,
              background: isDark ? 'rgba(26,29,46,0.35)' : 'rgba(255,255,255,0.50)',
              backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              border: `1.5px dashed ${isDark ? 'rgba(162,155,254,0.15)' : 'rgba(108,92,231,0.15)'}`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
            }}>
              <svg viewBox="0 0 160 112" width={80} height={56} style={{ overflow: 'visible' }}>
                <path d={MP} fill="none"
                  stroke={isDark ? 'rgba(162,155,254,0.18)' : 'rgba(108,92,231,0.15)'}
                  strokeWidth="3" strokeLinecap="round" />
                <path d={MP} fill="none"
                  stroke={isDark ? '#A29BFE' : '#6C5CE7'}
                  strokeWidth="3" strokeLinecap="round"
                  strokeDasharray="65 215" className="ul-trail" style={{ opacity: 0.7 }} />
                <circle r="7" fill={isDark ? '#A29BFE' : '#6C5CE7'} className="ul-ball" />
              </svg>
              <p style={{ fontSize: 14, margin: 0, color: isDark ? '#A29BFE' : '#6C5CE7', fontFamily: 'Inter, -apple-system, sans-serif' }}>
                检查表格是否已存在...
              </p>
            </div>
          )}

          {/* ── Phase: confirm_replace ── */}
          {phase === 'confirm_replace' && duplicate && currentFile && (
            <div style={{
              width: '100%', borderRadius: 24, padding: '28px 28px 24px',
              background: isDark ? 'rgba(26,29,46,0.50)' : 'rgba(255,255,255,0.72)',
              backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              border: `1.5px solid ${isDark ? 'rgba(255,185,70,0.22)' : 'rgba(245,158,11,0.22)'}`,
              boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.28)' : '0 8px 24px rgba(245,158,11,0.08)',
              animation: 'up-enter 0.4s ease',
            }}>
              {/* Warning header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'rgba(245,158,11,0.12)',
                  border: '1px solid rgba(245,158,11,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <svg viewBox="0 0 20 20" width={18} height={18} fill="none">
                    <path d="M10 3L18 17H2L10 3Z" stroke="#F59E0B" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="M10 9v4M10 15v.5" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: isDark ? '#E8ECF3' : '#1A1D2E', fontFamily: 'Inter, -apple-system, sans-serif' }}>
                    发现同名表格
                  </div>
                  <div style={{ fontSize: 12, color: isDark ? '#5F6B7A' : '#9CA3B4', fontFamily: 'Inter, -apple-system, sans-serif' }}>
                    已存在名为 <span style={{ color: isDark ? '#A29BFE' : '#6C5CE7', fontWeight: 500 }}>{duplicate.name}</span> 的数据集，是否用新文件更新？
                  </div>
                </div>
              </div>

              {/* Comparison */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 32px 1fr', gap: 12,
                alignItems: 'center', marginBottom: 24,
              }}>
                {/* Old */}
                <div style={{
                  padding: '14px 16px', borderRadius: 14,
                  background: isDark ? 'rgba(255,71,87,0.06)' : 'rgba(255,71,87,0.04)',
                  border: `1px solid ${isDark ? 'rgba(255,71,87,0.14)' : 'rgba(255,71,87,0.12)'}`,
                }}>
                  <div style={{ fontSize: 11, color: isDark ? '#5F6B7A' : '#9CA3B4', marginBottom: 6, fontFamily: 'Inter, -apple-system, sans-serif', textTransform: 'uppercase', letterSpacing: '0.5px' }}>当前数据</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: isDark ? '#E8ECF3' : '#1A1D2E', marginBottom: 4, fontFamily: 'Inter, -apple-system, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{duplicate.name}</div>
                  <div style={{ fontSize: 12, color: isDark ? '#5F6B7A' : '#9CA3B4', fontFamily: 'Inter, -apple-system, sans-serif' }}>
                    {duplicate.row_count.toLocaleString()} 行 · {duplicate.column_count} 字段
                  </div>
                  <div style={{ fontSize: 11, color: isDark ? '#3D4256' : '#C4CBD6', marginTop: 4, fontFamily: 'Inter, -apple-system, sans-serif' }}>
                    {new Date(duplicate.created_at).toLocaleDateString('zh-CN')}
                  </div>
                </div>

                {/* Arrow */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <svg viewBox="0 0 24 24" width={20} height={20} fill="none"
                    stroke={isDark ? '#5F6B7A' : '#9CA3B4'} strokeWidth="1.5"
                    strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </div>

                {/* New */}
                <div style={{
                  padding: '14px 16px', borderRadius: 14,
                  background: isDark ? 'rgba(0,200,140,0.06)' : 'rgba(0,200,140,0.04)',
                  border: `1px solid ${isDark ? 'rgba(0,200,140,0.18)' : 'rgba(0,200,140,0.15)'}`,
                }}>
                  <div style={{ fontSize: 11, color: isDark ? '#5F6B7A' : '#9CA3B4', marginBottom: 6, fontFamily: 'Inter, -apple-system, sans-serif', textTransform: 'uppercase', letterSpacing: '0.5px' }}>新文件</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: isDark ? '#E8ECF3' : '#1A1D2E', marginBottom: 4, fontFamily: 'Inter, -apple-system, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentFile.name}</div>
                  <div style={{ fontSize: 12, color: isDark ? '#5F6B7A' : '#9CA3B4', fontFamily: 'Inter, -apple-system, sans-serif' }}>
                    {formatSize(currentFile.size)}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => doUpload(currentFile)}
                  style={{
                    flex: 1, padding: '10px 16px', borderRadius: 12,
                    border: `1px solid ${isDark ? 'rgba(162,155,254,0.15)' : 'rgba(108,92,231,0.15)'}`,
                    background: 'transparent',
                    color: isDark ? '#9CA3B4' : '#5F6B7A',
                    fontSize: 13, cursor: 'pointer', fontFamily: 'Inter, -apple-system, sans-serif',
                  }}
                >
                  另存为新表
                </button>
                <button
                  onClick={() => doUpload(currentFile, duplicate.id)}
                  style={{
                    flex: 1, padding: '10px 16px', borderRadius: 12, border: 'none',
                    background: 'linear-gradient(135deg, #F59E0B 0%, #FCD34D 100%)',
                    color: '#1A1D2E', fontSize: 13, fontWeight: 500,
                    cursor: 'pointer', fontFamily: 'Inter, -apple-system, sans-serif',
                    boxShadow: '0 4px 14px rgba(245,158,11,0.30)',
                  }}
                >
                  更新数据（删除旧数据）
                </button>
              </div>
            </div>
          )}

          {/* ── Phase: preview ── */}
          {phase === 'preview' && dataset && (
            <SchemaPreview
              dataset={dataset}
              isDark={isDark}
              onCancel={() => { setDataset(null); setError(null); setPhase('idle') }}
              onConfirm={handleConfirm}
            />
          )}

          {/* ── Phase: success ── */}
          {phase === 'success' && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 20, padding: '80px 40px',
            }}>
              {/* Green check circle */}
              <div style={{
                width: 80, height: 80, borderRadius: '50%',
                background: 'rgba(0,196,140,0.12)',
                border: '2px solid rgba(0,196,140,0.30)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: 'success-pop 0.5s ease',
              }}>
                <svg viewBox="0 0 24 24" width={36} height={36} fill="none"
                  stroke="#00C48C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l5 5L19 7" strokeDasharray="28" style={{
                    animation: 'check-draw 0.45s ease-out 0.15s both',
                  }} />
                </svg>
              </div>
              <div style={{ textAlign: 'center', animation: 'success-fade-in 0.4s ease 0.4s both' }}>
                <p style={{ fontSize: 18, fontWeight: 500, color: isDark ? '#E8ECF3' : '#1A1D2E', margin: '0 0 8px', fontFamily: 'Inter, -apple-system, sans-serif' }}>
                  Dataset ready
                </p>
                <p style={{ fontSize: 13, color: isDark ? '#5F6B7A' : '#9CA3B4', margin: 0, fontFamily: 'Inter, -apple-system, sans-serif' }}>
                  正在跳转到对话页面...
                </p>
              </div>
            </div>
          )}

          {/* ── Recent datasets ── */}
          {phase !== 'success' && phase !== 'confirm_replace' && recentDatasets.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p style={{
                  fontSize: 11, fontWeight: 600, letterSpacing: '0.5px',
                  textTransform: 'uppercase', color: isDark ? '#5F6B7A' : '#9CA3B4',
                  margin: 0, fontFamily: 'Inter, -apple-system, sans-serif',
                }}>
                  Recent datasets
                </p>
                <button
                  onClick={() => navigate('/chat')}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
                    display: 'flex', alignItems: 'center', gap: 4,
                    color: isDark ? '#A29BFE' : '#6C5CE7', fontSize: 12,
                    fontFamily: 'Inter, -apple-system, sans-serif',
                  }}
                >
                  查看全部
                  <svg viewBox="0 0 16 16" width={12} height={12} fill="none"
                    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 3l5 5-5 5" />
                  </svg>
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentDatasets.slice(0, 5).map((ds) => (
                  <RecentItem key={ds.id} ds={ds} isDark={isDark} onDelete={handleDelete} onError={setError} />
                ))}
              </div>
              {recentDatasets.length > 5 && (
                <button
                  onClick={() => navigate('/chat')}
                  style={{
                    width: '100%', marginTop: 8, padding: '10px', borderRadius: 12,
                    background: 'none', cursor: 'pointer',
                    border: `1px dashed ${isDark ? 'rgba(162,155,254,0.12)' : 'rgba(108,92,231,0.12)'}`,
                    color: isDark ? '#5F6B7A' : '#9CA3B4', fontSize: 12,
                    fontFamily: 'Inter, -apple-system, sans-serif',
                  }}
                >
                  还有 {recentDatasets.length - 5} 个数据集 · 点击查看全部
                </button>
              )}
            </div>
          )}

          {/* ── Trash (admin only) ── */}
          {isAdmin && phase !== 'success' && phase !== 'confirm_replace' && (
            <div style={{ marginTop: 24 }}>
              <button
                onClick={() => setTrashOpen((o) => !o)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0', marginBottom: trashOpen ? 10 : 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg viewBox="0 0 16 16" width={13} height={13} fill="none"
                    stroke={isDark ? '#5F6B7A' : '#9CA3B4'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 4h12M6 4V2h4v2M5 4l1 9h4l1-9" />
                  </svg>
                  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', color: isDark ? '#5F6B7A' : '#9CA3B4', fontFamily: 'Inter, -apple-system, sans-serif' }}>
                    回收站{trashDatasets.length > 0 ? ` (${trashDatasets.length})` : ''}
                  </span>
                </div>
                <svg viewBox="0 0 16 16" width={12} height={12} fill="none"
                  stroke={isDark ? '#5F6B7A' : '#9CA3B4'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: trashOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                  <path d="M3 6l5 5 5-5" />
                </svg>
              </button>
              {trashOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {trashDatasets.length === 0 ? (
                    <div style={{
                      padding: '16px', borderRadius: 12, textAlign: 'center',
                      background: isDark ? 'rgba(26,29,46,0.25)' : 'rgba(255,255,255,0.40)',
                      border: `1px dashed ${isDark ? 'rgba(162,155,254,0.08)' : 'rgba(108,92,231,0.08)'}`,
                      color: isDark ? '#3D4256' : '#C4CBD6',
                      fontSize: 12, fontFamily: 'Inter, -apple-system, sans-serif',
                    }}>
                      回收站为空
                    </div>
                  ) : (
                    trashDatasets.map((ds) => (
                      <TrashItem key={ds.id} ds={ds} isDark={isDark} onRestore={handleRestore} />
                    ))
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  )
}
