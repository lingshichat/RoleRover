import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TEMPLATES } from "@/lib/constants";
import { Upload, FileText, X, Loader2, Check } from "lucide-react";
import { TemplateThumbnail } from "@/components/dashboard/template-thumbnail";
import { templateLabelsMap } from "../../lib/template-labels";
import type { DesktopDocumentDetail } from "../../lib/desktop-api";
import { getDesktopAiRuntimeConfig } from "../editor/ai-dialog-helpers";
import {
  importResumeFromFile,
  MAX_RESUME_IMPORT_FILE_SIZE_BYTES,
  ResumeImportError,
  type ResumeImportProgress,
  type ResumeImportStage,
  resolveResumeImportMimeType,
} from "../../lib/resume-import";

interface CreateResumeDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: {
    title?: string;
    template?: string;
    language?: string;
  }) => Promise<DesktopDocumentDetail | null>;
  onCreated?: (document: DesktopDocumentDetail) => void;
}

type Tab = "template" | "upload";

const ACCEPTED_EXTENSIONS = ".pdf,.png,.jpg,.jpeg,.webp";

const IMPORT_STAGE_SEQUENCE: ResumeImportStage[] = [
  "validating",
  "extracting",
  "rendering",
  "parsing",
  "saving",
];

const IMPORT_STAGE_PROGRESS_RANGES: Record<
  ResumeImportStage,
  { start: number; end: number }
> = {
  validating: { start: 0, end: 12 },
  extracting: { start: 12, end: 44 },
  rendering: { start: 44, end: 72 },
  parsing: { start: 72, end: 90 },
  saving: { start: 90, end: 100 },
};

function calculateImportProgressPercent(progress: ResumeImportProgress | null): number {
  if (!progress) {
    return 0;
  }

  const range = IMPORT_STAGE_PROGRESS_RANGES[progress.stage];
  const total = progress.total > 0 ? progress.total : 1;
  const ratio = Math.max(0, Math.min(progress.completed / total, 1));

  return Math.round(range.start + (range.end - range.start) * ratio);
}

function getImportStageStatus(
  currentStage: ResumeImportStage,
  stage: ResumeImportStage,
): "completed" | "current" | "pending" {
  const currentIndex = IMPORT_STAGE_SEQUENCE.indexOf(currentStage);
  const stageIndex = IMPORT_STAGE_SEQUENCE.indexOf(stage);

  if (stageIndex < currentIndex) {
    return "completed";
  }

  if (stageIndex === currentIndex) {
    return "current";
  }

  return "pending";
}

function normalizeCreateErrorMessage(
  error: unknown,
  fallback: string,
  options?: {
    visionModelRequiredForImage?: string;
    visionModelRequiredForScannedPdf?: string;
  },
): string {
  if (error instanceof ResumeImportError) {
    if (error.code === "vision_model_required_for_image") {
      return options?.visionModelRequiredForImage || fallback;
    }

    if (error.code === "vision_model_required_for_scanned_pdf") {
      return options?.visionModelRequiredForScannedPdf || fallback;
    }
  }

  if (typeof error === "string") {
    if (error.includes("__TAURI_INTERNALS__")) {
      return "当前不是 Tauri 桌面运行时，不能创建本地简历。请在桌面应用窗口中操作。";
    }
    return error;
  }

  if (error instanceof Error) {
    if (error.message.includes("__TAURI_INTERNALS__")) {
      return "当前不是 Tauri 桌面运行时，不能创建本地简历。请在桌面应用窗口中操作。";
    }
    return error.message;
  }

  return fallback;
}

export function CreateResumeDialog({
  open,
  onClose,
  onCreate,
  onCreated,
}: CreateResumeDialogProps) {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<Tab>("template");
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState<string>("classic");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [importProgress, setImportProgress] = useState<ResumeImportProgress | null>(null);
  const [resumeImportVisionModel, setResumeImportVisionModel] = useState("");
  const [isLoadingImportConfig, setIsLoadingImportConfig] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setIsLoadingImportConfig(true);
    void (async () => {
      try {
        const runtimeConfig = await getDesktopAiRuntimeConfig();
        setResumeImportVisionModel(runtimeConfig.resumeImportVisionModel || "");
      } catch {
        setResumeImportVisionModel("");
      } finally {
        setIsLoadingImportConfig(false);
      }
    })();
  }, [open]);

  const resetAndClose = () => {
    setTitle("");
    setTemplate("classic");
    setFile(null);
    setParseError("");
    setCreateError("");
    setImportProgress(null);
    setTab("template");
    onClose();
  };

  const handleCreate = async () => {
    setIsCreating(true);
    setCreateError("");
    try {
      const document = await onCreate({ title: title || undefined, template });
      if (document) {
        resetAndClose();
        onCreated?.(document);
      } else {
        setCreateError(t("importError"));
      }
    } catch (error) {
      console.error("Failed to create desktop document:", error);
      setCreateError(normalizeCreateErrorMessage(error, t("importError")));
    } finally {
      setIsCreating(false);
    }
  };

  const handleFileSelect = (selectedFile: File) => {
    setParseError("");
    setImportProgress(null);
    if (!resolveResumeImportMimeType(selectedFile)) {
      setParseError(t("dashboardUploadInvalidType"));
      return;
    }
    if (selectedFile.size > MAX_RESUME_IMPORT_FILE_SIZE_BYTES) {
      setParseError(t("dashboardUploadFileTooLarge"));
      return;
    }
    setFile(selectedFile);
  };

  const handleUploadParse = async () => {
    if (!file) return;
    setIsParsing(true);
    setParseError("");

    try {
      const document = await importResumeFromFile({
        file,
        template,
        language: i18n.language.toLowerCase().startsWith("zh") ? "zh" : "en",
        onProgress: setImportProgress,
      });

      if (document) {
        resetAndClose();
        onCreated?.(document);
      }
    } catch (error) {
      setParseError(
        normalizeCreateErrorMessage(error, t("dashboardUploadParseFailed"), {
          visionModelRequiredForImage: t("dashboard.upload.imageNeedsVisionModel"),
          visionModelRequiredForScannedPdf: t(
            "dashboard.upload.scannedPdfNeedsVisionModel",
          ),
        }),
      );
    } finally {
      setIsParsing(false);
      setImportProgress(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const selectedMimeType = file ? resolveResumeImportMimeType(file) : null;
  const hasVisionModel = resumeImportVisionModel.trim().length > 0;
  const isImageResume =
    selectedMimeType !== null && selectedMimeType !== "application/pdf";
  const uploadBlockedByMissingVisionModel =
    isImageResume && !hasVisionModel && !isLoadingImportConfig;
  const importProgressPercent = calculateImportProgressPercent(importProgress);

  const currentStageLabel = importProgress
    ? t(`dashboard.upload.progress.${importProgress.stage}`)
    : "";
  const currentStageDescription = importProgress
    ? importProgress.stage === "extracting" || importProgress.stage === "rendering"
      ? t("dashboard.upload.progress.pageProgress", {
          completed: importProgress.completed,
          total: importProgress.total,
        })
      : t(`dashboard.upload.progress.${importProgress.stage}Description`)
    : "";

  if (!open) return null;

  return (
    <div className="dialog-backdrop" onClick={!isCreating && !isParsing ? resetAndClose : undefined}>
      <div
        className="dialog-content flex max-h-[90vh] max-w-5xl flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="dialog-header">
          <h2 className="dialog-title">{t("dashboardCreateResume")}</h2>
          <button
            type="button"
            className="dialog-close"
            onClick={resetAndClose}
            disabled={isCreating || isParsing}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="dialog-tabs">
          <button
            type="button"
            className={`dialog-tab ${tab === "template" ? "dialog-tab--active" : ""}`}
            onClick={() => setTab("template")}
            disabled={isCreating || isParsing}
          >
            <FileText className="h-4 w-4" />
            {t("dashboardUploadFromTemplate")}
          </button>
          <button
            type="button"
            className={`dialog-tab ${tab === "upload" ? "dialog-tab--active" : ""}`}
            onClick={() => setTab("upload")}
            disabled={isCreating || isParsing}
          >
            <Upload className="h-4 w-4" />
            {t("dashboardUploadFromFile")}
          </button>
        </div>

        {/* Content */}
        <div className="dialog-body flex-1 overflow-y-auto">
          {tab === "template" ? (
            <div className="space-y-4">
              {/* Title input */}
              <div className="form-field">
                <label className="form-label">{t("editorFieldsFullName")}</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("dashboardCreateResumeDescription")}
                  onKeyDown={(e) => e.key === "Enter" && !isCreating && void handleCreate()}
                />
              </div>

              {/* Template selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t("templatesTitle")}</label>
                <div className="max-h-[400px] overflow-y-auto pr-1">
                  <div className="grid grid-cols-3 gap-3 md:grid-cols-4 xl:grid-cols-5">
                    {TEMPLATES.map((tId) => (
                      <button
                        key={tId}
                        type="button"
                        className={`relative flex flex-col items-center overflow-hidden rounded-lg border-2 p-2 transition-all ${
                          template === tId
                            ? "border-pink-500 bg-pink-50 dark:bg-pink-950/20"
                            : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"
                        }`}
                        onClick={() => setTemplate(tId)}
                      >
                        <div className="aspect-[3/4] w-full overflow-hidden rounded">
                          <TemplateThumbnail template={tId} className="h-full w-full" />
                        </div>
                        <span className="mt-1.5 truncate text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                          {t(templateLabelsMap[tId] || "templateClassic")}
                        </span>
                        {template === tId && (
                          <div className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-pink-500 text-white">
                            <Check className="h-2.5 w-2.5" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {createError ? <p className="form-error">{createError}</p> : null}
            </div>
          ) : (
            <div className="space-y-4">
              {isParsing ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {t("dashboard.upload.progress.title")}
                        </p>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
                          {t("dashboard.upload.progress.description")}
                        </p>
                      </div>
                      <Loader2 className="h-5 w-5 shrink-0 animate-spin text-pink-500" />
                    </div>

                    <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950/80">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-pink-500" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {importProgress?.fileName || file?.name}
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            {currentStageDescription}
                          </p>
                        </div>
                        <span className="text-xs font-medium text-zinc-400">
                          {importProgressPercent}%
                        </span>
                      </div>

                      <div className="mt-4 space-y-2">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">
                            {currentStageLabel}
                          </span>
                          {importProgress ? (
                            <span className="text-xs text-zinc-400">
                              {importProgress.completed}/{importProgress.total}
                            </span>
                          ) : null}
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                          <div
                            className="h-full bg-pink-500 transition-all duration-300"
                            style={{ width: `${importProgressPercent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                    {IMPORT_STAGE_SEQUENCE.map((stage) => {
                      const stageStatus = importProgress
                        ? getImportStageStatus(importProgress.stage, stage)
                        : "pending";

                      return (
                        <div
                          key={stage}
                          className={`rounded-xl border px-3 py-3 text-sm transition-all ${
                            stageStatus === "completed"
                              ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-300"
                              : stageStatus === "current"
                                ? "border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-900/60 dark:bg-pink-950/30 dark:text-pink-300"
                                : "border-zinc-200 bg-white text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500"
                          }`}
                        >
                          <div className="font-medium">
                            {t(`dashboard.upload.progress.${stage}`)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <>
                  {/* File upload area */}
                  <div
                    className={`upload-area ${isDragging ? "upload-area--dragging" : ""} ${file ? "upload-area--has-file" : ""}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPTED_EXTENSIONS}
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                    />
                    {file ? (
                      <div className="upload-file-info">
                        <FileText className="h-8 w-8 text-pink-500" />
                        <span className="upload-file-name">{file.name}</span>
                        <button
                          type="button"
                          className="upload-file-remove"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFile(null);
                            setParseError("");
                            setImportProgress(null);
                          }}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <Upload className="h-12 w-12 text-zinc-400" />
                        <p className="upload-hint">{t("dashboardUploadDropzone")}</p>
                        <p className="upload-subhint">{t("dashboardUploadAcceptedTypes")}</p>
                      </>
                    )}
                  </div>

                  {file && (
                    <div className="space-y-2">
                      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
                        {isLoadingImportConfig
                          ? t("dashboard.upload.loadingImportConfig")
                          : selectedMimeType === "application/pdf"
                          ? t("dashboard.upload.pdfVisionHint")
                          : uploadBlockedByMissingVisionModel
                            ? t("dashboard.upload.imageNeedsVisionModel")
                            : t("dashboard.upload.imageWillUseVisionModel", {
                                model: resumeImportVisionModel,
                              })}
                      </div>

                      {uploadBlockedByMissingVisionModel ? (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          {t("dashboard.upload.configureVisionModelHint")}
                        </p>
                      ) : null}
                    </div>
                  )}

                  {parseError && <p className="form-error">{parseError}</p>}

                  {/* Template for upload */}
                  {file && (
                    <div className="form-field">
                      <label className="form-label">{t("templatesTitle")}</label>
                      <div className="grid grid-cols-3 gap-3 md:grid-cols-4 xl:grid-cols-5">
                        {TEMPLATES.slice(0, 10).map((tId) => (
                          <button
                            key={tId}
                            type="button"
                            className={`template-option ${template === tId ? "template-option--active" : ""}`}
                            onClick={() => setTemplate(tId)}
                          >
                            <TemplateThumbnail template={tId} className="mx-auto" />
                            <span className="template-option-label">
                              {t(templateLabelsMap[tId] || "templateClassic")}
                            </span>
                            {template === tId && (
                              <div className="template-option-check">
                                <Check className="h-3 w-3" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="dialog-footer">
          <Button variant="secondary" onClick={resetAndClose} disabled={isCreating || isParsing}>
            {t("commonCancel")}
          </Button>
          {tab === "template" ? (
            <Button onClick={() => void handleCreate()} disabled={isCreating}>
              {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isCreating ? t("commonLoading") : t("commonCreate")}
            </Button>
          ) : (
            <Button
              onClick={() => void handleUploadParse()}
              disabled={!file || isParsing || (isImageResume && (isLoadingImportConfig || uploadBlockedByMissingVisionModel))}
            >
              {isParsing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isParsing ? t("dashboardUploadParsing") : t("dashboardUploadUploadAndParse")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
