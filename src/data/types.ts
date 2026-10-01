// 맵 데이터 형식 (D-057, D-058). 좌표는 칸 단위이고 맵 왼쪽 위 모서리가 [0, 0], 높이는 층 단위

/** 층. B = 지하, G = 1층, M = 1.5층, U = 2층 (DESIGN.md '층 구분') */
export type Floor = 'B' | 'G' | 'M' | 'U'

/** 맵 위의 점 [x, y] */
export type Pt = [number, number]

/** 경사면 (계단·지붕). axis 방향으로 좌표가 작은 쪽 끝 높이가 a, 큰 쪽 끝 높이가 b */
export interface Slope {
  cells: Pt[]
  axis: 'x' | 'y'
  a: number
  b: number
  roof?: boolean
}

/** 계단 꺾쇠. 계단 중심, 오르내리는 축, 오르는 방향(+1이면 좌표가 커지는 쪽) */
export interface Chevron {
  x: number
  y: number
  axis: 'x' | 'y'
  up: 1 | -1
}

/** 지명 이름표. h는 글자를 띄울 높이 */
export interface MapLabel {
  text: string
  x: number
  y: number
  h: number
}

export interface ControlPoint {
  x: number
  y: number
  r: number
  label: string
}

/** 방향 표시에 칠하는 기준 구역. from~to 사각형을 그 층 색으로 */
export interface CompassZone {
  from: Pt
  to: Pt
  floor: Floor
}

export interface MapData {
  id: string
  name: string
  /**
   * 한 글자 = 한 칸, 한 줄 = 한 행. U·M·G·B = 층, F = 낙사, W = 벽·엄폐물.
   * 계단(S, s, d)과 지붕(R)은 알아보기 위한 글자이고 높이는 slopes에서 정한다
   */
  rows: string[]
  /** 층과 벽 윗면 높이. 맵마다 다르다 (D-019) */
  heights: Record<Floor | 'W', number>
  /** 1층 바닥판 밑면 */
  slab: number
  /** 지하 상자 밑면 */
  pitBottom: number
  /** 낙사 표시면 */
  fall: number
  slopes: Slope[]
  chevrons: Chevron[]
  labels: MapLabel[]
  point?: ControlPoint
  /** 화물 경로 [시작, 끝] */
  track?: [Pt, Pt]
  compass: CompassZone[]
  /** 실측 맵의 단위: 칸 한 변과 높이 1이 각각 몇 m인지 (P3 작업 2에서 채움) */
  scale?: {
    cellMeters: number
    heightMeters: number
  }
}
