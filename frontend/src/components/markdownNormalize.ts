const textFenceInfos = ["text", "txt", "plaintext"];
const readableFenceInfos = [...textFenceInfos, "markdown", "md"];
const readableFenceInfosByLength = [...readableFenceInfos].sort((left, right) => right.length - left.length);
const fenceLinePattern = /^([ \t]{0,3})(`{3,}|~{3,})(.*)$/;
const proseGluedOpeningPattern = /^(.+\S)(`{3,}|~{3,})([A-Za-z][A-Za-z0-9_+.-]*)[ \t]*$/;

export function normalizeMarkdownContent(content: string) {
  const wholeTextFence = unwrapWholeTextFence(content);
  const source = wholeTextFence ?? content;

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

  for (const line of source.replace(/\r\n/g, "\n").split("\n")) {
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
  const gluedOpening = readableFenceInfoPrefix(info);
  const openingIsReadable = readableFenceInfos.includes(infoText);
  if (!openingIsReadable && !gluedOpening) return null;

  const markerChar = marker[0];
  const markerLength = marker.length;
  let closingIndex = -1;
  for (let index = firstContentIndex + 1; index < lines.length; index++) {
    const closing = lines[index].match(fenceLinePattern);
    if (!closing) continue;
    const [, , closingMarker, suffix] = closing;
    if (closingMarker[0] === markerChar && closingMarker.length >= markerLength && suffix.trim() === "") {
      closingIndex = index;
    }
  }

  if (closingIndex === -1) return null;
  if (lines.slice(0, firstContentIndex).some((line) => line.trim() !== "")) return null;
  if (lines.slice(closingIndex + 1).some((line) => line.trim() !== "")) return null;

  return [
    ...(gluedOpening ? [gluedOpening.rest.trimStart()] : []),
    ...lines.slice(firstContentIndex + 1, closingIndex)
  ].join("\n");
}

function readableFenceInfoPrefix(info: string) {
  const trimmedStart = info.trimStart();
  const normalized = trimmedStart.toLowerCase();
  for (const fenceInfo of readableFenceInfosByLength) {
    if (!normalized.startsWith(fenceInfo)) continue;
    const rest = trimmedStart.slice(fenceInfo.length);
    if (rest === "" || /^[A-Za-z0-9_+.-]/.test(rest)) continue;
    return { fenceInfo, rest };
  }
  return null;
}
