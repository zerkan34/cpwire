import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En dev, /api est redirigé vers le backend (port 4000).
// En prod, définis VITE_API_BASE pour pointer vers l'URL de ton API déployée.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
});
