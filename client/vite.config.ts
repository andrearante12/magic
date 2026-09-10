import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: Vite on 5173, proxy API + WS to the game server on 3000.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/ws": { target: "ws://localhost:3000", ws: true },
    },
  },
  build: { outDir: "dist", chunkSizeWarningLimit: 1200 },
});
