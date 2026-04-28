const textFenceInfos = ["text", "txt"];
const fenceLinePattern = /^([ \t]{0,3})(`{3,}|~{3,})(.*)$/;

export function normalizeMarkdownContent(content: string) {
  const output: string[] = [];
  let openFence: { markerChar: string; markerLength: number } | null = null;

  function consumeLine(line: string) {
    const fenceMatch = line.match(fenceLinePattern);

    if (openFence) {
      if (fenceMatch) {
        const [, indent, marker, suffix] = fenceMatch;
        const markerChar = marker[0];
        const isMatchingFence = markerChar === openFence.markerChar && marker.length >= openFence.markerLength;

        if (isMatchingFence) {
          if (suffix.trim() === "") {
            output.push(line);
          } else {
            output.push(`${indent}${marker}`);
            openFence = null;
            consumeLine(suffix.trimStart());
            return;
          }
          openFence = null;
          return;
        }
      }

      output.push(line);
      return;
    }

    if (!fenceMatch) {
      output.push(line);
      return;
    }

    const [, indent, marker, info] = fenceMatch;
    const repairedTextOpening = textFenceInfos.find((fenceInfo) => info.startsWith(fenceInfo) && info.length > fenceInfo.length);

    if (repairedTextOpening && info[repairedTextOpening.length] !== " " && info[repairedTextOpening.length] !== "\t") {
      output.push(`${indent}${marker}${repairedTextOpening}`);
      output.push(info.slice(repairedTextOpening.length));
    } else {
      output.push(line);
    }

    openFence = { markerChar: marker[0], markerLength: marker.length };
  }

  for (const line of content.replace(/\r\n/g, "\n").split("\n")) {
    consumeLine(line);
  }

  return output.join("\n");
}
