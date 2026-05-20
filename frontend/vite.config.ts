import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendUrl = env.ACP_WEBUI_BACKEND_URL ?? "http://127.0.0.1:7635";

  return {
    base: "./",
    plugins: [react()],
    server: {
      proxy: {
        "/api": {
          target: backendUrl,
          changeOrigin: true,
          ws: true
        }
      }
    }
  };
});
