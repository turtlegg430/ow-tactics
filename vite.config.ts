import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages 주소가 https://turtlegg430.github.io/ow-tactics/ 라서 모든 파일 경로 앞에 /ow-tactics/ 를 붙인다
  base: '/ow-tactics/',
  plugins: [react()],
  // Claude 데스크톱 앱 미리보기가 빈 포트를 PORT로 알려 주면 그 포트를 쓴다. 없으면 기본 5173
  server: { port: Number(process.env.PORT) || 5173 },
})
