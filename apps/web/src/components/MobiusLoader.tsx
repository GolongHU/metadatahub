export default function MobiusLoader({ size = 120 }: { size?: number }) {
  const w = size
  const h = size * 0.7
  const path = "M12,28 C12,12 28,4 40,20 C52,36 68,28 68,28 C68,28 68,44 56,36 C44,20 28,28 12,28 Z"

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 80 56"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* Dim track */}
      <path
        d={path}
        fill="none"
        stroke="var(--border-color)"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* Animated trail */}
      <path
        d={path}
        fill="none"
        stroke="#6C5CE7"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="40 117"
        style={{ animation: 'trail-fade 2s linear infinite' }}
      />

      {/* Traveling ball */}
      <circle
        r="5"
        fill="#6C5CE7"
        style={{
          offsetPath: `path('${path}')`,
          offsetDistance: '0%',
          animation: 'mobius-path 2s ease-in-out infinite',
          filter: 'drop-shadow(0 0 4px rgba(108,92,231,0.7))',
        } as React.CSSProperties}
      />
    </svg>
  )
}
