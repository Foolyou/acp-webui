import { describe, expect, test } from "vitest";
import {
  createSpeechRecognitionAdapter,
  insertVoiceTranscript,
  speechRecognitionSupported,
  type SpeechRecognitionLifecycleEvent
} from "./speechRecognition";

class FakeSpeechRecognition {
  continuous = true;
  interimResults = true;
  maxAlternatives = 10;
  onstart: ((event: Event) => void) | null = null;
  onresult: ((event: { resultIndex: number; results: Array<{ 0: { transcript: string }; isFinal: boolean; length: number }> }) => void) | null =
    null;
  onend: ((event: Event) => void) | null = null;
  onerror: ((event: { error: string; message?: string }) => void) | null = null;

  start() {
    this.onstart?.({} as Event);
  }

  stop() {
    this.onend?.({} as Event);
  }

  abort() {
    this.onend?.({} as Event);
  }

  emitTranscript(transcript: string, isFinal = true) {
    this.onresult?.({
      resultIndex: 0,
      results: [{ 0: { transcript }, isFinal, length: 1 }]
    });
  }

  emitError(error: string, message?: string) {
    this.onerror?.({ error, message });
  }

  emitEnd() {
    this.onend?.({} as Event);
  }
}

function targetWithRecognition(instances: FakeSpeechRecognition[] = []) {
  return {
    isSecureContext: true,
    SpeechRecognition: class extends FakeSpeechRecognition {
      constructor() {
        super();
        instances.push(this);
      }
    }
  };
}

describe("speechRecognitionSupported", () => {
  test("detects browser support without throwing for unsupported targets", () => {
    expect(speechRecognitionSupported(null)).toBe(false);
    expect(speechRecognitionSupported({})).toBe(false);
    expect(speechRecognitionSupported(targetWithRecognition())).toBe(true);
    expect(
      speechRecognitionSupported({
        ...targetWithRecognition(),
        isSecureContext: false,
        location: { hostname: "example.test", protocol: "http:" }
      })
    ).toBe(false);
    expect(
      speechRecognitionSupported({
        ...targetWithRecognition(),
        isSecureContext: false,
        location: { hostname: "127.0.0.1", protocol: "http:" }
      })
    ).toBe(true);
  });
});

describe("createSpeechRecognitionAdapter", () => {
  test("normalizes start, transcript, and stopped events", () => {
    const instances: FakeSpeechRecognition[] = [];
    const events: SpeechRecognitionLifecycleEvent[] = [];
    const adapter = createSpeechRecognitionAdapter({
      onEvent: (event) => events.push(event),
      target: targetWithRecognition(instances)
    });

    expect(adapter.supported).toBe(true);
    expect(adapter.start()).toBe(true);
    instances[0].emitTranscript("  describe the diff  ");
    adapter.stop();

    expect(events).toEqual([
      { type: "listening" },
      { type: "transcript", transcript: "describe the diff", isFinal: true },
      { type: "end", reason: "stopped" }
    ]);
  });

  test("normalizes microphone errors and unexpected end states", () => {
    const instances: FakeSpeechRecognition[] = [];
    const events: SpeechRecognitionLifecycleEvent[] = [];
    const adapter = createSpeechRecognitionAdapter({
      onEvent: (event) => events.push(event),
      target: targetWithRecognition(instances)
    });

    adapter.start();
    instances[0].emitError("not-allowed");
    instances[0].emitEnd();

    expect(events).toContainEqual({
      type: "error",
      error: "not-allowed",
      message: "Microphone access was denied. Check browser permissions and try again."
    });
    expect(events).toContainEqual({ type: "end", reason: "stopped" });

    events.length = 0;
    adapter.start();
    instances[1].emitEnd();

    expect(events).toEqual([{ type: "listening" }, { type: "end", reason: "unexpected" }]);
  });
});

describe("insertVoiceTranscript", () => {
  test("inserts transcripts with readable whitespace", () => {
    expect(insertVoiceTranscript("", "  explain this  ")).toBe("explain this");
    expect(insertVoiceTranscript("Review", "the diff")).toBe("Review the diff");
    expect(insertVoiceTranscript("Review ", "the diff")).toBe("Review the diff");
    expect(insertVoiceTranscript("Review\n", "the diff")).toBe("Review\nthe diff");
    expect(insertVoiceTranscript("Line one\nLine two", "line three")).toBe("Line one\nLine two line three");
    expect(insertVoiceTranscript("Keep this", "   ")).toBe("Keep this");
  });
});
