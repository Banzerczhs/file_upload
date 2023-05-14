import { defineConfig } from "vite"
import vue from '@vitejs/plugin-vue'
import ElementPlus from "unplugin-element-plus"
import mkcert from "vite-plugin-mkcert"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), ElementPlus.vite(),mkcert()],
  server : {
    open : true,
    https : true,
    proxy : {
      '/api' : {
        target : 'https://localhost:7070',
        changeOrigin : true,
        secure : false,
        rewrite : (path)=>path.replace(/^\/api/,'')
      }
    },
    port : 8080
  }
})
