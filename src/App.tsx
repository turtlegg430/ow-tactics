import { useMemo, useState } from 'react'
import { Board } from './board/Board.tsx'
import { Compass } from './board/Compass.tsx'
import { useRotation } from './board/useRotation.ts'
import { floor as kingsRowAFloor } from './data/maps/kings-row-a/floor.ts'
import { walls as kingsRowAWalls } from './data/maps/kings-row-a/walls.ts'
import { sianDemo } from './data/maps/sian-demo.ts'
import { buildTerrain } from './engine/terrain.ts'
import './App.css'

const MAPS = [
  { map: sianDemo, note: 'P1 5차 시안의 가상 맵을 옮겨 온 보드예요. 배치는 보이는지 확인하려는 예시예요.' },
  { map: kingsRowAFloor, note: '왕의 길 A의 1층 바닥만 1m 칸으로 그린 첫 단계예요 (D-072). 벽·건물과 2층은 다음 단계에서 올라가요.' },
  { map: kingsRowAWalls, note: '왕의 길 A의 1층에 벽 스캔으로 벽을 세운 단계예요 (D-072 6단계). 벽 높이는 실제 크기라 높아요. 안쪽은 "벽 반투명"으로 보세요. 2층은 다음 단계에서 정해요.' },
]

function App() {
  const { angle, settled, rotateBy } = useRotation()
  const [showLabels, setShowLabels] = useState(true)
  const [ghostWalls, setGhostWalls] = useState(false)
  const [mapIndex, setMapIndex] = useState(0)
  // 칸 정보는 각도와 상관없어서 맵마다 한 번만 만든다
  const terrain = useMemo(() => buildTerrain(MAPS[mapIndex].map), [mapIndex])
  return (
    <main className="page">
      <header className="head">
        <h1>오버워치 운영 학습 (가칭)</h1>
        <p>{MAPS[mapIndex].note}</p>
      </header>

      <div className="stage">
        <Board terrain={terrain} angle={angle} showLabels={showLabels} ghostWalls={ghostWalls} />
      </div>

      <aside className="side">
        <section>
          <h2>맵</h2>
          <select className="mapsel" value={mapIndex} onChange={e => setMapIndex(Number(e.target.value))}>
            {MAPS.map((m, i) => (
              <option key={m.map.id} value={i}>
                {m.map.name}
              </option>
            ))}
          </select>
        </section>
        <section>
          <h2>시점</h2>
          <div className="rotbtns">
            <button type="button" onClick={() => rotateBy(-90)}>
              ⟲ 왼쪽으로 90°
            </button>
            <button type="button" onClick={() => rotateBy(90)}>
              ⟳ 오른쪽으로 90°
            </button>
          </div>
          <Compass terrain={terrain} angle={angle} settled={settled} />
        </section>
        <section>
          <h2>보기 옵션</h2>
          <label className="opt">
            <input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} />
            <span>지역 이름</span>
          </label>
          <label className="opt">
            <input type="checkbox" checked={ghostWalls} onChange={e => setGhostWalls(e.target.checked)} />
            <span>벽 반투명</span>
          </label>
        </section>
      </aside>
    </main>
  )
}

export default App
