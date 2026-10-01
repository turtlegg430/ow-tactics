import { useState } from 'react'
import { Board } from './board/Board.tsx'
import { Compass } from './board/Compass.tsx'
import { useRotation } from './board/useRotation.ts'
import { sianDemo } from './data/maps/sian-demo.ts'
import { buildTerrain } from './engine/terrain.ts'
import './App.css'

// 칸 정보는 각도와 상관없어서 처음 한 번만 만든다
const terrain = buildTerrain(sianDemo)

function App() {
  const { angle, settled, rotateBy } = useRotation()
  const [showLabels, setShowLabels] = useState(true)
  return (
    <main className="page">
      <header className="head">
        <h1>오버워치 운영 학습 (가칭)</h1>
        <p>P1 5차 시안의 가상 맵을 옮겨 온 보드예요. 배치는 보이는지 확인하려는 예시예요.</p>
      </header>

      <div className="stage">
        <Board terrain={terrain} angle={angle} showLabels={showLabels} />
      </div>

      <aside className="side">
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
        </section>
      </aside>
    </main>
  )
}

export default App
