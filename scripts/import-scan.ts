// 워크숍 맵 스캐너 v5 CSV → 게임 지형 데이터 (P3 작업 2, D-062~D-064)
// 사용: npm run import-scan -- "<스캔 폴더>"
// 읽기 형식의 기준은 기획 작업 폴더의 scan-decode-reference.py와 tools/workshop/README.md

import fs from 'node:fs'
import path from 'node:path'
import type { ScanTerrain } from '../src/data/types.ts'
import { readPng, type Png } from './png.ts'

/** 왕의 길 A 스캔 설정. 파일 이름은 기획 작업 폴더 '스캔\'에 있는 것 */
const MAP = {
  id: 'kings-row-a',
  csv: ['scan-test-04-a.csv', 'scan-test-04-b.csv', 'scan-test-04-c.csv'],
  /** StatBanana 그림과 맞춤값. 경기 구역 마스크(D-068)와 겹쳐 보기에 쓴다 */
  image: 'kingsrow-A.png',
  fit: 'kingsrow_plain-맞춤값.json',
  out: 'src/data/maps/kings-row-a/terrain.ts',
  /** 층 경계 (m). 초안이며 P3 작업 3에서 사용자가 확정한다 (D-063) */
  floorBounds: { upper: 3.5, high: 10 },
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

/** 경기 구역 마스크: 흰 경계선을 이만큼(px) 두껍게 해서 점선 틈을 막는다 */
const LINE_GROW = 7
/** 바탕으로 번진 덩어리가 경계선에 이 비율 이상 닿아 있어야 진짜 구멍. 그보다 적으면 경기 안의 그림자로 보고 되돌린다 */
const HOLE_LINE_RATIO = 0.3

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

/** 겹쳐 보기에 표시할 확인 대상. 보드 칸 범위 [x0, x1) × [y0, y1) */
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

function toBoard(cells: Cell[], g: ReturnType<typeof merge>): Omit<ScanTerrain, 'play'> {
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

// ---------- 6. 경기 구역 (D-068) ----------

/** 게임 좌표 → StatBanana 그림 픽셀. 맞춤값 규칙: p = k × (−X + iZ) + t, 픽셀 = (p의 실수부, −p의 허수부) */
interface Fit {
  k: [number, number]
  t: [number, number]
}

/**
 * 칸마다 경기 안(i)·밖(o)·그림 밖(?)을 정한다.
 * StatBanana 그림에서 경기 구역 바깥은 어두운 회색 육각 무늬 바탕이고, 경기 구역은 흰 경계선으로 둘러싸여 있다.
 * 바탕색만 이어진 곳을 따라 번진 영역을 경기 밖으로 본다. 흰 선은 넘지 않는다
 */
function playMask(t: Omit<ScanTerrain, 'play'>, img: Png, fit: Fit) {
  const { w, h } = img
  const n = w * h
  const rgb = (i: number) => [img.data[i * img.bpp], img.data[i * img.bpp + 1], img.data[i * img.bpp + 2]]
  // 흰 선을 LINE_GROW만큼 두껍게 (가로로 한 번, 세로로 한 번 번지기)
  const white = new Uint8Array(n)
  for (let i = 0; i < n; i++) if (rgb(i).every(v => v > 200)) white[i] = 1
  const grow = (src: Uint8Array, along: 'x' | 'y') => {
    const dst = new Uint8Array(n)
    const [len, lines, at] = along === 'x' ? [w, h, (l: number, k: number) => l * w + k] : [h, w, (l: number, k: number) => k * w + l]
    for (let l = 0; l < lines; l++) {
      let last = -1e9
      for (let k = 0; k < len; k++) {
        if (src[at(l, k)]) last = k
        if (k - last <= LINE_GROW) dst[at(l, k)] = 1
      }
      last = 1e9
      for (let k = len - 1; k >= 0; k--) {
        if (src[at(l, k)]) last = k
        if (last - k <= LINE_GROW) dst[at(l, k)] = 1
      }
    }
    return dst
  }
  const line = grow(grow(white, 'x'), 'y')
  // 바탕색: rgb 30~48 근처의 무채색
  const bg = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const [r, g, b] = rgb(i)
    if (r >= 30 && r <= 48 && g >= 28 && g <= 46 && b >= 26 && b <= 44 && Math.max(r, g, b) - Math.min(r, g, b) <= 7) bg[i] = 1
  }
  // 11×11이 모두 바탕색인 곳에서 시작해 바탕색을 따라 번진다
  const run = new Uint16Array(n)
  for (let y = 0; y < h; y++) {
    let k = 0
    for (let x = 0; x < w; x++) {
      k = bg[y * w + x] ? k + 1 : 0
      run[y * w + x] = k
    }
  }
  const out = new Uint8Array(n)
  const stack: number[] = []
  for (let y = 10; y < h; y++)
    for (let x = 10; x < w; x++) {
      let ok = true
      for (let dy = 0; dy < 11 && ok; dy++) if (run[(y - dy) * w + x] < 11) ok = false
      const c = (y - 5) * w + x - 5
      if (ok && !out[c] && !line[c]) {
        out[c] = 1
        stack.push(c)
      }
    }
  const step4 = (i: number) => {
    const x = i % w
    return [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < n - w ? i + w : -1]
  }
  while (stack.length) {
    const i = stack.pop()!
    for (const j of step4(i)) {
      if (j >= 0 && !out[j] && !line[j] && bg[j]) {
        out[j] = 1
        stack.push(j)
      }
    }
  }
  // 경기 안의 그림자가 바탕색과 같아서 생긴 작은 '밖' 덩어리를 되돌린다.
  // 그림 가장자리에 닿거나 둘레가 흰 선에 충분히 닿아 있는 덩어리만 진짜 경기 밖으로 남긴다
  const seen = new Uint8Array(n)
  let reverted = 0
  for (let s = 0; s < n; s++) {
    if (!out[s] || seen[s]) continue
    seen[s] = 1
    const comp = [s]
    let edge = false
    let toLine = 0
    let toInside = 0
    for (let q = 0; q < comp.length; q++) {
      const i = comp[q]
      const x = i % w
      if (x === 0 || x === w - 1 || i < w || i >= n - w) edge = true
      for (const j of step4(i)) {
        if (j < 0) continue
        if (out[j]) {
          if (!seen[j]) {
            seen[j] = 1
            comp.push(j)
          }
        } else if (line[j]) toLine++
        else toInside++
      }
    }
    if (!edge && toLine < HOLE_LINE_RATIO * (toLine + toInside)) {
      for (const i of comp) out[i] = 0
      reverted += comp.length
    }
  }
  // 칸 가운데 픽셀로 판정. 흰 선(두껍게 한 것) 위에 있는 칸은 면 덩어리를 나누는 데 쓴다
  const [kr, ki] = fit.k
  const [tr, ti] = fit.t
  const rows: string[] = []
  const onLine = new Uint8Array(t.w * t.d)
  for (let y = 0; y < t.d; y++) {
    let row = ''
    for (let x = 0; x < t.w; x++) {
      const X = t.toGame.originX - (x + 0.5) * t.cell
      const Z = t.toGame.originZ - (y + 0.5) * t.cell
      const px = Math.round(-kr * X - ki * Z + tr)
      const py = Math.round(ki * X - kr * Z - ti)
      const inside = px >= 0 && py >= 0 && px < w && py < h
      row += !inside ? '?' : out[py * w + px] ? 'o' : 'i'
      if (inside && line[py * w + px]) onLine[y * t.w + x] = 1
    }
    rows.push(row)
  }
  return { rows, onLine, revertedPx: reverted }
}

// ---------- 6-2. 면 덩어리와 2층 판정 (D-069) ----------

/** 같은 면으로 이을 높이 차 (m) */
const FLAT_TOL = 0.1
/** 계단으로 이을 한 칸 높이 차 (m) */
const STEP_TOL = 0.6
/** 이보다 작은 위층 덩어리는 자동으로 '2층 아님' (물체 위·벽 위) */
const MIN_REGION_CELLS = 8

/**
 * 면 덩어리의 종류.
 * low = 1층 높이, cand = 2층 후보 (사용자가 판정), stair = 계단,
 * small·thin = 자동으로 2층 아님 (작음, 폭 1m 이하. 물체 위·벽 위·비탈 지붕 조각)
 */
type RegionKind = 'low' | 'cand' | 'stair' | 'small' | 'thin'

interface Region {
  /** 덩어리를 대표하는 칸과 높이. 판정 파일에서 덩어리를 찾는 열쇠 */
  x: number
  y: number
  hq: number
  /** 가운데 높이 (5cm 단위) */
  mid: number
  cells: number
  kind: RegionKind
  /** 위에 다른 면(지붕·위층)이 덮인 칸의 비율 */
  covered: number
}

/** 사용자 판정 파일 (스캔 폴더의 <맵 id>-판정.json) */
interface Labels {
  version: 1
  /** 덩어리 안의 한 칸과 그 높이(5cm 단위)로 덩어리를 가리킨다 */
  regions: { x: number; y: number; hq: number; label: '2층' | '아님' | '계단' }[]
}

/**
 * 경기 안 칸의 밟는 면(높은 곳 경계 아래)을 면 덩어리로 묶는다.
 * 이웃 칸(4방향)의 면끼리 높이 차가 FLAT_TOL 이하면 같은 덩어리. StatBanana 흰 선 위 칸은 건너서 잇지 않는다.
 * nodeRegion[칸]은 그 칸 밟는 면 각각의 덩어리 번호 (밟는 면 순서 = walk 순서)
 */
function buildRegions(t: ScanTerrain, onLine: Uint8Array) {
  const n = t.w * t.d
  const stand: number[][] = []
  for (let c = 0; c < n; c++) {
    const x = c % t.w
    const y = (c - x) / t.w
    stand.push(t.play[y][x] === 'i' ? t.walk[y][x].filter(hq => hq * t.hUnit < t.floorBounds.high) : [])
  }
  // 면 하나 = (칸, 몇 번째 면). 번호를 매겨 합치기(union-find)로 묶는다
  const base: number[] = []
  let total = 0
  for (let c = 0; c < n; c++) {
    base.push(total)
    total += stand[c].length
  }
  const parent = Int32Array.from({ length: total }, (_, i) => i)
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]]
      a = parent[a]
    }
    return a
  }
  const join = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb)
  }
  const flat = Math.round(FLAT_TOL / t.hUnit)
  const near = (c: number, d: number, tol: number, each: (a: number, b: number) => void) => {
    stand[c].forEach((ha, i) => stand[d].forEach((hb, j) => Math.abs(ha - hb) <= tol && each(base[c] + i, base[d] + j)))
  }
  for (let c = 0; c < n; c++) {
    const x = c % t.w
    for (const d of [x < t.w - 1 ? c + 1 : -1, c + t.w < n ? c + t.w : -1]) {
      if (d >= 0 && !onLine[c] && !onLine[d]) near(c, d, flat, join)
    }
  }
  // 흰 선 위 칸은 이웃 중 높이가 맞는 가장 큰 덩어리에 붙인다
  const size = new Map<number, number>()
  for (let i = 0; i < total; i++) size.set(find(i), (size.get(find(i)) ?? 0) + 1)
  for (let c = 0; c < n; c++) {
    if (!onLine[c]) continue
    const x = c % t.w
    stand[c].forEach((h, i) => {
      let best = -1
      for (const d of [x > 0 ? c - 1 : -1, x < t.w - 1 ? c + 1 : -1, c - t.w, c + t.w]) {
        if (d < 0 || d >= n || onLine[d]) continue
        stand[d].forEach((hd, j) => {
          const r = find(base[d] + j)
          if (Math.abs(h - hd) <= flat && (best < 0 || size.get(r)! > size.get(best)!)) best = r
        })
      }
      if (best >= 0) join(base[c] + i, best)
    })
  }

  // 덩어리마다 정보를 모은다
  const id = new Map<number, number>()
  const regions: (Region & { nodes: number[] })[] = []
  const nodeRegion: number[][] = stand.map(s => s.map(() => -1))
  for (let c = 0; c < n; c++) {
    stand[c].forEach((h, i) => {
      const r = find(base[c] + i)
      if (!id.has(r)) {
        id.set(r, regions.length)
        regions.push({ x: c % t.w, y: Math.floor(c / t.w), hq: h, mid: 0, cells: 0, kind: 'low', covered: 0, nodes: [] })
      }
      const k = id.get(r)!
      regions[k].nodes.push(c)
      nodeRegion[c][i] = k
    })
  }
  const upper = Math.round(t.floorBounds.upper / t.hUnit)
  for (const [k, g] of regions.entries()) {
    const hs = g.nodes.map(c => stand[c][nodeRegion[c].indexOf(k)])
    g.mid = median(hs)
    g.cells = g.nodes.length
    g.covered = g.nodes.filter((c, i) => t.top[Math.floor(c / t.w)][c % t.w]! > hs[i] + 2).length / g.cells
    const inRegion = new Set(g.nodes)
    // 한 번 깎아서(4방향 이웃이 모두 덩어리 안인 칸만 남기기) 아무것도 안 남으면 폭 1m 이하
    const core = g.nodes.some(c => [c - 1, c + 1, c - t.w, c + t.w].every(d => inRegion.has(d)))
    g.kind = g.mid < upper ? 'low' : g.cells < MIN_REGION_CELLS ? 'small' : !core ? 'thin' : 'cand'
  }

  // 계단: 큰 덩어리(1층 바닥, 2층 후보)가 아닌 면 중에서, 1층 바닥에서 한 칸에 STEP_TOL 이하로 올라가며 닿고
  // 2층 후보에서 한 칸에 STEP_TOL 이하로 내려가며도 닿는 면. 연석처럼 한쪽에서만 닿는 면은 계단이 아니다
  const big = (k: number) => regions[k].kind === 'cand' || (regions[k].kind === 'low' && regions[k].cells >= MIN_REGION_CELLS * 4)
  const step = Math.round(STEP_TOL / t.hUnit)
  const reach = (from: (k: number) => boolean, up: boolean) => {
    const seen = new Uint8Array(total)
    const queue: number[] = []
    for (let c = 0; c < n; c++) stand[c].forEach((_, i) => from(nodeRegion[c][i]) && queue.push(base[c] + i))
    const cellOf: number[] = []
    for (let c = 0; c < n; c++) stand[c].forEach(() => cellOf.push(c))
    for (let q = 0; q < queue.length; q++) {
      const a = queue[q]
      const c = cellOf[a]
      const ha = stand[c][a - base[c]]
      const x = c % t.w
      for (const d of [x > 0 ? c - 1 : -1, x < t.w - 1 ? c + 1 : -1, c - t.w, c + t.w]) {
        if (d < 0 || d >= n) continue
        stand[d].forEach((hb, j) => {
          const b = base[d] + j
          const rise = up ? hb - ha : ha - hb
          if (!seen[b] && !big(nodeRegion[d][j]) && rise >= -flat && rise <= step) {
            seen[b] = 1
            queue.push(b)
          }
        })
      }
    }
    return seen
  }
  const fromLow = reach(k => big(k) && regions[k].kind === 'low', true)
  const fromHigh = reach(k => regions[k].kind === 'cand', false)
  const stairNodes = new Map<number, number>()
  for (let c = 0; c < n; c++) {
    stand[c].forEach((_, i) => {
      const a = base[c] + i
      if (fromLow[a] && fromHigh[a]) stairNodes.set(nodeRegion[c][i], (stairNodes.get(nodeRegion[c][i]) ?? 0) + 1)
    })
  }
  for (const [k, m] of stairNodes) if (m * 2 >= regions[k].cells && !big(k)) regions[k].kind = 'stair'
  return { regions, nodeRegion, stand }
}

/** 판정 파일의 칸·높이를 덩어리 번호로 바꾼다. 못 찾은 판정은 따로 센다 */
function applyLabels(t: ScanTerrain, built: ReturnType<typeof buildRegions>, labels: Labels | null) {
  const out = new Map<number, Labels['regions'][number]['label']>()
  let lost = 0
  for (const l of labels?.regions ?? []) {
    const c = l.y * t.w + l.x
    const i = built.stand[c]?.findIndex(h => Math.abs(h - l.hq) <= 1) ?? -1
    if (i < 0) lost++
    else out.set(built.nodeRegion[c][i], l.label)
  }
  return { label: out, lost }
}

// ---------- 7. 파일 쓰기 ----------

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
  play: ${rows(t.play)},
}
`
}

// ---------- 8. 보고 ----------

function heightTable(t: ScanTerrain) {
  // 경기 안 칸만 0.5m 칸으로 센다. 맨 위 = 칸마다 가장 높은 설 수 있는 면, 전체 = 아래층 면까지
  const bins = new Map<number, [number, number]>()
  const add = (hq: number, first: boolean) => {
    const y = hq * t.hUnit
    const b = y < -2 ? -2.5 : y >= 12 ? 12 : Math.floor(y * 2) / 2
    const v = bins.get(b) ?? [0, 0]
    if (first) v[0]++
    v[1]++
    bins.set(b, v)
  }
  t.walk.forEach((row, y) => row.forEach((w, x) => t.play[y][x] === 'i' && w.forEach((hq, k) => add(hq, k === 0))))
  const keys = [...bins.keys()].sort((a, b) => a - b)
  const max = Math.max(...keys.map(k => bins.get(k)![0]))
  const label = (b: number) => (b === -2.5 ? '−2m 미만' : b === 12 ? '12m 이상' : `${b.toFixed(1)}~${(b + 0.5).toFixed(1)}m`)
  return keys.map(b => {
    const [first, all] = bins.get(b)!
    return { label: label(b), first, all, bar: '█'.repeat(Math.round((first / max) * 30)), edge: b === t.floorBounds.upper || b === t.floorBounds.high }
  })
}

/** 경기 안 칸의 밟는 면: 설 수 있는 면 중 높은 곳 경계 아래 (D-068) */
const standOf = (t: ScanTerrain, x: number, y: number) => t.walk[y][x].filter(hq => hq * t.hUnit < t.floorBounds.high)

/**
 * 확인 대상: 경기 안인데 밟는 면이 없거나 3개 이상인 칸 덩어리. 큰 것부터.
 * 빈틈 채우기 기준(GAP_MAX_CELLS)보다 큰 덩어리만 번호를 붙이고, 작은 것은 개수만 센다 (벽 끝·경계선 위 칸이 대부분)
 */
function reviewGroups(t: ScanTerrain) {
  const odd = (c: number) => {
    const x = c % t.w
    const y = (c - x) / t.w
    const n = standOf(t, x, y).length
    return t.play[y][x] === 'i' && (n === 0 || n >= 3)
  }
  const all = components(t.w, t.d, odd)
  const small = all.filter(k => k.length <= GAP_MAX_CELLS)
  const groups: Suspect[] = all
    .filter(k => k.length > GAP_MAX_CELLS)
    .sort((a, b) => b.length - a.length)
    .map(k => {
      const xs = k.map(c => c % t.w)
      const ys = k.map(c => Math.floor(c / t.w))
      const none = k.filter((_, i) => standOf(t, xs[i], ys[i]).length === 0).length
      const what = [none && `밟는 면 없음 ${none}칸`, k.length - none && `${t.floorBounds.high}m 아래 면 3개 이상 ${k.length - none}칸`].filter(Boolean).join(', ')
      return { text: what, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs) + 1, y1: Math.max(...ys) + 1 }
    })
  return { groups, smallGroups: small.length, smallCells: small.reduce((a, k) => a + k.length, 0) }
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
for (const f of [MAP.image, MAP.fit]) if (!fs.existsSync(path.join(dir, f))) fail(`${f}가 스캔 폴더에 없음 (경기 구역 마스크에 필요)`)
const fit = JSON.parse(fs.readFileSync(path.join(dir, MAP.fit), 'utf8')) as Fit

const chunks = MAP.csv.map(f => readChunk(dir, f))
const grid = merge(chunks)
const cells = classify(grid)
const seams = seamCheck(cells, grid, chunks)
const fill = fillGaps(cells, grid.nx, grid.nz)
const board = toBoard(cells, grid)
const mask = playMask(board, readPng(path.join(dir, MAP.image)), fit)
const terrain: ScanTerrain = { ...board, play: mask.rows }

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
// 경기 안 칸을 밟는 면 개수로 나눈다. 경기 구역이 그림 가장자리에서 잘린 곳 = 그림 밖 칸과 맞닿은 경기 안 칸
const standCount = { 0: 0, 1: 0, 2: 0, 3: 0 }
let cut = 0
for (let y = 0; y < terrain.d; y++)
  for (let x = 0; x < terrain.w; x++) {
    if (terrain.play[y][x] !== 'i') continue
    standCount[Math.min(3, standOf(terrain, x, y).length) as 0 | 1 | 2 | 3]++
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => terrain.play[y + dy]?.[x + dx] === '?')) cut++
  }
const table = heightTable(terrain)
const review = reviewGroups(terrain)
// 면 덩어리와 사용자 판정 (판정 파일은 겹쳐 보기에서 저장한다)
const built = buildRegions(terrain, mask.onLine)
const labelsName = `${MAP.id}-판정.json`
const labelsPath = path.join(dir, labelsName)
const labelsFile = fs.existsSync(labelsPath) ? (JSON.parse(fs.readFileSync(labelsPath, 'utf8')) as Labels) : null
const applied = applyLabels(terrain, built, labelsFile)
const kinds = (k: RegionKind) => built.regions.filter(r => r.kind === k)
const cands = kinds('cand')
const decided = (l: string) => cands.filter(r => applied.label.get(built.regions.indexOf(r)) === l).length

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
  `경기 구역: 안 ${count(terrain.play, 'i')}칸, 밖 ${count(terrain.play, 'o')}칸, 그림 밖이라 모름 ${count(terrain.play, '?')}칸 (그림자로 잘못 본 ${mask.revertedPx}px은 되돌림)`,
  `경기 안 칸의 밟는 면(${terrain.floorBounds.high}m 아래) 개수: 1개 ${standCount[1]}, 2개(위·아래층) ${standCount[2]}, 없음 ${standCount[0]}, 3개 이상 ${standCount[3]}`,
  `경기 구역이 그림 가장자리에서 잘린 곳 ${cut}칸`,
  '',
  `높이 분포 (경기 안 칸, 0.5m 칸, 경계 초안 ${MAP.floorBounds.upper}m·${MAP.floorBounds.high}m는 ◀ 표시)`,
  '높이            맨 위   전체',
  ...table.map(r => `${r.label.padEnd(14)} ${String(r.first).padStart(6)} ${String(r.all).padStart(6)} ${r.edge ? '◀' : ' '} ${r.bar}`),
  '',
  `면 덩어리 (D-069): 2층 후보 ${cands.length}곳 ${cands.reduce((a, r) => a + r.cells, 0)}칸, 계단 ${kinds('stair').length}곳, 자동으로 2층 아님 ${kinds('small').length + kinds('thin').length}곳 (작음 ${kinds('small').length}, 폭 1m 이하 ${kinds('thin').length})`,
  `판정 파일 ${labelsName}: ${labelsFile ? `판정 ${labelsFile.regions.length}개${applied.lost ? `, 지금 데이터에서 못 찾은 판정 ${applied.lost}개` : ''}. 2층 후보 중 2층 ${decided('2층')}, 아님 ${decided('아님')}, 미정 ${cands.length - decided('2층') - decided('아님')}` : '아직 없음 (겹쳐 보기에서 판정하고 저장하면 생김)'}`,
  '',
  `확인 대상 ${review.groups.length}곳 (경기 안인데 밟는 면이 없거나 3개 이상, ${GAP_MAX_CELLS}칸보다 큰 덩어리). 작은 덩어리 ${review.smallGroups}곳 ${review.smallCells}칸은 번호 없이 색만`,
  ...review.groups.map((s, i) => `${i + 1}. ${s.text}, 보드 x ${s.x0}~${s.x1} y ${s.y0}~${s.y1}`),
  '',
  ...(problems.length ? ['주의', ...problems.map(p => '- ' + p)] : ['주의할 문제 없음']),
  '',
  `지형 데이터: ${MAP.out} (${(Buffer.byteLength(src) / 1024).toFixed(0)}KB)`,
]

// 겹쳐 보기: 스캔 폴더 안 '미리보기'에 쓴다 (저장소에 넣지 않음)
const outDir = path.join(dir, '미리보기')
fs.mkdirSync(outDir, { recursive: true })
const htmlPath = path.join(outDir, `${MAP.id}-겹쳐보기.html`)
const data = JSON.stringify({ terrain, image: '../' + MAP.image, fit: { k: fit.k, t: fit.t }, report: lines.join('\n'), review: review.groups,
  regions: built.regions.map(r => ({ x: r.x, y: r.y, hq: r.hq, mid: r.mid, cells: r.cells, kind: r.kind, covered: r.covered })), nodeRegion: built.nodeRegion, labels: labelsFile?.regions ?? [], labelsName })
const template = fs.readFileSync(path.join(root, 'scripts/scan-preview.html'), 'utf8')
fs.writeFileSync(htmlPath, template.replace('const DATA = __DATA__', () => 'const DATA = ' + data))
lines.push(`겹쳐 보기: ${htmlPath}`)

console.log(lines.join('\n'))
