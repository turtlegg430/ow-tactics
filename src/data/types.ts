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

// 스캔 지형 (P3 작업 2, D-062~D-064). 워크숍 스캐너로 잰 높이를 칸마다 담는다.
// scripts/import-scan.ts가 만든다. 2.5D 보드에 어떻게 그릴지는 P3 작업 3에서 정한다

export interface ScanTerrain {
  id: string
  /** 칸 수. 칸 하나 = 스캔 점 하나, 칸 [x, y]는 floor[y][x] */
  w: number
  d: number
  /** 칸 한 변 (m) */
  cell: number
  /** 높이 값 1이 몇 m인지. 높이는 모두 이 단위의 정수다 (0.05면 90 = 4.5m) */
  hUnit: number
  /**
   * 보드 좌표 → 게임 좌표. 보드는 위에서 본 모습 그대로 +Z가 위, +X가 왼쪽이라 두 축이 다 뒤집혀 있다.
   * 보드 점 (x, y)는 게임 X = originX − x × cell, 게임 Z = originZ − y × cell (flip이 false면 −가 +)
   */
  toGame: { originX: number; originZ: number; cell: number; flipX: boolean; flipZ: boolean }
  /** 층을 나눈 경계 높이 (m). upper 이상은 2층, high 이상은 높은 곳. 초안 (D-063) */
  floorBounds: { upper: number; high: number }
  /**
   * 칸마다 한 글자. 가장 높은 설 수 있는 면의 층.
   * G = 1층, U = 2층, H = 높은 곳, X = 설 수 있는 면 없음, . = 광선에 맞은 것 없음
   */
  floor: string[]
  /** 칸마다 한 글자. . = 없음, c = 덮임, f = 채움, F = 덮임 + 채움 */
  flags: string[]
  /** 맨 위 면(위에서 보이는 면)의 높이. 맞은 것 없으면 null */
  top: (number | null)[][]
  /** 맨 위 면의 법선 y × 99 (99 = 평평, 0 = 수직) */
  topN: (number | null)[][]
  /** 칸마다 설 수 있는 면의 높이 목록. 위에서부터 */
  walk: number[][][]
  /**
   * 칸마다 한 글자. 경기 구역 (D-068). i = 경기 안, o = 경기 밖, ? = StatBanana 그림 밖이라 모름.
   * 경기 안 칸의 밟는 면은 설 수 있는 면 중 floorBounds.high 아래인 것이다. 그 위는 길·방 위의 건물·지붕으로 본다
   */
  play: string[]
}
