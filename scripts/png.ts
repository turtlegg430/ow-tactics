// PNG 그림 읽기·쓰기. 경기 구역 마스크를 만들려고 StatBanana 그림의 픽셀을 읽고, 비교 그림을 쓴다.
// 새 패키지 없이 Node에 들어 있는 zlib(압축·압축 풀기)만 쓴다. 8비트, 비월 없는 PNG만 읽고, RGB PNG로 쓴다

import fs from 'node:fs'
import zlib from 'node:zlib'

export interface Png {
  w: number
  h: number
  /** 픽셀 하나의 바이트 수 (RGB 3, RGBA 4) */
  bpp: number
  /** 왼쪽 위부터 한 줄씩. 픽셀 (x, y)의 빨강은 data[(y × w + x) × bpp] */
  data: Buffer
}

export function readPng(file: string): Png {
  const b = fs.readFileSync(file)
  let p = 8
  let w = 0
  let h = 0
  let bpp = 0
  const idat: Buffer[] = []
  while (p < b.length) {
    const len = b.readUInt32BE(p)
    const type = b.toString('ascii', p + 4, p + 8)
    const d = b.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') {
      w = d.readUInt32BE(0)
      h = d.readUInt32BE(4)
      const colorType = d[9]
      if (d[8] !== 8 || d[12] !== 0) throw new Error(`${file}: 8비트·비월 없는 PNG만 읽을 수 있음`)
      bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType as 0 | 2 | 4 | 6]
      if (!bpp) throw new Error(`${file}: 읽을 수 없는 색 형식 ${colorType}`)
    } else if (type === 'IDAT') idat.push(d)
    p += 12 + len
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = w * bpp
  const data = Buffer.alloc(h * stride)
  // 줄마다 앞의 한 바이트가 필터 종류. 왼쪽(a)·위(up)·왼쪽 위(c) 값으로 원래 값을 되살린다
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)]
    const src = y * (stride + 1) + 1
    const dst = y * stride
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? data[dst + x - bpp] : 0
      const up = y ? data[dst - stride + x] : 0
      const c = y && x >= bpp ? data[dst - stride + x - bpp] : 0
      let v = raw[src + x]
      if (filter === 1) v += a
      else if (filter === 2) v += up
      else if (filter === 3) v += (a + up) >> 1
      else if (filter === 4) {
        const pp = a + up - c
        const pa = Math.abs(pp - a)
        const pb = Math.abs(pp - up)
        const pc = Math.abs(pp - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c
      }
      data[dst + x] = v & 255
    }
  }
  return { w, h, bpp, data }
}

// PNG 쓰기 (8비트 RGB). 겹쳐 보기 비교 그림을 만들 때 쓴다
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf: Buffer) {
  let c = 0xffffffff
  for (const v of buf) c = crcTable[(c ^ v) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** rgb: 왼쪽 위부터 한 줄씩, 픽셀마다 3바이트 */
export function writePng(file: string, w: number, h: number, rgb: Buffer) {
  const raw = Buffer.alloc(h * (w * 3 + 1))
  for (let y = 0; y < h; y++) rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3)
  const head = Buffer.alloc(13)
  head.writeUInt32BE(w, 0)
  head.writeUInt32BE(h, 4)
  head[8] = 8
  head[9] = 2
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
}
