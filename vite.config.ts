import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages 주소가 https://turtlegg430.github.io/ow-tactics/ 라서 모든 파일 경로 앞에 /ow-tactics/ 를 붙인다
  base: '/ow-tactics/',
  plugins: [react()],
})
