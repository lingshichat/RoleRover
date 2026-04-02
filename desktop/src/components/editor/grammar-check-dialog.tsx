import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  X,
  SpellCheck,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Wand2,
  XCircle,
} from "lucide-react";
import { useResumeStore } from "../../stores/resume-store";
import { useEditorStore } from "../../stores/editor-store";
import { listenToAiStreamEvents, startAiPromptStream } from "../../lib/desktop-api";
import type { DesktopAiStreamEvent } from "../../lib/desktop-api";

interface GrammarCheckDialogProps {
  open: boolean;
  onClose: () => void;
  resumeId: string;
}

type CheckState = "idle" | "checking" | "completed" | "error";

interface GrammarIssue {
  sectionId: string;
  sectionTitle: string;
  type: "grammar" | "spelling" | "weak-verb" | "vague";
  original: string;
  suggestion: string;
}

const JSON_START = "<<<GRAMMAR_JSON_START>>>";
const JSON_END = "<<<GRAMMAR_JSON_END>>>";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function replaceTextDeep(value: unknown, original: string, suggestion: string): unknown {
  if (typeof value === "string") {
    return value.includes(original) ? value.replaceAll(original, suggestion) : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceTextDeep(item, original, suggestion));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        replaceTextDeep(nested, original, suggestion),
      ]),
    );
  }

  return value;
}

function parseIssues(text: string): GrammarIssue[] {
  const startIndex = text.indexOf(JSON_START);
  const endIndex = text.indexOf(JSON_END);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return [];
  }

  const payload = text.slice(startIndex + JSON_START.length, endIndex).trim();
  if (!payload) {
    return [];
  }

  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => {
        if (!isRecord(item)) {
          return null;
        }

        const type =
          item.type === "grammar" ||
          item.type === "spelling" ||
          item.type === "weak-verb" ||
          item.type === "vague"
            ? item.type
            : null;

        if (!type) {
          return null;
        }

        const original =
          typeof item.original === "string" ? item.original.trim() : "";
        const suggestion =
          typeof item.suggestion === "string" ? item.suggestion.trim() : "";
        const sectionId =
          typeof item.sectionId === "string" ? item.sectionId.trim() : "";
        const sectionTitle =
          typeof item.sectionTitle === "string" && item.sectionTitle.trim()
            ? item.sectionTitle.trim()
            : "Resume";

        if (!original || !suggestion || !sectionId) {
          return null;
        }

        return {
          sectionId,
          sectionTitle,
          type,
          original,
          suggestion,
        };
      })
      .filter((item): item is GrammarIssue => item !== null);
  } catch {
    return [];
  }
}

function stripStructuredPayload(text: string): string {
  const startIndex = text.indexOf(JSON_START);
  if (startIndex === -1) {
    return text.trim();
  }

  return text.slice(0, startIndex).trim();
}

export function GrammarCheckDialog({
  open,
  onClose,
  resumeId,
}: GrammarCheckDialogProps) {
  const { t } = useTranslation();
  const { sections, updateSection } = useResumeStore();
  const { selectedSectionId } = useEditorStore();

  const [checkScope, setCheckScope] = useState<"all" | "current">("all");
  const [state, setState] = useState<CheckState>("idle");
  const [issues, setIssues] = useState<GrammarIssue[]>([]);
  const [rawAnalysis, setRawAnalysis] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [appliedIssues, setAppliedIssues] = useState<Set<number>>(new Set());
  const requestIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      requestIdRef.current = null;
      setState("idle");
      setIssues([]);
      setRawAnalysis("");
      setErrorMessage("");
      setAppliedIssues(new Set());
    }
  }, [open]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listenToAiStreamEvents((event: DesktopAiStreamEvent) => {
        if (!requestIdRef.current || event.requestId !== requestIdRef.current) {
          return;
        }

        if (event.kind === "delta" && event.deltaText) {
          setRawAnalysis((prev) => prev + event.deltaText);
          return;
        }

        if (event.kind === "completed") {
          const finalText = event.accumulatedText ?? rawAnalysis;
          setRawAnalysis(finalText);
          setIssues(parseIssues(finalText));
          setState("completed");
          return;
        }

        if (event.kind === "error") {
          setState("error");
          setErrorMessage(event.errorMessage || t("aiErrorMessage"));
        }
      });
    };

    void setupListener();

    return () => {
      unlisten?.();
    };
  }, [rawAnalysis, t]);

  const scopedSections = useMemo(() => {
    if (checkScope === "current" && selectedSectionId) {
      return sections.filter((section) => section.id === selectedSectionId);
    }

    return sections;
  }, [checkScope, sections, selectedSectionId]);

  const handleCheck = async () => {
    const requestId = `grammar-check-${resumeId}-${Date.now()}`;
    requestIdRef.current = requestId;
    setState("checking");
    setIssues([]);
    setRawAnalysis("");
    setErrorMessage("");
    setAppliedIssues(new Set());

    try {
      await startAiPromptStream({
        provider: "openai",
        model: "gpt-4o",
        requestId,
        prompt: `Review this resume content for grammar and style issues.

Return two parts:
1. A concise human-readable summary.
2. A JSON array wrapped exactly between these markers:
${JSON_START}
...json...
${JSON_END}

Each JSON item must follow:
{
  "sectionId": string,
  "sectionTitle": string,
  "type": "grammar" | "spelling" | "weak-verb" | "vague",
  "original": string,
  "suggestion": string
}

Rules:
- only include issues when the original text exists verbatim in the provided section content
- keep suggestions concise
- sectionId must match one of the provided section ids

Resume sections to review:
${JSON.stringify(
  scopedSections.map((section) => ({
    sectionId: section.id,
    sectionTitle: section.title,
    sectionType: section.type,
    content: section.content,
  })),
  null,
  2,
)}`,
      });
    } catch (error: any) {
      setState("error");
      setErrorMessage(error.message || t("aiErrorMessage"));
    }
  };

  const handleApplyIssue = (index: number) => {
    const issue = issues[index];
    const targetSection = sections.find((section) => section.id === issue.sectionId);
    if (!targetSection) {
      return;
    }

    const nextContent = replaceTextDeep(
      targetSection.content,
      issue.original,
      issue.suggestion,
    );

    if (isRecord(nextContent)) {
      updateSection(issue.sectionId, nextContent);
      setAppliedIssues((prev) => new Set(prev).add(index));
    }
  };

  const handleApplyAll = () => {
    issues.forEach((_, index) => {
      if (!appliedIssues.has(index)) {
        handleApplyIssue(index);
      }
    });
  };

  const getIssueTypeLabel = (type: GrammarIssue["type"]) => {
    switch (type) {
      case "grammar":
        return t("grammarCheckTypeGrammar");
      case "spelling":
        return t("grammarCheckTypeSpelling");
      case "weak-verb":
        return t("grammarCheckTypeWeakVerb");
      case "vague":
        return t("grammarCheckTypeVague");
    }
  };

  const getIssueTypeColor = (type: GrammarIssue["type"]) => {
    switch (type) {
      case "grammar":
        return "bg-red-100 text-red-700";
      case "spelling":
        return "bg-orange-100 text-orange-700";
      case "weak-verb":
        return "bg-amber-100 text-amber-700";
      case "vague":
        return "bg-yellow-100 text-yellow-700";
    }
  };

  const isLoading = state === "checking";
  const visibleAnalysis = useMemo(
    () => stripStructuredPayload(rawAnalysis),
    [rawAnalysis],
  );

  if (!open) {
    return null;
  }

  return (
    <div className="dialog-backdrop" onClick={!isLoading ? onClose : undefined}>
      <div
        className="dialog-content dialog-content--lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-header">
          <div className="flex items-center gap-2">
            <SpellCheck className="h-5 w-5 text-pink-500" />
            <h2 className="dialog-title">{t("grammarCheckTitle")}</h2>
          </div>
          <button
            type="button"
            className="dialog-close"
            onClick={onClose}
            disabled={isLoading}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="dialog-body space-y-4">
          {state === "idle" ? (
            <>
              <p className="text-sm text-zinc-500">
                {t("grammarCheckDescription")}
              </p>

              <div className="form-field">
                <label className="form-label">{t("grammarCheckScope")}</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCheckScope("all")}
                    className={`flex-1 rounded-md border px-4 py-2 transition-colors ${
                      checkScope === "all"
                        ? "border-pink-500 bg-pink-50 text-pink-700"
                        : "border-zinc-200 hover:border-zinc-300"
                    }`}
                  >
                    {t("grammarCheckScopeAll")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheckScope("current")}
                    className={`flex-1 rounded-md border px-4 py-2 transition-colors ${
                      checkScope === "current"
                        ? "border-pink-500 bg-pink-50 text-pink-700"
                        : "border-zinc-200 hover:border-zinc-300"
                    }`}
                  >
                    {t("grammarCheckScopeCurrent")}
                  </button>
                </div>
              </div>
            </>
          ) : null}

          {state === "checking" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-zinc-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">{t("grammarCheckChecking")}</span>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <pre className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
                  {visibleAnalysis || "..."}
                </pre>
              </div>
            </div>
          ) : null}

          {state === "error" ? (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-red-600">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              <span className="text-sm">{errorMessage}</span>
            </div>
          ) : null}

          {state === "completed" ? (
            <div className="space-y-3">
              {issues.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg bg-green-50 p-4 text-green-600">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="text-sm font-medium">
                    {t("grammarCheckNoIssues")}
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-zinc-600">
                      {t("grammarCheckFoundIssues", { count: issues.length })}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleApplyAll}
                      disabled={issues.every((_, index) => appliedIssues.has(index))}
                    >
                      <Wand2 className="mr-2 h-4 w-4" />
                      Fix All
                    </Button>
                  </div>

                  <div className="max-h-96 space-y-2 overflow-y-auto">
                    {issues.map((issue, index) => (
                      <div
                        key={`${issue.sectionId}-${index}`}
                        className={`rounded-lg border p-3 ${
                          appliedIssues.has(index)
                            ? "border-green-200 bg-green-50"
                            : "border-zinc-200 bg-zinc-50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="mb-2 flex items-center gap-2">
                              <span
                                className={`rounded px-2 py-0.5 text-xs font-medium ${getIssueTypeColor(
                                  issue.type,
                                )}`}
                              >
                                {getIssueTypeLabel(issue.type)}
                              </span>
                              <span className="text-xs text-zinc-400">
                                {issue.sectionTitle}
                              </span>
                            </div>

                            <div className="space-y-2 text-sm">
                              <div className="flex items-start gap-2">
                                <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                                <span className="text-zinc-600 line-through">
                                  {issue.original}
                                </span>
                              </div>
                              <div className="flex items-start gap-2">
                                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
                                <span className="font-medium text-zinc-900">
                                  {issue.suggestion}
                                </span>
                              </div>
                            </div>
                          </div>

                          {!appliedIssues.has(index) ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleApplyIssue(index)}
                            >
                              {t("grammarCheckApply")}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>

        <div className="dialog-footer">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            {t("commonCancel")}
          </Button>
          {state === "idle" ? (
            <Button onClick={() => void handleCheck()}>
              {t("grammarCheckStart")}
            </Button>
          ) : null}
          {state === "completed" ? (
            <Button onClick={() => void handleCheck()}>
              {t("grammarCheckStart")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
