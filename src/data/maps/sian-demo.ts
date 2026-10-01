import type { MapData } from '../types.ts'

// P1 5차 시안의 가상 맵 (reference/p1-sian-5.html). 배치와 높이는 보이는지 확인하려는 예시
const FALL = -1.6

export const sianDemo: MapData = {
  id: 'sian-demo',
  name: '시안 가상 맵',
  rows: [
    'UUUUUGGGGMMMMG',
    'UUUUUGGGsMMMMG',
    'UUUUUSSGsMMMMG',
    'UUUUUSSGGMMMMG',
    'UUUUUGGGGGGGGG',
    'GGGGGGGddGWGGG',
    'GGGWGGGddGGGFF',
    'GGGWGBBBBGGGFF',
    'GGGGGBBBBGGGFF',
    'RRRGGBBBBGGGFF',
    'RRRGGBBBBGGGFF',
    'GGGGGGGGGGGGFF',
  ],
  heights: { B: -1, G: 0, M: 0.5, U: 1.3, W: 0.55 },
  slab: -0.22,
  pitBottom: -1.22,
  fall: FALL,
  slopes: [
    { cells: [[5, 2], [5, 3]], axis: 'x', a: 1.3, b: 0.65 },
    { cells: [[6, 2], [6, 3]], axis: 'x', a: 0.65, b: 0 },
    { cells: [[8, 1], [8, 2]], axis: 'x', a: 0, b: 0.5 },
    { cells: [[7, 5], [8, 5]], axis: 'y', a: 0, b: -0.5 },
    { cells: [[7, 6], [8, 6]], axis: 'y', a: -0.5, b: -1 },
    { cells: [[0, 9], [1, 9], [2, 9]], axis: 'y', a: 1.0, b: 1.45, roof: true },
    { cells: [[0, 10], [1, 10], [2, 10]], axis: 'y', a: 1.45, b: 1.0, roof: true },
  ],
  chevrons: [
    { x: 6.0, y: 3.0, axis: 'x', up: -1 },
    { x: 8.5, y: 2.0, axis: 'x', up: 1 },
    { x: 8.0, y: 6.0, axis: 'y', up: -1 },
  ],
  labels: [
    { text: '발코니 (2층)', x: 2.6, y: 3.4, h: 1.3 },
    { text: '측면 단상 (1.5층)', x: 12.2, y: 0.6, h: 0.5 },
    { text: '지하 통로', x: 5.6, y: 8.4, h: -1 },
    { text: '절벽 (낙사)', x: 13.1, y: 9.4, h: FALL },
  ],
  point: { x: 1.6, y: 6.4, r: 0.85, label: '거점 A' },
  track: [[4.5, 5.3], [4.5, 11.7]],
  compass: [
    { from: [0, 0], to: [5, 5], floor: 'U' },
    { from: [9, 0], to: [13, 4], floor: 'M' },
  ],
}
