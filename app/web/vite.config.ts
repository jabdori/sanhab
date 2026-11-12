import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 개발 서버(npm run dev)는 /api를 띄워 둔 앱으로 넘긴다: API=http://localhost:31NN npm run dev
  server: { proxy: { '/api': process.env.API ?? 'http://localhost:3000' } },
  build: {
    // 서버가 파일을 이름으로 포함하므로(app/src/main.rs) 이름을 고정한다
    cssCodeSplit: false,
    // 한 파일로 묶는다(astryx의 지연 불러오기 조각도 app.js에 넣는다. 서버는 app.js 하나만 낸다)
    rollupOptions: { output: { inlineDynamicImports: true, entryFileNames: 'assets/app.js', assetFileNames: (a) => (a.names[0]?.endsWith('.css') ? 'assets/app.css' : 'assets/[name][extname]') } },
  },
})
