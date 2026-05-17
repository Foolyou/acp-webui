const textFenceInfos = ["text", "txt", "plaintext"];
const fenceLinePattern = /^([ \t]{0,3})(`{3,}|~{3,})(.*)$/;
const proseGluedOpeningPattern = /^(.+\S)(`{3,}|~{3,})([A-Za-z][A-Za-z0-9_+.-]*)[ \t]*$/;

export function normalizeMarkdownContent(content: string) {
  const wholeTextFence = unwrapWholeTextFence(content);
  if (wholeTextFence !== null) return wholeTextFence;

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

      const trailingClosingFence = line.match(/^(.*?)(`{3,}|~{3,})[ \t]*$/);
      if (trailingClosingFence) {
        const [, text, marker] = trailingClosingFence;
        const markerChar = marker[0];
        const isMatchingFence = markerChar === openFence.markerChar && marker.length >= openFence.markerLength;
        if (isMatchingFence && text.trim() !== "") {
          output.push(text);
          output.push(marker);
          openFence = null;
          return;
        }
      }

      output.push(line);
      return;
    }

    const proseGluedOpening = line.match(proseGluedOpeningPattern);
    if (!fenceMatch && proseGluedOpening) {
      const [, prose, marker, info] = proseGluedOpening;
      output.push(prose);
      output.push(`${marker}${info}`);
      openFence = { markerChar: marker[0], markerLength: marker.length };
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

function unwrapWholeTextFence(content: string) {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const firstContentIndex = lines.findIndex((line) => line.trim() !== "");
  if (firstContentIndex === -1) return null;

  const opening = lines[firstContentIndex].match(fenceLinePattern);
  if (!opening) return null;
  const [, , marker, info] = opening;
  const infoText = info.trim().toLowerCase();
  if (!textFenceInfos.includes(infoText)) return null;

  const markerChar = marker[0];
  const markerLength = marker.length;
  let closingIndex = -1;
  for (let index = firstContentIndex + 1; index < lines.length; index++) {
    const closing = lines[index].match(fenceLinePattern);
    if (!closing) continue;
    const [, , closingMarker, suffix] = closing;
    if (closingMarker[0] === markerChar && closingMarker.length >= markerLength && suffix.trim() === "") {
      closingIndex = index;
      break;
    }
  }

  if (closingIndex === -1) return null;
  if (lines.slice(0, firstContentIndex).some((line) => line.trim() !== "")) return null;
  if (lines.slice(closingIndex + 1).some((line) => line.trim() !== "")) return null;

  return lines.slice(firstContentIndex + 1, closingIndex).join("\n");
}
