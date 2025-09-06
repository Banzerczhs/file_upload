import { defineConfig } from "vite"
import vue from '@vitejs/plugin-vue'
import ElementPlus from "unplugin-element-plus"
import mkcert from "vite-plugin-mkcert"
import viteProxy from "vite-plugin-http2-proxy";

process.env
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    ElementPlus.vite(),
    mkcert(),
    viteProxy({
      '/api' : {
        target : 'https://localhost:7070',
        secure: false,
        rewrite : (path)=>path.replace(/^\/api/,'')
      }
    })
  ],
  server : {
    open : true,
    https : true,
    port : 8080
  }
})
