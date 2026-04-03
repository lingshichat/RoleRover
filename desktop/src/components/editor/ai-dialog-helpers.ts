import {
  getWorkspaceSettingsSnapshot,
  listenToAiStreamEvents,
  startAiPromptStream,
  type DesktopAiStreamEvent,
  type StartAiPromptStreamInput,
} from "../../lib/desktop-api";

export interface LanguageOption {
  code: string;
  label: string;
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
  { code: "ru", label: "Русский" },
  { code: "ar", label: "العربية" },
];

export interface DesktopAiRuntimeConfig {
  provider: string;
  model?: string;
  baseUrl?: string;
  resumeImportVisionModel?: string;
}

export interface RunPromptStreamOptions {
  onEvent?: (event: DesktopAiStreamEvent) => void;
}

export function generateRequestId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}`;
}

export async function getDesktopAiRuntimeConfig(): Promise<DesktopAiRuntimeConfig> {
  try {
    const settings = await getWorkspaceSettingsSnapshot();
    const provider = settings.ai.defaultProvider || "openai";
    const providerConfig = settings.ai.providerConfigs[provider];

    return {
      provider,
      model: providerConfig?.model || "",
      baseUrl: providerConfig?.baseUrl || undefined,
      resumeImportVisionModel: settings.ai.resumeImportVisionModel || "",
    };
  } catch {
    return {
      provider: "openai",
      model: "",
      resumeImportVisionModel: "",
    };
  }
}

export async function runPromptStream(
  input: StartAiPromptStreamInput,
  options: RunPromptStreamOptions = {},
): Promise<string> {
  const requestId = input.requestId ?? generateRequestId("desktop-ai");

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let accumulatedText = "";
    let unlisten: (() => void) | null = null;

    const cleanup = () => {
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
    };

    const settleResolve = (value: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const settleReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    void (async () => {
      try {
        unlisten = await listenToAiStreamEvents((event) => {
          if (event.requestId !== requestId || settled) {
            return;
          }

          if (typeof event.accumulatedText === "string") {
            accumulatedText = event.accumulatedText;
          } else if (event.kind === "delta" && event.deltaText) {
            accumulatedText += event.deltaText;
          }

          options.onEvent?.(event);

          if (event.kind === "completed") {
            settleResolve(event.accumulatedText ?? accumulatedText);
            return;
          }

          if (event.kind === "error") {
            settleReject(new Error(event.errorMessage || "AI stream failed."));
          }
        });

        await startAiPromptStream({
          ...input,
          requestId,
        });
      } catch (error) {
        settleReject(error);
      }
    })();
  });
}

export function extractJsonObject<T>(rawText: string): T {
  const candidates = new Set<string>();
  const trimmed = rawText.trim();

  if (trimmed) {
    candidates.add(trimmed);
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    candidates.add(fencedMatch[1].trim());
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.add(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error("Failed to parse AI response.");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";

  document.body.appendChild(anchor);
  anchor.click();

  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 60000);
}

export interface ParsedCoverLetter {
  title: string;
  content: string;
}

export function parseCoverLetterOutput(text: string): ParsedCoverLetter {
  const separator = "---CONTENT---";
  const separatorIndex = text.indexOf(separator);

  if (separatorIndex !== -1) {
    const titlePart = text.slice(0, separatorIndex).trim();
    const content = text.slice(separatorIndex + separator.length).trim();

    return {
      title: titlePart.replace(/^TITLE:\s*/i, "").trim() || "Cover Letter",
      content,
    };
  }

  const lines = text.trim().split("\n");
  const firstLine = (lines[0] || "Cover Letter")
    .replace(/^#+\s*/, "")
    .replace(/^TITLE:\s*/i, "")
    .trim();

  return {
    title: firstLine || "Cover Letter",
    content: lines.slice(1).join("\n").trim() || text.trim(),
  };
}
