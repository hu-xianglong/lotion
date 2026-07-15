import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Use relative asset paths so the built `index.html` loads
  // correctly when Electron points `loadFile()` at the local file://
  // URL. Without this, Vite emits `/assets/…` which resolves to the
  // filesystem root under file:// and 404s into a blank window.
  base: "./",
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        "**/.scratch/**",
        "**/dist/**",
        "**/dist-electron/**"
      ]
    }
  }
});
