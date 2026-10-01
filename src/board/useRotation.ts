import { useEffect, useRef, useState } from 'react'

// 보드 회전. rotateBy(±90)으로 목표 각도를 바꾸면 460ms 동안 부드럽게 돌아간다.
// 돌아가는 중에 또 누르면 지금 각도에서 새 목표로 이어서 돈다.
// 운영체제의 '동작 줄이기' 설정이 켜져 있으면 애니메이션 없이 바로 바뀐다

const DURATION = 460
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2)

export function useRotation() {
  const [angle, setAngle] = useState(0) // 지금 그리는 각도 (도)
  const [settled, setSettled] = useState(0) // 마지막으로 다 돌아간 각도 (각도 문구용)
  const anim = useRef({ angle: 0, target: 0, raf: 0 })

  useEffect(() => () => cancelAnimationFrame(anim.current.raf), [])

  function rotateBy(delta: number) {
    const s = anim.current
    s.target += delta
    const from = s.angle
    const to = s.target
    const t0 = performance.now()
    cancelAnimationFrame(s.raf)
    const set = (a: number) => {
      s.angle = a
      setAngle(a)
    }
    const done = () => {
      set(to)
      setSettled(to)
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return done()
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / DURATION)
      if (k < 1) {
        set(from + (to - from) * easeInOut(k))
        s.raf = requestAnimationFrame(step)
      } else done()
    }
    s.raf = requestAnimationFrame(step)
  }

  return { angle, settled, rotateBy }
}
