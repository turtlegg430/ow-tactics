import { useMemo } from 'react'
import { iso, makeView } from '../engine/projection.ts'
import { heightRange, type Terrain as TerrainData } from '../engine/terrain.ts'
import { FALL_BG, FALL_STRIPE } from '../theme/colors.ts'
import { f1 } from './svg.ts'
import { MapLabels } from './terrain/MapLabels.tsx'
import { Terrain } from './terrain/Terrain.tsx'
import './board.css'

// 전술 보드 (SVG, 16:9). 받은 각도로 그리기만 한다. 회전 애니메이션은 useRotation이 각도를 바꿔 준다

interface Props {
  terrain: TerrainData
  /** 보는 각도 (도). 0 = 기본 시점, 90 = 오른쪽으로 돌림 */
  angle: number
  showLabels: boolean
}

export function Board({ terrain, angle, showLabels }: Props) {
  const viewBox = useMemo(() => fitView(terrain), [terrain])
  const view = useMemo(() => makeView(terrain.w, terrain.d, angle), [terrain, angle])
  return (
    <div className="frame">
      <svg
        className={showLabels ? 'board' : 'board labels-off'}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={'비스듬히 내려다본 2.5D 전술 보드: ' + terrain.map.name}
      >
        <defs>
          <pattern id="hatchFall" patternUnits="userSpaceOnUse" width="11" height="11" patternTransform="rotate(-45)">
            <rect width="11" height="11" fill={FALL_BG} />
            <rect width="4" height="11" fill={FALL_STRIPE} />
          </pattern>
          <linearGradient id="fadeDark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity=".85" />
          </linearGradient>
        </defs>
        <Terrain terrain={terrain} view={view} />
        <MapLabels terrain={terrain} view={view} />
        {/* 작업 4~5에서 채울 층. 아래에서 위로: 바닥 효과, 그림자, 영웅·시체·화물(깊이 정렬), 위 효과, 맨 위 효과 */}
        <g data-layer="fxGround" />
        <g data-layer="shadows" />
        <g data-layer="zlayer" />
        <g data-layer="fxTop" />
        <g data-layer="fxOver" />
      </svg>
    </div>
  )
}

// 화면 맞춤: 어느 각도로 돌려도 맵이 다 들어오는 16:9 viewBox 하나를 정해서, 돌릴 때 크기가 바뀌지 않게 한다.
// 시안은 토큰 자리도 넣어 계산했지만 시안 맵에서는 결과가 같다 (토큰은 작업 4)
function fitView(t: TerrainData): string {
  const [lo, hi] = heightRange(t)
  let x0 = 1e9
  let x1 = -1e9
  let y0 = 1e9
  let y1 = -1e9
  for (let a = 0; a < 360; a += 15) {
    const v = makeView(t.w, t.d, a)
    for (const [x, y] of [[0, 0], [t.w, 0], [t.w, t.d], [0, t.d]]) {
      for (const h of [hi, lo]) {
        const p = iso(v, x, y, h)
        x0 = Math.min(x0, p[0])
        x1 = Math.max(x1, p[0])
        y0 = Math.min(y0, p[1])
        y1 = Math.max(y1, p[1])
      }
    }
  }
  const cw = x1 - x0
  const ch = y1 - y0
  const topF = 0.12
  const botF = 0.12
  let vh = ch / (1 - topF - botF)
  let vw = (vh * 16) / 9
  if (vw < cw * 1.04) {
    vw = cw * 1.04
    vh = (vw * 9) / 16
  }
  const vx = (x0 + x1) / 2 - vw / 2
  const vy = y0 - vh * topF - (vh * (1 - topF - botF) - ch) / 2
  return `${f1(vx)} ${f1(vy)} ${f1(vw)} ${f1(vh)}`
}
