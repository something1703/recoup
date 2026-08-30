import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Recoup Cockpit dev server. Point VITE_TRUEFORGE_BASE_URL at your running TrueForge
// instance (defaults to the local-mode default of http://localhost:8790).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  resolve: {
    // The trueforge-ui troubleshooting guide's prescribed fix for duplicate
    // React/assistant-ui copies, which cause useSyncExternalStore infinite
    // loops ("Maximum update depth exceeded... getSnapshot should be cached")
    // and AuiProvider errors — these packages must resolve to exactly one
    // copy in the bundle.
    dedupe: ["react", "react-dom", "@assistant-ui/core", "@assistant-ui/react", "@assistant-ui/store"],
  },
});
