import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // BACKEND_TARGET is set in .env (prod EC2) or overridden in .env.local (local dev).
  // No VITE_ prefix — only used here in the proxy config, never sent to the browser.
  const backendTarget = env.BACKEND_TARGET ?? "http://54.200.186.179:8001";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      proxy: {
        "/api": { target: backendTarget, changeOrigin: true },
        "/conversation-report": { target: backendTarget, changeOrigin: true },
        "/conversation-reports": { target: backendTarget, changeOrigin: true },
      },
    },
  };
});
