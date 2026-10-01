// 워크숍 맵 스캐너 v5 CSV → 게임 지형 데이터 (P3 작업 2, D-062~D-064)
// 사용: npm run import-scan -- "<스캔 폴더>"
// 읽기 형식의 기준은 기획 작업 폴더의 scan-decode-reference.py와 tools/workshop/README.md

import fs from 'node:fs'
import path from 'node:path'
import type { ScanTerrain } from '../src/data/types.ts'

/** 왕의 길 A 스캔 설정. 파일 이름은 기획 작업 폴더 '스캔\'에 있는 것 */
const MAP = {
  id: 'kings-row-a',
  csv: ['scan-test-04-a.csv', 'scan-test-04-b.csv', 'scan-test-04-c.csv'],
  /** StatBanana 그림과 맞춤값 (겹쳐 보기 전용) */
  image: 'kingsrow-A.png',
  fit: 'kingsrow_plain-맞춤값.json',
  out: 'src/data/maps/kings-row-a/terrain.ts',
  /** 층 경계 (m). 초안이며 P3 작업 3에서 사용자가 확정한다 (D-063) */
  floorBounds: { upper: 3.5, high: 9 },
}

/** 설 수 있는 면: 법선 y가 이 값 이상이고, 바로 위 면까지 이만큼(m) 비어 있어야 한다 (D-062) */
const MIN_NORMAL = 0.7
const MIN_HEADROOM = 1.8
/** 높이는 5cm 단위 정수로 비교한다. 소수로 빼면 12.6 − 10.8이 1.7999…가 되어 딱 1.8m인 곳이 빠진다 */
const HEADROOM_Q = Math.round(MIN_HEADROOM / 0.05)
/** 빈틈: 설 수 있는 면이 없는 칸 덩어리가 이 칸 수 이하면 이웃 값으로 채운다 */
const GAP_MAX_CELLS = 9
/** 가는 물체(가로등·나무 줄기): 둘레 8칸의 가운데 높이보다 이만큼(m) 솟은 칸 덩어리가 이 칸 수 이하면 채운다 */
const PILLAR_RISE = 1.0
const PILLAR_MAX_CELLS = 2
/** 가는 물체 둘레 8칸 중 이만큼은 위가 트인 비슷한 높이의 바닥이어야 한다 */
const PILLAR_OPEN = 5

/** 플레이어 변수 번호 (스캐너 코드의 variables 순서) */
const PLAYER_VARS = { Step: 4, X0: 5, Z0: 6, NX: 7, NZ: 8, Layers: 19, Temp: 18 }

interface Header {
  x0: number
  z0: number
  step: number
  nx: number
  nz: number
  layers: number
}

interface Chunk {
  file: string
  hdr: Header
  rows: Map<number, number[]>
  restored: number
  dupLines: number
}

/** 맞은 면 하나. 높이 hq는 5cm 단위, 법선 nq는 법선 y × 99 */
interface Surface {
  hq: number
  nq: number
}

interface Cell {
  surf: Surface[]
  /** 설 수 있는 면의 높이 (5cm 단위), 위에서부터 */
  walk: number[]
  filled: boolean
}

/** 겹쳐 보기에 표시할 수상한 곳. 보드 칸 범위 [x0, x1) × [y0, y1) */
interface Suspect {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
}

const root = path.join(import.meta.dirname, '..')
const problems: string[] = []

function fail(msg: string): never {
  console.error('\n문제: ' + msg)
  process.exit(1)
}

// ---------- 1. 조각 CSV 읽기 ----------

function readChunk(dir: string, file: string): Chunk {
  const text = fs.readFileSync(path.join(dir, file), 'utf8')
  if (text.startsWith('variables')) fail(`${file}: 스캔 기록이 아니라 워크숍 코드가 들어 있음 (복사 실패)`)
  let hdr: Header | null = null
  const rows = new Map<number, number[]>()
  let prev = ''
  let restored = 0
  let dupLines = 0
  for (const line of text.split(/\r?\n/)) {
    const p = line.split(',')
    if (p.length < 3) continue
    // 같은 기록이 두 줄씩 들어간다
    if (line === prev) {
      dupLines++
      continue
    }
    prev = line
    const isGlobal = p[1] === 'Global'
    const cell = isGlobal ? p[2] : p[2 + PLAYER_VARS.Temp]
    // 플레이어 대상이면 머리 정보를 변수 칸에서 읽는다
    if (!isGlobal && !hdr) {
      const g = (k: keyof typeof PLAYER_VARS) => Number(p[2 + PLAYER_VARS[k]])
      hdr = { x0: g('X0'), z0: g('Z0'), step: g('Step'), nx: g('NX'), nz: g('NZ'), layers: g('Layers') }
    }
    if (!cell || !cell.startsWith('[') || !cell.endsWith(']')) continue
    const nums = cell
      .slice(1, -1)
      .split(';')
      .map(s => {
        // 게임 욕설 필터가 숫자 속 1488을 ****로 가린다
        if (s.includes('****')) restored++
        const v = Number(s.replace('****', '1488'))
        if (!Number.isFinite(v)) fail(`${file}: 숫자가 아닌 값 '${s}'`)
        return v
      })
    if (nums[0] === -1) {
      const [, x0, z0, step, nx, nz, , , layers] = nums
      hdr = { x0, z0, step, nx, nz, layers }
    } else if (nums[0] >= 0) {
      const j = nums[0]
      const old = rows.get(j)
      if (old && old.join() !== nums.slice(1).join()) problems.push(`${file}: ${j}번 줄이 두 번 나오는데 값이 다름 (뒤의 것을 씀)`)
      rows.set(j, nums.slice(1))
    }
  }
  if (!hdr) fail(`${file}: 머리 정보(X0, Z0 등)를 찾지 못함`)
  const missing: number[] = []
  const bad: number[] = []
  for (let j = 0; j <= hdr.nz; j++) {
    const r = rows.get(j)
    if (!r) missing.push(j)
    else if (r.length !== (hdr.nx + 1) * hdr.layers) bad.push(j)
  }
  if (missing.length || bad.length)
    fail(`${file}: 빠진 줄 ${missing.length}개 (${missing.slice(0, 10).join(', ')}), 길이가 틀린 줄 ${bad.length}개 (${bad.slice(0, 10).join(', ')})`)
  return { file, hdr, rows, restored, dupLines }
}

// ---------- 2. 조각 합치기 (X0 순서로 이어 붙이고 빈 열·겹침 검사) ----------

function merge(chunks: Chunk[]) {
  const [first] = chunks
  for (const c of chunks) {
    for (const k of ['step', 'z0', 'nz', 'layers'] as const)
      if (c.hdr[k] !== first.hdr[k]) fail(`${c.file}: ${k} 값 ${c.hdr[k]}이 ${first.file}의 ${first.hdr[k]}와 다름`)
  }
  const { step, z0, nz, layers } = first.hdr
  const sorted = [...chunks].sort((a, b) => a.hdr.x0 - b.hdr.x0)
  const x0 = sorted[0].hdr.x0
  const last = sorted[sorted.length - 1].hdr
  const nx = Math.round((last.x0 + last.nx * step - x0) / step) + 1
  const nzp = nz + 1
  // codes[(k * nzp + j) * nx + i] = 점 (i, j)의 k번째 층 값
  const codes = new Int32Array(layers * nzp * nx)
  const owner = new Int8Array(nx).fill(-1)
  let overlapCols = 0
  let overlapDiff = 0
  sorted.forEach((c, ci) => {
    const i0 = Math.round((c.hdr.x0 - x0) / step)
    if (Math.abs(i0 * step - (c.hdr.x0 - x0)) > 1e-6) fail(`${c.file}: X0 ${c.hdr.x0}가 격자 간격 ${step}에 맞지 않음`)
    for (let i = 0; i <= c.hdr.nx; i++) {
      const col = i0 + i
      const seen = owner[col] >= 0
      if (seen) overlapCols++
      for (let j = 0; j < nzp; j++) {
        const r = c.rows.get(j)!
        for (let k = 0; k < layers; k++) {
          const v = r[i * layers + k]
          const at = (k * nzp + j) * nx + col
          if (seen) {
            if (codes[at] !== v) overlapDiff++
          } else codes[at] = v
        }
      }
      if (!seen) owner[col] = ci
    }
  })
  const emptyCols = [...owner].map((o, i) => (o < 0 ? i : -1)).filter(i => i >= 0)
  if (emptyCols.length) fail(`조각 사이에 빈 열 ${emptyCols.length}개 (X ${emptyCols.map(i => x0 + i * step).join(', ')})`)
  if (overlapDiff) problems.push(`겹친 열 ${overlapCols}개에서 값이 다른 곳 ${overlapDiff}개 (먼저 읽은 조각 값을 씀)`)
  return { x0, z0, step, nx, nz: nzp, layers, codes, overlapCols }
}

// ---------- 3. 층 값 풀기와 칸 분류 ----------

/** 층 값 c: 0이면 맞은 것 없음. 높이 = (c ÷ 100의 몫 − 1000) ÷ 20 m, 법선 y = (c ÷ 100의 나머지) ÷ 99 */
const decode = (c: number): Surface => ({ hq: Math.floor(c / 100) - 1000, nq: c % 100 })

function classify(g: ReturnType<typeof merge>) {
  const cells: Cell[] = []
  let orderBreaks = 0
  for (let j = 0; j < g.nz; j++) {
    for (let i = 0; i < g.nx; i++) {
      const surf: Surface[] = []
      let ended = false
      for (let k = 0; k < g.layers; k++) {
        const c = g.codes[(k * g.nz + j) * g.nx + i]
        if (c === 0) ended = true
        else if (ended) orderBreaks++
        else surf.push(decode(c))
      }
      const walk = surf
        .filter((s, k) => s.nq / 99 >= MIN_NORMAL && (k === 0 || surf[k - 1].hq - s.hq >= HEADROOM_Q))
        .map(s => s.hq)
      cells.push({ surf, walk, filled: false })
    }
  }
  if (orderBreaks) problems.push(`맞은 것 없음(0) 뒤에 다시 값이 나온 곳 ${orderBreaks}개 (무시함)`)
  return cells
}

// ---------- 4. 빈틈 채우기 ----------

/** mask가 참인 칸을 8방향으로 이은 덩어리들 */
function components(nx: number, nz: number, mask: (i: number) => boolean) {
  const seen = new Uint8Array(nx * nz)
  const out: number[][] = []
  for (let s = 0; s < nx * nz; s++) {
    if (seen[s] || !mask(s)) continue
    seen[s] = 1
    const stack = [s]
    const comp: number[] = []
    while (stack.length) {
      const c = stack.pop()!
      comp.push(c)
      for (const n of neighbors(nx, nz, c)) {
        if (!seen[n] && mask(n)) {
          seen[n] = 1
          stack.push(n)
        }
      }
    }
    out.push(comp)
  }
  return out
}

function neighbors(nx: number, nz: number, c: number) {
  const i = c % nx
  const j = (c - i) / nx
  const out: number[] = []
  for (let dj = -1; dj <= 1; dj++)
    for (let di = -1; di <= 1; di++) {
      if ((di || dj) && i + di >= 0 && i + di < nx && j + dj >= 0 && j + dj < nz) out.push(c + dj * nx + di)
    }
  return out
}

const median = (a: number[]) => [...a].sort((x, y) => x - y)[(a.length - 1) >> 1]

function fillGaps(cells: Cell[], nx: number, nz: number) {
  const hit = (c: number) => cells[c].surf.length > 0
  // 바닥에 못 닿은 점: 맞은 면은 있는데 설 수 있는 면이 없는 작은 덩어리
  const gaps = components(nx, nz, c => hit(c) && cells[c].walk.length === 0).filter(k => k.length <= GAP_MAX_CELLS)
  // 가로등·나무 줄기: 트인 바닥 한가운데 홀로 솟은 작은 덩어리.
  // 둘레 8칸 중 PILLAR_OPEN칸 이상이 위가 트인 바닥이고 높이가 서로 0.3m 안이어야 한다 (건물 가장자리·지붕 잡동사니는 빼려고)
  const raised = (c: number) => {
    if (!hit(c)) return false
    const around = neighbors(nx, nz, c)
      .filter(hit)
      .map(n => cells[n])
    const base = median(around.map(n => n.surf[0].hq))
    const open = around.filter(n => n.walk[0] === n.surf[0].hq && Math.abs(n.surf[0].hq - base) * 0.05 <= 0.3)
    return open.length >= PILLAR_OPEN && (cells[c].surf[0].hq - base) * 0.05 >= PILLAR_RISE
  }
  const pillars = components(nx, nz, raised).filter(k => k.length <= PILLAR_MAX_CELLS)

  const target = new Uint8Array(nx * nz)
  for (const k of gaps) for (const c of k) target[c] = 1
  const gapCells = target.reduce((a, v) => a + v, 0)
  for (const k of pillars) for (const c of k) target[c] = 1
  let pending = [...target.keys()].filter(c => target[c])
  const total = pending.length
  // 가장자리부터 안쪽으로: 이웃 중 멀쩡한(또는 이미 채운) 칸의 가운데 값을 통째로 복사
  while (pending.length) {
    const next: number[] = []
    const copies: [number, number][] = []
    for (const c of pending) {
      const donors = neighbors(nx, nz, c).filter(n => !target[n] && hit(n))
      if (!donors.length) {
        next.push(c)
        continue
      }
      const key = (n: number) => cells[n].walk[0] ?? cells[n].surf[0].hq
      donors.sort((a, b) => key(a) - key(b))
      copies.push([c, donors[(donors.length - 1) >> 1]])
    }
    if (!copies.length) break
    for (const [c, d] of copies) {
      cells[c] = { surf: cells[d].surf, walk: [...cells[d].walk], filled: true }
      target[c] = 0
    }
    pending = next
  }
  if (pending.length) problems.push(`채우지 못한 칸 ${pending.length}개 (둘레에 값이 없음)`)
  return {
    gapCells,
    gapGroups: gaps.length,
    /** 빈틈과 겹치지 않는 것만 */
    pillarCells: total - gapCells,
    pillarGroups: pillars.length,
    filled: total - pending.length,
  }
}

// ---------- 5. 보드 좌표로 바꾸기 ----------

function toBoard(cells: Cell[], g: ReturnType<typeof merge>): ScanTerrain {
  const { upper, high } = MAP.floorBounds
  const floorOf = (c: Cell) => {
    if (!c.surf.length) return '.'
    if (!c.walk.length) return 'X'
    const y = c.walk[0] * 0.05
    return y < upper ? 'G' : y < high ? 'U' : 'H'
  }
  const floor: string[] = []
  const flags: string[] = []
  const top: (number | null)[][] = []
  const topN: (number | null)[][] = []
  const walk: number[][][] = []
  // 위에서 볼 때 +Z가 위, +X가 왼쪽이 되도록 두 축을 뒤집는다
  for (let y = 0; y < g.nz; y++) {
    const j = g.nz - 1 - y
    let fl = ''
    let fg = ''
    const tr: (number | null)[] = []
    const nr: (number | null)[] = []
    const wr: number[][] = []
    for (let x = 0; x < g.nx; x++) {
      const c = cells[j * g.nx + (g.nx - 1 - x)]
      const covered = c.walk.length > 0 && c.surf[0].hq !== c.walk[0]
      fl += floorOf(c)
      fg += covered ? (c.filled ? 'F' : 'c') : c.filled ? 'f' : '.'
      tr.push(c.surf[0]?.hq ?? null)
      nr.push(c.surf[0]?.nq ?? null)
      wr.push(c.walk)
    }
    floor.push(fl)
    flags.push(fg)
    top.push(tr)
    topN.push(nr)
    walk.push(wr)
  }
  const half = g.step / 2
  return {
    id: MAP.id,
    w: g.nx,
    d: g.nz,
    cell: g.step,
    hUnit: 0.05,
    // 보드 점 (0, 0)은 칸 [0, 0]의 바깥 모서리 = 가장 큰 X, Z 점에서 반 칸 더
    toGame: { originX: g.x0 + (g.nx - 1) * g.step + half, originZ: g.z0 + (g.nz - 1) * g.step + half, cell: g.step, flipX: true, flipZ: true },
    floorBounds: MAP.floorBounds,
    floor,
    flags,
    top,
    topN,
    walk,
  }
}

// ---------- 6. 파일 쓰기 ----------

function terrainSource(t: ScanTerrain, csv: string[]) {
  const rows = (a: unknown[]) => '[\n' + a.map(r => '    ' + JSON.stringify(r) + ',\n').join('') + '  ]'
  const obj = (o: object) => '{ ' + Object.entries(o).map(([k, v]) => `${k}: ${v}`).join(', ') + ' }'
  return `// 자동 생성 파일. 손으로 고치지 않는다.
// scripts/import-scan.ts가 워크숍 스캔(${csv.join(', ')})에서 만든다. 형식은 src/data/types.ts의 ScanTerrain
import type { ScanTerrain } from '../../types.ts'

export const terrain: ScanTerrain = {
  id: '${t.id}',
  w: ${t.w},
  d: ${t.d},
  cell: ${t.cell},
  hUnit: ${t.hUnit},
  toGame: ${obj(t.toGame)},
  floorBounds: ${obj(t.floorBounds)},
  floor: ${rows(t.floor)},
  flags: ${rows(t.flags)},
  top: ${rows(t.top)},
  topN: ${rows(t.topN)},
  walk: ${rows(t.walk)},
}
`
}

// ---------- 7. 보고 ----------

function heightTable(t: ScanTerrain) {
  // 0.5m 칸으로 센다. 맨 위 = 칸마다 가장 높은 설 수 있는 면, 전체 = 아래층 면까지
  const bins = new Map<number, [number, number]>()
  const add = (hq: number, first: boolean) => {
    const y = hq * t.hUnit
    const b = y < -2 ? -2.5 : y >= 12 ? 12 : Math.floor(y * 2) / 2
    const v = bins.get(b) ?? [0, 0]
    if (first) v[0]++
    v[1]++
    bins.set(b, v)
  }
  for (const row of t.walk) for (const w of row) w.forEach((hq, k) => add(hq, k === 0))
  const keys = [...bins.keys()].sort((a, b) => a - b)
  const max = Math.max(...keys.map(k => bins.get(k)![0]))
  const label = (b: number) => (b === -2.5 ? '−2m 미만' : b === 12 ? '12m 이상' : `${b.toFixed(1)}~${(b + 0.5).toFixed(1)}m`)
  return keys.map(b => {
    const [first, all] = bins.get(b)!
    return { label: label(b), first, all, bar: '█'.repeat(Math.round((first / max) * 30)), edge: b === t.floorBounds.upper || b === t.floorBounds.high }
  })
}

function findSuspects(t: ScanTerrain): Suspect[] {
  const out: Suspect[] = []
  const at = (c: number) => ({ x: c % t.w, y: Math.floor(c / t.w) })
  const groups = (mask: (x: number, y: number) => boolean, minCells: number, what: (n: number) => string) => {
    for (const k of components(t.w, t.d, c => mask(c % t.w, Math.floor(c / t.w)))) {
      if (k.length < minCells) continue
      const xs = k.map(c => at(c).x)
      const ys = k.map(c => at(c).y)
      out.push({ text: what(k.length), x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs) + 1, y1: Math.max(...ys) + 1 })
    }
  }
  const fl = (x: number, y: number) => t.floor[y][x]
  const w0 = (x: number, y: number) => t.walk[y][x][0]
  groups((x, y) => fl(x, y) === '.', 1, n => `광선에 맞은 것이 없는 곳 ${n}칸 (맵 밖 허공?)`)
  groups((x, y) => w0(x, y) !== undefined && Math.abs(w0(x, y) * t.hUnit + 1) <= 0.1, 20, n => `−1.0m 바닥이 넓게 깔린 곳 ${n}칸 (경기 구역 밖?)`)
  groups((x, y) => fl(x, y) === 'X', GAP_MAX_CELLS + 1, n => `설 수 있는 면이 없는 넓은 곳 ${n}칸 (지붕만 있는 건물·물체)`)
  groups((x, y) => w0(x, y) !== undefined && w0(x, y) * t.hUnit < -1.5, 1, n => `−1.5m보다 낮은 바닥 ${n}칸`)
  groups((x, y) => w0(x, y) !== undefined && w0(x, y) * t.hUnit >= 30, 20, n => `30m 이상 높은 곳 ${n}칸 (건물 꼭대기·맵 밖?)`)
  return out
}

/** 조각 경계에서 이웃 열끼리 맨 위 면 높이가 0.5m 넘게 다른 비율. 경계 양옆 4열의 비율과 비슷하면 이음매가 맞는 것 */
function seamCheck(cells: Cell[], g: ReturnType<typeof merge>, chunks: Chunk[]) {
  const diffRate = (i: number) => {
    let n = 0
    let d = 0
    for (let j = 0; j < g.nz; j++) {
      const a = cells[j * g.nx + i].surf[0]
      const b = cells[j * g.nx + i + 1].surf[0]
      if (!a || !b) continue
      n++
      if (Math.abs(a.hq - b.hq) * 0.05 > 0.5) d++
    }
    return d / n
  }
  const seams = [...chunks]
    .sort((a, b) => a.hdr.x0 - b.hdr.x0)
    .slice(1)
    .map(c => Math.round((c.hdr.x0 - g.x0) / g.step) - 1)
  const near = (s: number) => [-4, -3, -2, -1, 1, 2, 3, 4].map(d => diffRate(s + d))
  return seams.map(i => ({ x: g.x0 + i * g.step, rate: diffRate(i), near: median(near(i)) }))
}

// ---------- 실행 ----------

const dir = process.argv[2]
if (!dir || !fs.existsSync(dir)) fail('스캔 폴더를 알려 줘야 한다. 예: npm run import-scan -- "E:\\...\\스캔"')

const chunks = MAP.csv.map(f => readChunk(dir, f))
const grid = merge(chunks)
const cells = classify(grid)
const seams = seamCheck(cells, grid, chunks)
const fill = fillGaps(cells, grid.nx, grid.nz)
const terrain = toBoard(cells, grid)

const src = terrainSource(terrain, MAP.csv)
const outPath = path.join(root, MAP.out)
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, src)

const count = (s: string[], ch: string) => s.reduce((a, r) => a + r.split(ch).length - 1, 0)
const flagCount = (chs: string) => [...chs].reduce((a, ch) => a + count(terrain.flags, ch), 0)
const restored = chunks.reduce((a, c) => a + c.restored, 0)
const stats = {
  cells: terrain.w * terrain.d,
  noHit: count(terrain.floor, '.'),
  floors: { G: count(terrain.floor, 'G'), U: count(terrain.floor, 'U'), H: count(terrain.floor, 'H'), X: count(terrain.floor, 'X') },
  multiWalk: terrain.walk.reduce((a, r) => a + r.filter(w => w.length > 1).length, 0),
  covered: flagCount('cF'),
  filled: flagCount('fF'),
  restored,
}
const table = heightTable(terrain)
const suspects = findSuspects(terrain)

const lines = [
  `격자 ${terrain.w} × ${terrain.d}칸 (칸 ${terrain.cell}m), 게임 X ${grid.x0}~${grid.x0 + (grid.nx - 1) * grid.step}, Z ${grid.z0}~${grid.z0 + (grid.nz - 1) * grid.step}`,
  `조각: ${chunks.map(c => `${c.file} X0 ${c.hdr.x0} (${c.hdr.nx + 1}열, 1488 복원 ${c.restored}, 중복 줄 ${c.dupLines})`).join(' / ')}`,
  `조각 겹침 ${grid.overlapCols}열, 빈 열 없음. 이음매에서 높이가 0.5m 넘게 다른 비율: ${seams.map(s => `X ${s.x}|${s.x + grid.step} ${(s.rate * 100).toFixed(1)}% (양옆 4열 ${(s.near * 100).toFixed(1)}%)`).join(', ')}`,
  '',
  `칸 수 ${stats.cells} = 1층 ${stats.floors.G} + 2층 ${stats.floors.U} + 높은 곳 ${stats.floors.H} + 설 수 있는 면 없음 ${stats.floors.X} + 맞은 것 없음 ${stats.noHit}`,
  `덮임 칸 ${stats.covered} (가장 높은 설 수 있는 면 위에 다른 면), 설 수 있는 면이 2개 이상인 칸 ${stats.multiWalk}`,
  `채움 ${stats.filled}칸 = 바닥에 못 닿은 점 ${fill.gapCells}칸 (${fill.gapGroups}곳) + 가는 물체 ${fill.pillarCells}칸 (${fill.pillarGroups}곳)`,
  `1488 복원 ${restored}개`,
  '',
  `높이 분포 (0.5m 칸, 경계 초안 ${MAP.floorBounds.upper}m·${MAP.floorBounds.high}m는 ◀ 표시)`,
  '높이            맨 위   전체',
  ...table.map(r => `${r.label.padEnd(14)} ${String(r.first).padStart(6)} ${String(r.all).padStart(6)} ${r.edge ? '◀' : ' '} ${r.bar}`),
  '',
  `수상한 곳 ${suspects.length}개`,
  ...suspects.map(s => `- ${s.text}, 보드 x ${s.x0}~${s.x1} y ${s.y0}~${s.y1}`),
  '',
  ...(problems.length ? ['주의', ...problems.map(p => '- ' + p)] : ['주의할 문제 없음']),
  '',
  `지형 데이터: ${MAP.out} (${(Buffer.byteLength(src) / 1024).toFixed(0)}KB)`,
]

// 겹쳐 보기: 스캔 폴더 안 '미리보기\'에 쓴다 (저장소에 넣지 않음)
const fitPath = path.join(dir, MAP.fit)
if (fs.existsSync(fitPath) && fs.existsSync(path.join(dir, MAP.image))) {
  const fit = JSON.parse(fs.readFileSync(fitPath, 'utf8')) as { k: [number, number]; t: [number, number] }
  const outDir = path.join(dir, '미리보기')
  fs.mkdirSync(outDir, { recursive: true })
  const htmlPath = path.join(outDir, `${MAP.id}-겹쳐보기.html`)
  const data = JSON.stringify({ terrain, image: '../' + MAP.image, fit: { k: fit.k, t: fit.t }, report: lines.join('\n'), suspects })
  const template = fs.readFileSync(path.join(root, 'scripts/scan-preview.html'), 'utf8')
  fs.writeFileSync(htmlPath, template.replace('const DATA = __DATA__', () => 'const DATA = ' + data))
  lines.push(`겹쳐 보기: ${htmlPath}`)
} else lines.push(`겹쳐 보기는 건너뜀 (${MAP.image} 또는 ${MAP.fit} 없음)`)

console.log(lines.join('\n'))
