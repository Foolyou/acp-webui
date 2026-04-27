export function payloadText(payload: unknown) {
  if (typeof payload === "string") {
    return payload;
  }
  if (payload && typeof payload === "object") {
    const value = payload as Record<string, unknown>;
    for (const key of ["diff", "markdown", "content", "text", "output"]) {
      if (typeof value[key] === "string") {
        return value[key];
      }
    }
  }
  return JSON.stringify(payload, null, 2);
}

export function toolSummary(toolCall: unknown) {
  if (!toolCall || typeof toolCall !== "object") {
    return "No additional details.";
  }
  const value = toolCall as Record<string, unknown>;
  const content = value.content;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const partValue = part as Record<string, unknown>;
        return typeof partValue.text === "string" ? partValue.text : "";
      })
      .filter(Boolean)
      .join("\n");
    if (text) return text;
  }
  return JSON.stringify(toolCall, null, 2);
}
