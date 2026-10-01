import { memo } from 'react'
import { iso, type View } from '../../engine/projection.ts'
import { heightAt, type Terrain } from '../../engine/terrain.ts'
import { f1 } from '../svg.ts'

// 지명 이름표와 거점 이름. 지형 위에 따로 한 층으로 그려서 켜고 끌 수 있다

interface Props {
  terrain: Terrain
  view: View
}

export const MapLabels = memo(function MapLabels({ terrain, view: v }: Props) {
  const { labels, point } = terrain.map
  const pp = point && iso(v, point.x, point.y, heightAt(terrain, point.x, point.y))
  return (
    <g className="maplabels">
      {labels.map(lb => {
        const p = iso(v, lb.x, lb.y, lb.h)
        return (
          <text key={lb.text} className="maplabel" x={f1(p[0])} y={f1(p[1])}>
            {lb.text}
          </text>
        )
      })}
      {point && pp && (
        <text className="maplabel" x={f1(pp[0])} y={f1(pp[1] + 4)}>
          {point.label}
        </text>
      )}
    </g>
  )
})
