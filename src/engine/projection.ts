// 맵 좌표(칸 단위 x, y와 층 단위 높이 h)를 화면 좌표(SVG 픽셀)로 바꾼다.
// 맵 중심을 기준으로 돌린 뒤, 비스듬히 내려다본 모습으로 눌러 그린다 (2.5D)

export const TW = 64 // 칸 너비 (픽셀)
export const TH = 32 // 칸 높이 (픽셀)
export const HS = 38 // 한 층 높이 (픽셀)

/** 보는 방향. 회전 중심(cx, cy)과 각도 ang(라디안) */
export interface View {
  cx: number
  cy: number
  ang: number
  cos: number
  sin: number
}

/** 너비 w, 깊이 d인 맵을 deg도 돌려 보는 방향 */
export function makeView(w: number, d: number, deg: number): View {
  const ang = (deg * Math.PI) / 180
  return { cx: w / 2, cy: d / 2, ang, cos: Math.cos(ang), sin: Math.sin(ang) }
}

export function rot(v: View, x: number, y: number): [number, number] {
  const dx = x - v.cx
  const dy = y - v.cy
  return [dx * v.cos - dy * v.sin, dx * v.sin + dy * v.cos]
}

export function iso(v: View, x: number, y: number, h: number): [number, number] {
  const [rx, ry] = rot(v, x, y)
  return [((rx - ry) * TW) / 2, ((rx + ry) * TH) / 2 - h * HS]
}

/** 앞뒤 순서. 클수록 보는 사람에게 가까워서 나중에 그린다 */
export function depth(v: View, x: number, y: number): number {
  const [rx, ry] = rot(v, x, y)
  return rx + ry
}
