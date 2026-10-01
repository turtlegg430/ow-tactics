import { iso, makeView } from '../engine/projection.ts'
import type { Terrain } from '../engine/terrain.ts'
import { FLOOR_COLORS } from '../theme/colors.ts'
import { pts } from './svg.ts'

// 방향 표시: 맵 윤곽과 기준 구역을 작게 그려 보드와 같이 돌리고, 옆에 각도 문구를 둔다

const ANGLE_TEXT: Record<number, string> = {
  0: '기본 시점',
  90: '오른쪽으로 90° 돌림',
  180: '반대편에서 봄',
  270: '왼쪽으로 90° 돌림',
}
const K = 0.075 // 줄이는 배율. 시안 맵 크기에 맞춘 값 (viewBox와 함께)

interface Props {
  terrain: Terrain
  angle: number
  /** 다 돌아간 각도. 문구는 회전이 끝난 뒤에 바뀐다 */
  settled: number
}

export function Compass({ terrain, angle, settled }: Props) {
  const v = makeView(terrain.w, terrain.d, angle)
  const P = (x: number, y: number): [number, number] => {
    const p = iso(v, x, y, 0)
    return [p[0] * K, p[1] * K]
  }
  const rect = (x0: number, y0: number, x1: number, y1: number) => pts([P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)])
  return (
    <div className="compass">
      <svg viewBox="-35 -23 70 46" aria-hidden="true">
        <polygon points={rect(0, 0, terrain.w, terrain.d)} fill={FLOOR_COLORS.G} stroke="currentColor" strokeWidth={0.8} />
        {terrain.map.compass.map((z, i) => (
          <polygon key={i} points={rect(z.from[0], z.from[1], z.to[0], z.to[1])} fill={FLOOR_COLORS[z.floor]} />
        ))}
      </svg>
      <span>{ANGLE_TEXT[((settled % 360) + 360) % 360]}</span>
    </div>
  )
}
