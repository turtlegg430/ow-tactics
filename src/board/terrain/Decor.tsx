import type { Chevron as ChevronData, ControlPoint as PointData, Pt } from '../../data/types.ts'
import { iso, type View } from '../../engine/projection.ts'
import { heightAt, type Terrain } from '../../engine/terrain.ts'
import { pts } from '../svg.ts'

// 바닥 장식: 계단 꺾쇠, 거점, 화물 경로. 바닥 높이를 따라 그린다

interface Props<T> {
  terrain: Terrain
  view: View
  data: T
}

// 이중 꺾쇠: 오르는 쪽을 가리킨다
export function Chevron({ terrain, view: v, data: c }: Props<ChevronData>) {
  const P = (al: number, ac: number) => {
    const x = c.axis === 'x' ? c.x + al : c.x + ac
    const y = c.axis === 'x' ? c.y + ac : c.y + al
    return iso(v, x, y, heightAt(terrain, x, y))
  }
  return (
    <g>
      {[-1, 1].flatMap(k => {
        const mid = k * 0.18 * c.up
        const ch = pts([P(mid - 0.12 * c.up, -0.42), P(mid + 0.12 * c.up, 0), P(mid - 0.12 * c.up, 0.42)])
        return [<polyline key={k + 'bg'} className="chev-bg" points={ch} />, <polyline key={k} className="chev" points={ch} />]
      })}
    </g>
  )
}

export function ControlPoint({ terrain, view: v, data: p }: Props<PointData>) {
  const ring: [number, number][] = []
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2
    const x = p.x + Math.cos(a) * p.r
    const y = p.y + Math.sin(a) * p.r
    ring.push(iso(v, x, y, heightAt(terrain, x, y)))
  }
  return (
    <g>
      <polygon className="point-fill" points={pts(ring)} />
      <polygon className="point-line" points={pts(ring)} />
    </g>
  )
}

// 화물 경로: 바닥 선과 진행 방향 화살표
export function Track({ terrain, view: v, data: [a, b] }: Props<[Pt, Pt]>) {
  const n = 24
  const line: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const x = a[0] + ((b[0] - a[0]) * i) / n
    const y = a[1] + ((b[1] - a[1]) * i) / n
    line.push(iso(v, x, y, heightAt(terrain, x, y) + 0.01))
  }
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const ux = (b[0] - a[0]) / len
  const uy = (b[1] - a[1]) / len
  const arrows: string[] = []
  for (let d = 1.2; d < len - 0.3; d += 1.6) {
    const cx = a[0] + ux * d
    const cy = a[1] + uy * d
    const P = (al: number, ac: number) => {
      const x = cx + ux * al - uy * ac
      const y = cy + uy * al + ux * ac
      return iso(v, x, y, heightAt(terrain, x, y) + 0.01)
    }
    arrows.push(pts([P(-0.12, -0.15), P(0.14, 0), P(-0.12, 0.15)]))
  }
  return (
    <g>
      <polyline className="track" points={pts(line)} />
      {arrows.map((p, i) => (
        <polygon key={i} className="track-arrow" points={p} />
      ))}
    </g>
  )
}
