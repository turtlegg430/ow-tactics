import type { ReactElement } from 'react'
import { iso, type View } from '../../engine/projection.ts'
import { at, type Terrain, type Tile as TileData } from '../../engine/terrain.ts'
import { f1 } from '../svg.ts'

// 칸 가장자리 선: 지붕·계단 선과 턱 선. Tile과 평평한 1층(FlatFloor)이 같이 쓴다

export const line = (out: ReactElement[], className: string, a: [number, number], b: [number, number]) =>
  out.push(<line key={out.length} className={className} x1={f1(a[0])} y1={f1(a[1])} x2={f1(b[0])} y2={f1(b[1])} />)

// 턱 선: 이웃 칸이 LIP 이상 낮은 가장자리에 밝은 선. 실측 맵의 몇 cm 차이에는 긋지 않는다
const LIP = 0.2
export function lips(terrain: Terrain, v: View, gx: number, gy: number, t: TileData, out: ReactElement[]) {
  const h = t.hA
  const edges: [TileData | null, (n: TileData) => number, [number, number], [number, number]][] = [
    [at(terrain, gx, gy - 1), n => Math.min(n.hD, n.hC), [gx, gy], [gx + 1, gy]],
    [at(terrain, gx + 1, gy), n => Math.min(n.hA, n.hD), [gx + 1, gy], [gx + 1, gy + 1]],
    [at(terrain, gx, gy + 1), n => Math.min(n.hA, n.hB), [gx + 1, gy + 1], [gx, gy + 1]],
    [at(terrain, gx - 1, gy), n => Math.min(n.hB, n.hC), [gx, gy + 1], [gx, gy]],
  ]
  for (const [n, f, p, q] of edges) {
    if (!n || f(n) < h - LIP) line(out, 'lip', iso(v, p[0], p[1], h), iso(v, q[0], q[1], h))
  }
}
