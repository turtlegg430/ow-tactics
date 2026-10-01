import { Fragment, memo, useMemo, type ReactElement } from 'react'
import { depth, type View } from '../../engine/projection.ts'
import type { Terrain as TerrainData } from '../../engine/terrain.ts'
import { Chevron, ControlPoint, Track } from './Decor.tsx'
import { Tile } from './Tile.tsx'

// 지형 전체. 먼 칸부터 가까운 칸 순서로 그리고(깊이 정렬),
// 바닥 장식(꺾쇠, 거점, 화물 경로)은 겹치는 칸 중 가장 앞 칸을 그린 직후에 그린다.
// memo: 지형과 보는 방향이 그대로면 다시 그리지 않는다. 그래서 각도가 바뀔 때만 다시 계산한다

interface Props {
  terrain: TerrainData
  view: View
}

interface Decor {
  tiles: [number, number][]
  draw: (v: View) => ReactElement
}

export const Terrain = memo(function Terrain({ terrain, view }: Props) {
  const decors = useMemo(() => makeDecors(terrain), [terrain])

  const order: [number, number, number][] = []
  for (let gy = 0; gy < terrain.d; gy++) {
    for (let gx = 0; gx < terrain.w; gx++) order.push([gx, gy, depth(view, gx + 0.5, gy + 0.5)])
  }
  order.sort((a, b) => a[2] - b[2])

  const decorAfter = new Map<string, Decor[]>()
  for (const d of decors) {
    let best = ''
    let bd = -1e9
    for (const [gx, gy] of d.tiles) {
      const dp = depth(view, gx + 0.5, gy + 0.5)
      if (dp > bd) {
        bd = dp
        best = gx + ',' + gy
      }
    }
    if (!decorAfter.has(best)) decorAfter.set(best, [])
    decorAfter.get(best)!.push(d)
  }

  return (
    <g data-layer="terrain">
      {order.map(([gx, gy]) => {
        const key = gx + ',' + gy
        return (
          <Fragment key={key}>
            <Tile terrain={terrain} view={view} gx={gx} gy={gy} />
            {decorAfter.get(key)?.map((d, i) => (
              <Fragment key={i}>{d.draw(view)}</Fragment>
            ))}
          </Fragment>
        )
      })}
    </g>
  )
})

function makeDecors(terrain: TerrainData): Decor[] {
  const { chevrons, point, track } = terrain.map
  // (x0, y0)~(x1, y1) 사각형과 겹치는 칸들
  const tilesUnder = (x0: number, y0: number, x1: number, y1: number) => {
    const out: [number, number][] = []
    for (let gy = Math.max(0, Math.floor(y0)); gy <= Math.min(terrain.d - 1, Math.floor(y1)); gy++) {
      for (let gx = Math.max(0, Math.floor(x0)); gx <= Math.min(terrain.w - 1, Math.floor(x1)); gx++) out.push([gx, gy])
    }
    return out
  }
  const decors: Decor[] = []
  for (const c of chevrons) {
    decors.push({
      tiles: tilesUnder(c.x - 0.6, c.y - 0.6, c.x + 0.6, c.y + 0.6),
      draw: v => <Chevron terrain={terrain} view={v} data={c} />,
    })
  }
  if (point) {
    decors.push({
      tiles: tilesUnder(point.x - point.r, point.y - point.r, point.x + point.r, point.y + point.r),
      draw: v => <ControlPoint terrain={terrain} view={v} data={point} />,
    })
  }
  if (track) {
    const [a, b] = track
    decors.push({
      tiles: tilesUnder(a[0] - 0.2, a[1], b[0] + 0.2, b[1]),
      draw: v => <Track terrain={terrain} view={v} data={track} />,
    })
  }
  return decors
}
