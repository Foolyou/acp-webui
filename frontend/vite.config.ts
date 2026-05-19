import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function normalizePublicPath(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "/";
  }
  if (/^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed)) {
    return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
  }
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}/`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendUrl = env.ACP_WEBUI_BACKEND_URL ?? "http://127.0.0.1:7635";
  const publicPath = normalizePublicPath(env.ACP_WEBUI_PUBLIC_PATH);

  return {
    base: publicPath,
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
