import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

export interface ParticleSystemRef {
  setMode(mode: 'drift' | 'converge' | 'explode'): void
  setTheme(theme: 'light' | 'dark'): void
}

interface Particle {
  x: number
  y: number
  radius: number
  vx: number
  vy: number
  opacity: number
  colorIdx: number
}

const LIGHT_COLORS = ['#6C5CE7', '#A29BFE', '#00C48C', '#FFB946', '#3B82F6', '#FF6B81']
const DARK_COLORS  = ['#8B7FFF', '#C4BFFE', '#00E0A3', '#FFC95A', '#60A5FA', '#FF8FA3']

const ParticleBackground = forwardRef<ParticleSystemRef>((_, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef  = useRef({
    theme:         'light' as 'light' | 'dark',
    mode:          'drift' as 'drift' | 'converge' | 'explode',
    particles:     [] as Particle[],
    animFrame:     0,
    isLowEnd:      false,
    modeStartTime: 0,
  })

  useImperativeHandle(ref, () => ({
    setMode(mode) {
      stateRef.current.mode = mode
      stateRef.current.modeStartTime = performance.now()
      // On explode: scatter all particles outward from center
      if (mode === 'explode') {
        const canvas = canvasRef.current
        if (canvas) {
          const cx = canvas.width / 2
          const cy = canvas.height / 2
          for (const p of stateRef.current.particles) {
            const dx = p.x - cx || 0.01
            const dy = p.y - cy || 0.01
            const len = Math.sqrt(dx * dx + dy * dy) || 1
            const speed = 14 + Math.random() * 18
            p.vx = (dx / len) * speed
            p.vy = (dy / len) * speed
          }
        }
      }
    },
    setTheme(theme) { stateRef.current.theme = theme },
  }))

  useEffect(() => {
    const canvasEl = canvasRef.current
    if (!canvasEl) return
    const canvas: HTMLCanvasElement = canvasEl   // non-null alias for closures
    const ctx = canvas.getContext('2d')!
    const state = stateRef.current

    // Detect low-end device
    state.isLowEnd = navigator.hardwareConcurrency != null && navigator.hardwareConcurrency <= 2

    function init() {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight

      // Clear canvas fully on init
      const bgColor = state.theme === 'dark' ? '#0A0C14' : '#FFFFFF'
      ctx.fillStyle = bgColor
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const area  = canvas.width * canvas.height
      const count = state.isLowEnd
        ? 40
        : Math.min(120, Math.max(80, Math.floor(area / 15000)))

      state.particles = Array.from({ length: count }, () => ({
        x:        Math.random() * canvas.width,
        y:        Math.random() * canvas.height,
        radius:   Math.pow(Math.random(), 2) * 5 + 1,
        vx:       (Math.random() - 0.5) * 0.6,
        vy:       (Math.random() - 0.5) * 0.6,
        opacity:  Math.random() * 0.25 + 0.1,
        colorIdx: Math.floor(Math.random() * 6),
      }))
    }

    let lastFrame = 0

    function draw(time: number) {
      if (time - lastFrame < 16) return  // ~60fps cap
      lastFrame = time

      const { theme, particles, isLowEnd } = state
      const isDark   = theme === 'dark'
      const w = canvas.width
      const h = canvas.height
      const colors   = isDark ? DARK_COLORS : LIGHT_COLORS
      const bgColor  = isDark ? '#0A0C14' : '#FFFFFF'
      const lineColor = isDark ? '#A29BFE' : '#6C5CE7'

      // Trail effect — semi-transparent fill instead of full clear
      ctx.globalAlpha = 0.14
      ctx.fillStyle   = bgColor
      ctx.fillRect(0, 0, w, h)
      ctx.globalAlpha = 1

      // Update positions
      const { mode, modeStartTime } = state
      const cx = w / 2
      const cy = h / 2
      const elapsed = time - modeStartTime

      for (const p of particles) {
        if (mode === 'converge') {
          // Pull toward center, accelerating over 2 s
          const strength = Math.min(0.05 + elapsed * 0.00004, 0.18)
          p.vx += (cx - p.x) * strength * 0.04
          p.vy += (cy - p.y) * strength * 0.04
          // Add a slight clockwise swirl
          const swirl = 0.015
          p.vx += -p.vy * swirl
          p.vy +=  p.vx * swirl
          // Dampen speed
          p.vx *= 0.94
          p.vy *= 0.94
        } else if (mode === 'explode') {
          // Slow down after burst
          p.vx *= 0.93
          p.vy *= 0.93
          // After 0.8 s revert to drift
          if (elapsed > 800) {
            p.vx = (Math.random() - 0.5) * 0.6
            p.vy = (Math.random() - 0.5) * 0.6
            state.mode = 'drift'
          }
        }

        p.x += p.vx
        p.y += p.vy

        if (mode === 'drift') {
          if (p.x - p.radius < 0)  { p.x = p.radius;       p.vx *= -1 }
          if (p.x + p.radius > w)  { p.x = w - p.radius;   p.vx *= -1 }
          if (p.y - p.radius < 0)  { p.y = p.radius;       p.vy *= -1 }
          if (p.y + p.radius > h)  { p.y = h - p.radius;   p.vy *= -1 }
        }
      }

      // Draw connections (O(n²), fine for ≤120 particles)
      if (!isLowEnd) {
        ctx.strokeStyle = lineColor
        ctx.lineWidth   = 0.5
        const n = particles.length

        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const dx   = particles[i].x - particles[j].x
            const dy   = particles[i].y - particles[j].y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < 120) {
              ctx.globalAlpha = (1 - dist / 120) * 0.06
              ctx.beginPath()
              ctx.moveTo(particles[i].x, particles[i].y)
              ctx.lineTo(particles[j].x, particles[j].y)
              ctx.stroke()
            }
          }
        }
        ctx.globalAlpha = 1
      }

      // Draw particles
      for (const p of particles) {
        ctx.globalAlpha = p.opacity * (isDark ? 0.8 : 1)
        ctx.fillStyle   = colors[p.colorIdx]
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    function animate(time: number) {
      state.animFrame = requestAnimationFrame(animate)
      draw(time)
    }

    init()
    state.animFrame = requestAnimationFrame(animate)

    const onResize = () => init()
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(state.animFrame)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position:      'fixed',
        top:           0,
        left:          0,
        width:         '100vw',
        height:        '100vh',
        zIndex:        0,
        pointerEvents: 'none',
      }}
    />
  )
})

ParticleBackground.displayName = 'ParticleBackground'
export default ParticleBackground
