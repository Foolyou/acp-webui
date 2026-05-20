declare global {
  interface Window {
    __ACP_WEBUI_BASE_PATH__?: string;
  }
}

export function basePathFromPublicPath(publicPath: string) {
  const trimmed = publicPath.trim();
  if (!trimmed || trimmed === "/" || trimmed === "./" || trimmed === ".") {
    return "";
  }

  let pathname = trimmed;
  try {
    pathname = new URL(trimmed, "http://acp-webui.local").pathname;
  } catch {
    pathname = trimmed;
  }

  const normalized = `/${pathname.replace(/^\/+|\/+$/g, "")}`;
  return normalized === "/" ? "" : normalized;
}

function runtimeBasePath() {
  if (typeof window === "undefined") {
    return "";
  }
  return basePathFromPublicPath(window.__ACP_WEBUI_BASE_PATH__ ?? "");
}

export const frontendBasePath = runtimeBasePath() || basePathFromPublicPath(import.meta.env.BASE_URL);

export function publicPath(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${frontendBasePath}${normalized}`;
}
