// SVG 좌표 글자 만들기. 소수 첫째 자리까지만 적는다

export const f1 = (v: number) => v.toFixed(1)

export const pts = (a: [number, number][]) => a.map(p => f1(p[0]) + ',' + f1(p[1])).join(' ')
