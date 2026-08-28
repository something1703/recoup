import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Recoup Cockpit dev server. Point VITE_TRUEFORGE_BASE_URL at your running TrueForge
// instance (defaults to the local-mode default of http://localhost:8790).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
