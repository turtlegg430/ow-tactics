import type { ReactElement } from 'react'
import { iso, type View } from '../../engine/projection.ts'
import { at, type Terrain, type Tile as TileData } from '../../engine/terrain.ts'
import { FALL_WALL, FLOOR_COLORS, ROOF, STAIR, STRUCT, shade } from '../../theme/colors.ts'
import { pts } from '../svg.ts'
import { line, lips } from './edges.tsx'

// 칸 하나: 보이는 옆면, 그 위에 윗면(바닥·낙사·구조물·지붕·계단)과 턱 선

type Corner = 'hA' | 'hB' | 'hC' | 'hD'
interface Face {
  n: [number, number] // 면이 향하는 쪽. 이웃 칸도 이쪽
  c1: Corner // 윗변 양 끝 모서리
  c2: Corner
  p1: [number, number]
  p2: [number, number]
  m1: Corner // 맞닿은 이웃 칸의 모서리
  m2: Corner
}
const FACES: Face[] = [
  { n: [1, 0], c1: 'hB', c2: 'hC', p1: [1, 0], p2: [1, 1], m1: 'hA', m2: 'hD' },
  { n: [0, 1], c1: 'hC', c2: 'hD', p1: [1, 1], p2: [0, 1], m1: 'hB', m2: 'hA' },
  { n: [-1, 0], c1: 'hD', c2: 'hA', p1: [0, 1], p2: [0, 0], m1: 'hC', m2: 'hB' },
  { n: [0, -1], c1: 'hA', c2: 'hB', p1: [0, 0], p2: [1, 0], m1: 'hD', m2: 'hC' },
]

interface Props {
  terrain: Terrain
  view: View
  gx: number
  gy: number
  /** 옆면만 그린다 (평평한 1층을 한 번에 칠할 때, Terrain의 FlatFloor) */
  sidesOnly?: boolean
}

export function Tile({ terrain, view: v, gx, gy, sidesOnly }: Props) {
  const t = at(terrain, gx, gy)!
  if (t.type === 'void') return null
  const { slab, pitBottom } = terrain.map
  const out: ReactElement[] = []

  if (t.type !== 'fall') {
    const base = t.type === 'floor' ? FLOOR_COLORS[t.floor] : t.type === 'stair' ? STAIR : STRUCT
    for (const F of FACES) {
      const nr = [F.n[0] * v.cos - F.n[1] * v.sin, F.n[0] * v.sin + F.n[1] * v.cos]
      if (nr[0] + nr[1] <= 1e-6) continue // 보는 쪽을 향한 면만
      const n = at(terrain, gx + F.n[0], gy + F.n[1])
      const h1 = t[F.c1]
      const h2 = t[F.c2]
      if (n && n[F.m1] >= h1 - 1e-6 && n[F.m2] >= h2 - 1e-6 && n.bot <= t.bot + 1e-6) continue // 이웃에 가려짐
      const P1 = [gx + F.p1[0], gy + F.p1[1]]
      const P2 = [gx + F.p2[0], gy + F.p2[1]]
      const sh = 0.67 + 0.09 * (nr[1] - nr[0])
      const part = (ha: number, hb: number, hc: number, hd: number) =>
        pts([iso(v, P1[0], P1[1], ha), iso(v, P2[0], P2[1], hb), iso(v, P2[0], P2[1], hc), iso(v, P1[0], P1[1], hd)])
      // 아랫부분 색: 낙사 둘레는 절벽, 지하 둘레는 갈색 상자
      const low = t.fallRing ? FALL_WALL : t.bot === pitBottom && t.type !== 'stair' ? FLOOR_COLORS.B : null
      if (low && Math.min(h1, h2) > slab + 1e-6) {
        out.push(<polygon key={out.length} className="face" points={part(h1, h2, slab, slab)} fill={shade(base, sh)} />)
        const lp = part(slab, slab, t.bot, t.bot)
        out.push(<polygon key={out.length} className="face" points={lp} fill={shade(low, sh)} />)
        if (t.fallRing) out.push(<polygon key={out.length} points={lp} fill="url(#fadeDark)" />)
      } else {
        const poly = part(h1, h2, t.bot, t.bot)
        out.push(<polygon key={out.length} className="face" points={poly} fill={shade(low || base, sh)} />)
        if (t.fallRing) out.push(<polygon key={out.length} points={poly} fill="url(#fadeDark)" />)
      }
    }
  }

  if (sidesOnly) return out.length ? <g>{out}</g> : null
  const quad = [iso(v, gx, gy, t.hA), iso(v, gx + 1, gy, t.hB), iso(v, gx + 1, gy + 1, t.hC), iso(v, gx, gy + 1, t.hD)]
  if (t.type === 'floor') {
    const c = FLOOR_COLORS[t.floor]
    out.push(<polygon key={out.length} points={pts(quad)} fill={c} stroke={c} strokeWidth={0.6} />)
    lips(terrain, v, gx, gy, t, out)
  } else if (t.type === 'fall') {
    out.push(<polygon key={out.length} points={pts(quad)} fill="url(#hatchFall)" />)
  } else if (t.type === 'struct') {
    out.push(<polygon key={out.length} className="struct-top" points={pts(quad)} fill={shade(STRUCT, 1.14)} />)
  } else if (t.type === 'roof') {
    roof(terrain, gx, gy, t, quad, out)
  } else {
    stair(terrain, v, gx, gy, t, out)
  }
  return <g>{out}</g>
}

// 지붕: 경사면을 어두운 색으로 칠하고, 용마루·처마·끝선을 밝은 실선으로
function roof(terrain: Terrain, gx: number, gy: number, t: TileData & { type: 'roof' }, quad: [number, number][], out: ReactElement[]) {
  out.push(<polygon key={out.length} points={pts(quad)} fill={ROOF} stroke={ROOF} strokeWidth={0.6} />)
  const [A, B, C, D] = quad
  const isRoof = (n: TileData | null) => n !== null && n.type === 'roof'
  if (t.slope.axis === 'y') {
    line(out, 'roof-line', A, B)
    line(out, 'roof-line', D, C)
    if (!isRoof(at(terrain, gx - 1, gy))) line(out, 'roof-line', A, D)
    if (!isRoof(at(terrain, gx + 1, gy))) line(out, 'roof-line', B, C)
  } else {
    line(out, 'roof-line', A, D)
    line(out, 'roof-line', B, C)
    if (!isRoof(at(terrain, gx, gy - 1))) line(out, 'roof-line', A, B)
    if (!isRoof(at(terrain, gx, gy + 1))) line(out, 'roof-line', D, C)
  }
}

// 계단: 계단 단을 나타내는 평행선 (그라데이션 대신)
function stair(terrain: Terrain, v: View, gx: number, gy: number, t: TileData & { type: 'stair' }, out: ReactElement[]) {
  const s = t.slope
  const K = 4
  const hAt = (u: number) => s.a + (s.b - s.a) * u
  const P = (u: number, w: number) => (s.axis === 'x' ? iso(v, gx + u, gy + w, hAt(u)) : iso(v, gx + w, gy + u, hAt(u)))
  out.push(<polygon key={out.length} points={pts([P(0, 0), P(1, 0), P(1, 1), P(0, 1)])} fill={STAIR} stroke={STAIR} strokeWidth={0.6} />)
  const next = s.axis === 'x' ? at(terrain, gx + 1, gy) : at(terrain, gx, gy + 1)
  for (let i = 0; i <= K; i++) {
    if (i === K && next && next.type === 'stair') continue
    line(out, 'step', P(i / K, 0), P(i / K, 1))
  }
}
