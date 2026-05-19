export function basePathFromPublicPath(publicPath: string) {
  const trimmed = publicPath.trim();
  if (!trimmed || trimmed === "/") {
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

export const frontendBasePath = basePathFromPublicPath(import.meta.env.BASE_URL);

export function publicPath(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${frontendBasePath}${normalized}`;
}

