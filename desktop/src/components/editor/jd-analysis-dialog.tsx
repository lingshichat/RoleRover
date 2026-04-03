import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  X,
  FileSearch,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Target,
  ShieldCheck,
  AlertTriangle,
  Lightbulb,
} from "lucide-react";
import { useResumeStore } from "../../stores/resume-store";
import { listenToAiStreamEvents, startAiPromptStream } from "../../lib/desktop-api";
import { getDesktopAiRuntimeConfig } from "./ai-dialog-helpers";
import type { DesktopAiStreamEvent } from "../../lib/desktop-api";

interface JdAnalysisDialogProps {
  open: boolean;
  onClose: () => void;
  resumeId: string;
}

type AnalysisState = "idle" | "analyzing" | "completed" | "error";
type AnalysisOutputLanguage = "en" | "zh-Hans";

interface JdSuggestion {
  section: string;
  current: string;
  suggested: string;
}

interface JdAnalysisResult {
  overallScore: number;
  atsScore: number;
  summary: string;
  keywordMatches: string[];
  missingKeywords: string[];
  suggestions: JdSuggestion[];
}

const JSON_START = "<<<JD_ANALYSIS_JSON_START>>>";
const JSON_END = "<<<JD_ANALYSIS_JSON_END>>>";
const RESUME_SECTION_ALIASES = new Set([
  "resume",
  "full resume",
  "entire resume",
  "whole resume",
  "complete resume",
  "overall",
]);

function clampScore(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function containsCjkCharacters(text: string): boolean {
  return /[\u3400-\u9fff]/u.test(text);
}

function normalizeSectionKey(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ");
}

function resolveAnalysisOutputLanguage(params: {
  resumeLanguage?: string;
  uiLanguage?: string;
  resumeContextJson: string;
  jobDescription: string;
}): AnalysisOutputLanguage {
  const resumeLanguage = params.resumeLanguage?.trim().toLowerCase() ?? "";
  const uiLanguage = params.uiLanguage?.trim().toLowerCase() ?? "";

  if (resumeLanguage.startsWith("zh")) {
    return "zh-Hans";
  }

  if (containsCjkCharacters(params.resumeContextJson)) {
    return "zh-Hans";
  }

  if (resumeLanguage.startsWith("en")) {
    return "en";
  }

  if (containsCjkCharacters(params.jobDescription)) {
    return "zh-Hans";
  }

  if (uiLanguage.startsWith("zh")) {
    return "zh-Hans";
  }

  return "en";
}

function buildAnalysisPrompt(params: {
  outputLanguage: AnalysisOutputLanguage;
  resumeContextJson: string;
  jobDescription: string;
}): string {
  const languageName =
    params.outputLanguage === "zh-Hans" ? "Simplified Chinese" : "English";

  return `You are an expert resume analyst and career coach.

Analyze how well the resume matches the job description.

Output language: ${languageName}.
All human-readable analysis text and every JSON string value must be written in ${languageName}.
Keep proper nouns and technology names in their original spelling when appropriate.

Return two things in one response:
1. A concise human-readable analysis with sections for overall fit, matching keywords, missing keywords, and improvement suggestions.
2. A final JSON object wrapped exactly between these markers:
${JSON_START}
...json...
${JSON_END}

The JSON shape must be:
{
  "overallScore": number,
  "atsScore": number,
  "summary": string,
  "keywordMatches": string[],
  "missingKeywords": string[],
  "suggestions": [
    {
      "section": string,
      "current": string,
      "suggested": string
    }
  ]
}

Requirements:
- scores are 0-100 integers
- suggestions should be specific and actionable
- only include suggestions when you have a clear before/after recommendation
- when filling suggestions[].section, prefer the exact section title from the provided resume data

Resume:
${params.resumeContextJson}

Job description:
${params.jobDescription}`;
}

function parseStructuredResult(text: string): JdAnalysisResult | null {
  const startIndex = text.indexOf(JSON_START);
  const endIndex = text.indexOf(JSON_END);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return null;
  }

  const payload = text
    .slice(startIndex + JSON_START.length, endIndex)
    .trim();

  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }

    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions
          .map((item) => {
            if (!isRecord(item)) {
              return null;
            }

            return {
              section:
                typeof item.section === "string" ? item.section.trim() : "",
              current:
                typeof item.current === "string" ? item.current.trim() : "",
              suggested:
                typeof item.suggested === "string" ? item.suggested.trim() : "",
            };
          })
          .filter(
            (item): item is JdSuggestion =>
              item !== null &&
              Boolean(item.current) &&
              Boolean(item.suggested),
          )
      : [];

    return {
      overallScore: clampScore(parsed.overallScore),
      atsScore: clampScore(parsed.atsScore),
      summary:
        typeof parsed.summary === "string" ? parsed.summary.trim() : "",
      keywordMatches: toStringArray(parsed.keywordMatches),
      missingKeywords: toStringArray(parsed.missingKeywords),
      suggestions,
    };
  } catch {
    return null;
  }
}

function stripStructuredPayload(text: string): string {
  const startIndex = text.indexOf(JSON_START);
  if (startIndex === -1) {
    return text.trim();
  }

  return text.slice(0, startIndex).trim();
}

function ScoreCard({
  label,
  score,
}: {
  label: string;
  score: number;
}) {
  const tone =
    score < 40
      ? "text-red-600 bg-red-50 border-red-200"
      : score <= 70
        ? "text-amber-600 bg-amber-50 border-amber-200"
        : "text-emerald-600 bg-emerald-50 border-emerald-200";

  return (
    <div className={`rounded-xl border px-4 py-4 text-center ${tone}`}>
      <div className="text-2xl font-semibold">{score}</div>
      <div className="mt-1 text-xs font-medium uppercase tracking-wide">{label}</div>
    </div>
  );
}

export function JdAnalysisDialog({
  open,
  onClose,
  resumeId,
}: JdAnalysisDialogProps) {
  const { t, i18n } = useTranslation();
  const { currentResume, sections } = useResumeStore();

  const [jdText, setJdText] = useState("");
  const [state, setState] = useState<AnalysisState>("idle");
  const [streamText, setStreamText] = useState("");
  const [structuredResult, setStructuredResult] =
    useState<JdAnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const requestIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      requestIdRef.current = null;
      setJdText("");
      setStreamText("");
      setStructuredResult(null);
      setState("idle");
      setErrorMessage("");
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
          setStreamText((prev) => prev + event.deltaText);
          return;
        }

        if (event.kind === "completed") {
          const finalText = event.accumulatedText ?? streamText;
          setStreamText(finalText);
          setStructuredResult(parseStructuredResult(finalText));
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
  }, [streamText, t]);

  const handleAnalyze = async () => {
    if (!jdText.trim()) {
      return;
    }

    const requestId = `jd-analysis-${resumeId}-${Date.now()}`;
    requestIdRef.current = requestId;
    setState("analyzing");
    setStreamText("");
    setStructuredResult(null);
    setErrorMessage("");

    try {
      const resumeContext = {
        title: currentResume?.title || "",
        targetJobTitle: currentResume?.targetJobTitle || "",
        targetCompany: currentResume?.targetCompany || "",
        sections: sections.map((section) => ({
          sectionId: section.id,
          type: section.type,
          title: section.title,
          content: section.content,
        })),
      };
      const resumeContextJson = JSON.stringify(resumeContext, null, 2);
      const outputLanguage = resolveAnalysisOutputLanguage({
        resumeLanguage: currentResume?.language,
        uiLanguage: i18n.resolvedLanguage || i18n.language,
        resumeContextJson,
        jobDescription: jdText,
      });

      const aiConfig = await getDesktopAiRuntimeConfig();

      await startAiPromptStream({
        provider: aiConfig.provider,
        model: aiConfig.model || undefined,
        baseUrl: aiConfig.baseUrl,
        requestId,
        prompt: buildAnalysisPrompt({
          outputLanguage,
          resumeContextJson,
          jobDescription: jdText,
        }),
      });
    } catch (error: unknown) {
      setState("error");
      setErrorMessage(error instanceof Error ? error.message : t("aiErrorMessage"));
    }
  };

  const visibleAnalysis = useMemo(
    () => stripStructuredPayload(streamText),
    [streamText],
  );
  const suggestionSectionLabels = useMemo(() => {
    const labels = new Map<string, string>();

    sections.forEach((section) => {
      const title = section.title.trim();
      if (!title) {
        return;
      }

      [
        section.id,
        section.title,
        section.type,
        section.type.replaceAll("_", " "),
        section.type.replaceAll("_", "-"),
      ].forEach((alias) => {
        const normalized = normalizeSectionKey(alias);
        if (normalized && !labels.has(normalized)) {
          labels.set(normalized, title);
        }
      });
    });

    return labels;
  }, [sections]);
  const isLoading = state === "analyzing";

  const getSuggestionSectionLabel = (sectionName: string) => {
    const normalized = normalizeSectionKey(sectionName);

    if (!normalized || RESUME_SECTION_ALIASES.has(normalized)) {
      return t("jdAnalysisResumeSection");
    }

    return suggestionSectionLabels.get(normalized) ?? sectionName;
  };

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
            <FileSearch className="h-5 w-5 text-pink-500" />
            <h2 className="dialog-title">{t("jdAnalysisTitle")}</h2>
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
                {t("jdAnalysisDescription")}
              </p>
              <div className="form-field">
                <label className="form-label">
                  {t("jdAnalysisJobDescription")}
                </label>
                <textarea
                  value={jdText}
                  onChange={(event) => setJdText(event.target.value)}
                  placeholder={t("jdAnalysisPlaceholder")}
                  className="h-48 w-full resize-none rounded-lg border border-zinc-200 p-3 focus:border-pink-500 focus:outline-none"
                />
              </div>
            </>
          ) : (
            <div className="space-y-4">
              {state === "analyzing" ? (
                <div className="flex items-center gap-2 text-zinc-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">{t("jdAnalysisAnalyzing")}</span>
                </div>
              ) : null}

              {state === "completed" ? (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm">{t("jdAnalysisComplete")}</span>
                </div>
              ) : null}

              {state === "error" ? (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-red-600">
                  <AlertCircle className="mt-0.5 h-4 w-4" />
                  <span className="text-sm">{errorMessage}</span>
                </div>
              ) : null}

              {structuredResult ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <ScoreCard
                      label={t("jdAnalysisOverallMatch")}
                      score={structuredResult.overallScore}
                    />
                    <ScoreCard
                      label={t("jdAnalysisAtsScore")}
                      score={structuredResult.atsScore}
                    />
                  </div>

                  <section className="space-y-2">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                      <Target className="h-4 w-4 text-zinc-400" />
                      {t("jdAnalysisSummary")}
                    </h3>
                    <p className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm leading-relaxed text-zinc-700">
                      {structuredResult.summary || visibleAnalysis || "..."}
                    </p>
                  </section>

                  {structuredResult.keywordMatches.length > 0 ? (
                    <section className="space-y-2">
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                        <ShieldCheck className="h-4 w-4 text-emerald-500" />
                        {t("jdAnalysisKeywordMatches")}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {structuredResult.keywordMatches.map((keyword) => (
                          <span
                            key={keyword}
                            className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {structuredResult.missingKeywords.length > 0 ? (
                    <section className="space-y-2">
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        {t("jdAnalysisMissingKeywords")}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {structuredResult.missingKeywords.map((keyword) => (
                          <span
                            key={keyword}
                            className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700"
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {structuredResult.suggestions.length > 0 ? (
                    <section className="space-y-3">
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                        <Lightbulb className="h-4 w-4 text-yellow-500" />
                        {t("jdAnalysisSuggestions")}
                      </h3>
                      <div className="space-y-2">
                        {structuredResult.suggestions.map((suggestion, index) => (
                          <div
                            key={`${suggestion.section}-${index}`}
                            className="rounded-lg border border-zinc-200 bg-white p-3"
                          >
                            <div className="mb-2 inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                              {getSuggestionSectionLabel(suggestion.section)}
                            </div>
                            <div className="space-y-2 text-sm">
                              <div>
                                <div className="text-xs font-medium text-zinc-400">
                                  {t("jdAnalysisCurrent")}
                                </div>
                                <div className="text-zinc-600">
                                  {suggestion.current}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs font-medium text-pink-500">
                                  {t("jdAnalysisSuggested")}
                                </div>
                                <div className="font-medium text-zinc-900">
                                  {suggestion.suggested}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
                    {visibleAnalysis || "..."}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            {t("commonCancel")}
          </Button>
          {state === "idle" ? (
            <Button onClick={() => void handleAnalyze()} disabled={!jdText.trim()}>
              {t("jdAnalysisStart")}
            </Button>
          ) : null}
          {state === "completed" ? (
            <Button onClick={() => void handleAnalyze()}>{t("jdAnalysisStart")}</Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
