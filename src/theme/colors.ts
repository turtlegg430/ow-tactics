import type { Floor } from '../data/types.ts'

// 보드 색. 값은 P1 5차 시안 그대로다. 층 색과 낙사 색은 docs/DESIGN.md '층 구분' 표와 같다.
// 계단·구조물·지붕·팀 색은 임시 값이다 (DESIGN.md, 실제 맵·토큰 작업 때 확정)
export const FLOOR_COLORS: Record<Floor, string> = {
  B: '#5b4636',
  G: '#6d8f5a',
  M: '#c1a771',
  U: '#ece4cc',
}
export const STAIR = '#9a9484'
export const STRUCT = '#7f7a73'
export const ROOF = '#56565b'
export const FALL_BG = '#1b1714'
export const FALL_STRIPE = '#d9912b'
/** 낙사 구간 둘레의 절벽 벽 */
export const FALL_WALL = '#2a2420'

/** 팀 색 (아군 파랑, 적 빨강). 층 색에는 쓰지 않는다 */
export const TEAM = { ally: '#3fa9f5', enemy: '#f2464f' }

const hex2rgb = (h: string) => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const rgb2hex = (r: number[]) =>
  '#' + r.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')

/** 색을 f배 어둡게(1보다 작을 때) 또는 밝게(1보다 클 때) */
export const shade = (h: string, f: number) => rgb2hex(hex2rgb(h).map(v => v * f))
