import { Fragment, memo, useMemo, type ReactElement } from 'react'
import { depth, iso, type View } from '../../engine/projection.ts'
import type { Terrain as TerrainData } from '../../engine/terrain.ts'
import { FLOOR_COLORS } from '../../theme/colors.ts'
import { f1 } from '../svg.ts'
import { Chevron, ControlPoint, Track } from './Decor.tsx'
import { lips } from './edges.tsx'
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
  const flat = useMemo(() => flatFloorHeight(terrain), [terrain])
  if (flat !== null) return <FlatFloor terrain={terrain} view={view} h={flat} />

  const order: [number, number, number][] = []
  for (let gy = 0; gy < terrain.d; gy++) {
    for (let gx = 0; gx < terrain.w; gx++) {
      if (terrain.tiles[gy][gx].type !== 'void') order.push([gx, gy, depth(view, gx + 0.5, gy + 0.5)])
    }
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

/** 빈 칸 말고 모두 같은 높이의 1층 바닥이면 그 높이 (실측 맵의 1층 단계, D-073). 아니면 null */
function flatFloorHeight(t: TerrainData): number | null {
  let h: number | null = null
  for (const row of t.tiles) {
    for (const tile of row) {
      if (tile.type === 'void') continue
      if (tile.type !== 'floor' || tile.floor !== 'G' || tile.hA !== tile.hB || tile.hA !== tile.hC || tile.hA !== tile.hD) return null
      if (h === null) h = tile.hA
      else if (h !== tile.hA) return null
    }
  }
  return h
}

// 평평한 1층: 옆면을 먼 칸부터 그린 뒤 윗면을 한 덩어리로 칠한다. 칸마다 칠하면 칸 사이 이음매가 잔무늬로 보여서
function FlatFloor({ terrain, view, h }: Props & { h: number }) {
  const order: [number, number, number][] = []
  let top = ''
  for (let gy = 0; gy < terrain.d; gy++) {
    for (let gx = 0; gx < terrain.w; gx++) {
      if (terrain.tiles[gy][gx].type === 'void') continue
      order.push([gx, gy, depth(view, gx + 0.5, gy + 0.5)])
      const q = [iso(view, gx, gy, h), iso(view, gx + 1, gy, h), iso(view, gx + 1, gy + 1, h), iso(view, gx, gy + 1, h)]
      top += 'M' + q.map(p => f1(p[0]) + ' ' + f1(p[1])).join('L') + 'Z'
    }
  }
  order.sort((a, b) => a[2] - b[2])
  const edges: ReactElement[] = []
  for (const [gx, gy] of order) lips(terrain, view, gx, gy, terrain.tiles[gy][gx], edges)
  return (
    <g data-layer="terrain">
      {order.map(([gx, gy]) => (
        <Tile key={gx + ',' + gy} terrain={terrain} view={view} gx={gx} gy={gy} sidesOnly />
      ))}
      <path d={top} fill={FLOOR_COLORS.G} />
      {edges}
    </g>
  )
}

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
