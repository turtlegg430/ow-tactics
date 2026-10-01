import type { Floor, MapData, Slope } from '../data/types.ts'

// 맵 데이터에서 칸 정보를 만든다. 각도와 상관없어서 맵마다 한 번만 만든다

interface TileBase {
  /** 네 모서리 높이. A = (x, y), B = (x+1, y), C = (x+1, y+1), D = (x, y+1) */
  hA: number
  hB: number
  hC: number
  hD: number
  /** 옆면이 내려가는 밑면 높이 */
  bot: number
  /** 낙사 구간 둘레 칸. 옆면이 절벽처럼 어둡게 내려간다 */
  fallRing: boolean
}

export type Tile = TileBase &
  (
    | { type: 'floor'; floor: Floor }
    | { type: 'stair'; slope: Slope }
    | { type: 'roof'; slope: Slope }
    | { type: 'fall' }
    | { type: 'struct' }
  )

export interface Terrain {
  map: MapData
  w: number
  d: number
  /** tiles[gy][gx] */
  tiles: Tile[][]
}

const isFloor = (c: string): c is Floor => c === 'B' || c === 'G' || c === 'M' || c === 'U'

export function buildTerrain(map: MapData): Terrain {
  const d = map.rows.length
  const w = map.rows[0].length
  const slopeAt = new Map<string, Slope>()
  for (const s of map.slopes) for (const [gx, gy] of s.cells) slopeAt.set(gx + ',' + gy, s)

  const tiles: Tile[][] = []
  for (let gy = 0; gy < d; gy++) {
    const row: Tile[] = []
    for (let gx = 0; gx < w; gx++) {
      const s = slopeAt.get(gx + ',' + gy)
      const c = map.rows[gy][gx]
      const flat = (h: number) => ({ hA: h, hB: h, hC: h, hD: h, bot: map.slab, fallRing: false })
      if (s) {
        const [hA, hB, hC, hD] = s.axis === 'x' ? [s.a, s.b, s.b, s.a] : [s.a, s.a, s.b, s.b]
        row.push({ type: s.roof ? 'roof' : 'stair', slope: s, hA, hB, hC, hD, bot: map.slab, fallRing: false })
      } else if (c === 'F') row.push({ type: 'fall', ...flat(map.fall) })
      else if (c === 'W') row.push({ type: 'struct', ...flat(map.heights.W) })
      else if (isFloor(c)) row.push({ type: 'floor', floor: c, ...flat(map.heights[c]) })
      else throw new Error(`${map.id}: (${gx}, ${gy}) 칸의 '${c}'를 알 수 없음 (계단·지붕이면 slopes에 넣어야 함)`)
    }
    tiles.push(row)
  }
  const terrain = { map, w, d, tiles }

  // 밑면: 1층은 얇은 판. 지하와 그 둘레는 아래로 튀어나온 상자. 낙사 둘레는 절벽
  for (let gy = 0; gy < d; gy++) {
    for (let gx = 0; gx < w; gx++) {
      const t = tiles[gy][gx]
      if (t.type === 'fall') {
        t.bot = map.fall
        continue
      }
      let down = isDown(t)
      let nearFall = false
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const n = at(terrain, gx + dx, gy + dy)
          if (isDown(n)) down = true
          if (n && n.type === 'fall') nearFall = true
        }
      }
      if (down) t.bot = map.pitBottom
      else if (nearFall) {
        t.bot = map.fall
        t.fallRing = true
      }
    }
  }
  return terrain
}

/** (gx, gy) 칸. 맵 밖이면 null */
export function at(t: Terrain, gx: number, gy: number): Tile | null {
  return gx < 0 || gy < 0 || gx >= t.w || gy >= t.d ? null : t.tiles[gy][gx]
}

/** 1층보다 아래로 내려가는 칸 (지하, 지하로 내려가는 계단) */
export function isDown(t: Tile | null): boolean {
  if (!t) return false
  if (t.type === 'floor') return t.floor === 'B'
  return t.type === 'stair' && Math.min(t.hA, t.hB, t.hC, t.hD) < -1e-6
}

/** (x, y) 지점의 바닥 높이. 계단·지붕은 기울기를 따라 */
export function heightAt(t: Terrain, x: number, y: number): number {
  const gx = Math.min(t.w - 1, Math.max(0, Math.floor(x)))
  const gy = Math.min(t.d - 1, Math.max(0, Math.floor(y)))
  const tile = t.tiles[gy][gx]
  if (tile.type === 'stair' || tile.type === 'roof') {
    const s = tile.slope
    const u = s.axis === 'x' ? x - gx : y - gy
    return s.a + (s.b - s.a) * u
  }
  return tile.hA
}

/** 맵에서 가장 낮은 밑면과 가장 높은 윗면 [낮은, 높은] */
export function heightRange(t: Terrain): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (const row of t.tiles) {
    for (const tile of row) {
      lo = Math.min(lo, tile.bot)
      hi = Math.max(hi, tile.hA, tile.hB, tile.hC, tile.hD)
    }
  }
  return [lo, hi]
}
