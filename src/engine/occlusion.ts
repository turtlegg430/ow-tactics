import { HS, TH, rot, type View } from './projection.ts'
import { at, heightAt, type Terrain } from './terrain.ts'

// 가려진 영웅 찾기 (D-023, 쓰는 건 P3 작업 4).
// 영웅 몸 아래에서 보는 사람 쪽으로 선을 쏴서, 그 선을 가로막는 지형이 있으면 가려진 것

// 계산 결과를 지형마다, 각도마다 기억해 둔다. 같은 입력이면 결과가 같아서 기억해도 순수 함수처럼 쓸 수 있다.
// 회전 중에는 각도가 매 프레임 바뀌므로 최근 각도 몇 개만 남긴다
const MAX_ANGLES = 8
const MAX_ENTRIES = 6000
const caches = new WeakMap<Terrain, Map<string, Map<string, boolean>>>()

function cacheFor(t: Terrain, v: View): Map<string, boolean> {
  let byAngle = caches.get(t)
  if (!byAngle) caches.set(t, (byAngle = new Map()))
  const key = v.ang.toFixed(4)
  let cache = byAngle.get(key)
  if (!cache) {
    if (byAngle.size >= MAX_ANGLES) byAngle.delete(byAngle.keys().next().value!)
    byAngle.set(key, (cache = new Map()))
  }
  if (cache.size > MAX_ENTRIES) cache.clear()
  return cache
}

/** (x, y)에서 air만큼 떠 있는 대상이 앞 지형에 가려졌는지 */
export function isOccluded(t: Terrain, v: View, x: number, y: number, air = 0): boolean {
  const cache = cacheFor(t, v)
  const key = x.toFixed(2) + ',' + y.toFixed(2) + ',' + air.toFixed(2)
  const hit = cache.get(key)
  if (hit !== undefined) return hit

  const gx = Math.floor(x)
  const gy = Math.floor(y)
  const h0 = heightAt(t, x, y) + 0.03 + air
  const [rx0, ry0] = rot(v, x, y)
  let res = false
  for (let k = 1; k < 500; k++) {
    const tt = k * 0.06
    const rx = rx0 + tt / 2
    const ry = ry0 + tt / 2
    const h = h0 + (tt * TH) / (2 * HS)
    if (h > 2.2) break
    // 돌린 좌표를 맵 좌표로 되돌린다
    const X = rx * v.cos + ry * v.sin + v.cx
    const Y = -rx * v.sin + ry * v.cos + v.cy
    if (X < 0 || Y < 0 || X >= t.w || Y >= t.d) break
    const tx = Math.floor(X)
    const ty = Math.floor(Y)
    if (tx === gx && ty === gy) continue
    if (h < heightAt(t, X, Y) - 0.01 && h > at(t, tx, ty)!.bot) {
      res = true
      break
    }
  }
  cache.set(key, res)
  return res
}
