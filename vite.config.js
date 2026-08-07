import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: "/sketch-classifier/",
  define: {
    // Stamped at build time; busts the browser cache of the model files
    // (which live in public/ and are not content-hashed by Vite).
    __BUILD_ID__: JSON.stringify(Date.now().toString(36)),
  },
});
