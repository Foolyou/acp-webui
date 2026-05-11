export type SpeechRecognitionEndReason = "complete" | "stopped" | "unexpected";

export type SpeechRecognitionLifecycleEvent =
  | { type: "listening" }
  | { type: "transcript"; transcript: string; isFinal: boolean }
  | { type: "end"; reason: SpeechRecognitionEndReason }
  | { type: "error"; error: string; message: string };

type SpeechRecognitionAlternativeLike = {
  transcript?: string;
};

type SpeechRecognitionResultLike = {
  isFinal?: boolean;
  length?: number;
  [index: number]: SpeechRecognitionAlternativeLike | undefined;
};

type SpeechRecognitionResultEventLike = {
  resultIndex?: number;
  results?: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorEventLike = {
  error?: string;
  message?: string;
};

type SpeechRecognitionLike = {
  continuous?: boolean;
  interimResults?: boolean;
  lang?: string;
  maxAlternatives?: number;
  onstart?: ((event: Event) => void) | null;
  onresult?: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onend?: ((event: Event) => void) | null;
  onerror?: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export type SpeechRecognitionTarget = {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
  isSecureContext?: boolean;
  location?: {
    hostname?: string;
    protocol?: string;
  };
};

export type SpeechRecognitionAdapter = {
  supported: boolean;
  start: () => boolean;
  stop: () => void;
  destroy: () => void;
};

export function speechRecognitionSupported(target: unknown = globalThis) {
  const recognitionTarget = asSpeechRecognitionTarget(target);
  if (!recognitionTarget || !getSpeechRecognitionConstructor(recognitionTarget)) {
    return false;
  }
  return hasSecureRecognitionContext(recognitionTarget);
}

export function insertVoiceTranscript(current: string, transcript: string) {
  const text = transcript.trim();
  if (!text) return current;
  if (!current.trim()) return text;
  const separator = /[\s\n]$/u.test(current) ? "" : " ";
  return `${current}${separator}${text}`;
}

export function createSpeechRecognitionAdapter({
  lang,
  onEvent,
  target = globalThis
}: {
  lang?: string;
  onEvent: (event: SpeechRecognitionLifecycleEvent) => void;
  target?: unknown;
}): SpeechRecognitionAdapter {
  const recognitionTarget = asSpeechRecognitionTarget(target);
  const Recognition = recognitionTarget ? getSpeechRecognitionConstructor(recognitionTarget) : null;
  if (!recognitionTarget || !Recognition || !speechRecognitionSupported(recognitionTarget)) {
    return unsupportedAdapter();
  }
  const RecognitionCtor = Recognition;

  let recognition: SpeechRecognitionLike | null = null;
  let destroyed = false;
  let stopRequested = false;
  let receivedTranscript = false;
  let failed = false;

  function createRecognition() {
    const next = new RecognitionCtor();
    next.continuous = false;
    next.interimResults = false;
    next.maxAlternatives = 1;
    if (lang) next.lang = lang;

    next.onstart = () => {
      onEvent({ type: "listening" });
    };
    next.onresult = (event) => {
      const result = transcriptFromResultEvent(event);
      if (!result.transcript) return;
      receivedTranscript = true;
      onEvent({ type: "transcript", transcript: result.transcript, isFinal: result.isFinal });
    };
    next.onerror = (event) => {
      failed = true;
      onEvent({ type: "error", error: event.error ?? "unknown", message: speechRecognitionErrorMessage(event) });
    };
    next.onend = () => {
      const reason = stopRequested ? "stopped" : failed ? "stopped" : receivedTranscript ? "complete" : "unexpected";
      onEvent({ type: "end", reason });
    };

    return next;
  }

  return {
    supported: true,
    start() {
      if (destroyed) return false;
      stopRequested = false;
      receivedTranscript = false;
      failed = false;
      recognition = createRecognition();
      try {
        recognition.start();
        return true;
      } catch (error) {
        failed = true;
        onEvent({ type: "error", error: "start_failed", message: errorMessage(error) });
        return false;
      }
    },
    stop() {
      stopRequested = true;
      recognition?.stop();
    },
    destroy() {
      destroyed = true;
      stopRequested = true;
      recognition?.abort?.();
      recognition = null;
    }
  };
}

function unsupportedAdapter(): SpeechRecognitionAdapter {
  return {
    supported: false,
    start: () => false,
    stop: () => {},
    destroy: () => {}
  };
}

function asSpeechRecognitionTarget(target: unknown): SpeechRecognitionTarget | null {
  if (!target || typeof target !== "object") return null;
  return target as SpeechRecognitionTarget;
}

function getSpeechRecognitionConstructor(target: SpeechRecognitionTarget) {
  const Recognition = target.SpeechRecognition ?? target.webkitSpeechRecognition;
  return typeof Recognition === "function" ? Recognition : null;
}

function hasSecureRecognitionContext(target: SpeechRecognitionTarget) {
  if (target.isSecureContext !== false) return true;
  const protocol = target.location?.protocol;
  const hostname = target.location?.hostname;
  return protocol === "https:" || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function transcriptFromResultEvent(event: SpeechRecognitionResultEventLike) {
  const results = event.results;
  if (!results?.length) return { transcript: "", isFinal: false };
  const start = Math.max(0, event.resultIndex ?? 0);
  const transcripts: string[] = [];
  let isFinal = true;

  for (let index = start; index < results.length; index += 1) {
    const result = results[index];
    if (!result) continue;
    const alternative = result[0];
    const transcript = alternative?.transcript?.trim();
    if (!transcript) continue;
    transcripts.push(transcript);
    isFinal = isFinal && result.isFinal === true;
  }

  return { transcript: transcripts.join(" ").trim(), isFinal };
}

function speechRecognitionErrorMessage(event: SpeechRecognitionErrorEventLike) {
  switch (event.error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was denied. Check browser permissions and try again.";
    case "audio-capture":
      return "No microphone was found for voice input.";
    case "network":
      return "Voice input could not reach the recognition service.";
    case "no-speech":
      return "No speech was detected. Try again.";
    default:
      return event.message?.trim() || "Voice input failed. Try again.";
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
