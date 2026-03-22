export default function MobiusLoader({ size = 120 }: { size?: number }) {
  const r = size / 2
  const stroke = size * 0.055

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* Outer ring — clockwise */}
      <circle
        cx={r} cy={r}
        r={r * 0.72}
        fill="none"
        stroke="url(#ring1)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${r * 0.72 * 2 * Math.PI * 0.7} ${r * 0.72 * 2 * Math.PI * 0.3}`}
        style={{ animation: 'spin-cw 1.4s linear infinite', transformOrigin: `${r}px ${r}px` }}
      />
      {/* Middle ring — counter-clockwise */}
      <circle
        cx={r} cy={r}
        r={r * 0.50}
        fill="none"
        stroke="url(#ring2)"
        strokeWidth={stroke * 0.8}
        strokeLinecap="round"
        strokeDasharray={`${r * 0.50 * 2 * Math.PI * 0.55} ${r * 0.50 * 2 * Math.PI * 0.45}`}
        style={{ animation: 'spin-ccw 1s linear infinite', transformOrigin: `${r}px ${r}px` }}
      />
      {/* Inner ring — clockwise, faster */}
      <circle
        cx={r} cy={r}
        r={r * 0.28}
        fill="none"
        stroke="url(#ring3)"
        strokeWidth={stroke * 0.6}
        strokeLinecap="round"
        strokeDasharray={`${r * 0.28 * 2 * Math.PI * 0.4} ${r * 0.28 * 2 * Math.PI * 0.6}`}
        style={{ animation: 'spin-cw 0.7s linear infinite', transformOrigin: `${r}px ${r}px` }}
      />

      {/* Orbiting ball — rides along the outer ring path */}
      <g style={{ transformOrigin: `${r}px ${r}px`, animation: 'spin-cw 1.4s linear infinite' }}>
        <circle
          cx={r}
          cy={r * (1 - 0.72)}   /* top of outer ring */
          r={stroke * 0.9}
          fill="#A29BFE"
          style={{ filter: 'drop-shadow(0 0 3px rgba(162,155,254,0.8))' }}
        />
      </g>

      {/* Pulsing center dot */}
      <circle
        cx={r} cy={r}
        r={r * 0.09}
        fill="#6C5CE7"
        style={{ animation: 'center-pulse 1.4s ease-in-out infinite', transformOrigin: `${r}px ${r}px` }}
      />

      <defs>
        <linearGradient id="ring1" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#6C5CE7" />
          <stop offset="100%" stopColor="#A29BFE" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id="ring2" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#00C48C" />
          <stop offset="100%" stopColor="#A29BFE" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id="ring3" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#FFB946" />
          <stop offset="100%" stopColor="#FF6B81" stopOpacity="0.2" />
        </linearGradient>
      </defs>
    </svg>
  )
}
