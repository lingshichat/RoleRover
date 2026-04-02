import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TEMPLATES } from "@/lib/constants";
import { Upload, FileText, X, Loader2, Check } from "lucide-react";
import { TemplateThumbnail } from "@/components/dashboard/template-thumbnail";
import { templateLabelsMap } from "../../lib/template-labels";
import type { DesktopDocumentDetail } from "../../lib/desktop-api";

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

function normalizeCreateErrorMessage(error: unknown, fallback: string): string {
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetAndClose = () => {
    setTitle("");
    setTemplate("classic");
    setFile(null);
    setParseError("");
    setCreateError("");
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
    const validTypes = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
    if (!validTypes.includes(selectedFile.type)) {
      setParseError(t("dashboardUploadInvalidType"));
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
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
      const document = await onCreate({
        title: file.name.replace(/\.[^/.]+$/, ""),
        template,
        language: i18n.language.toLowerCase().startsWith("zh") ? "zh" : "en",
      });

      if (document) {
        resetAndClose();
      }
    } catch (error) {
      setParseError(
        error instanceof Error ? error.message : t("dashboardUploadParseFailed"),
      );
    } finally {
      setIsParsing(false);
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

  if (!open) return null;

  return (
    <div className="dialog-backdrop" onClick={resetAndClose}>
      <div
        className="dialog-content flex max-h-[90vh] max-w-5xl flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="dialog-header">
          <h2 className="dialog-title">{t("dashboardCreateResume")}</h2>
          <button type="button" className="dialog-close" onClick={resetAndClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="dialog-tabs">
          <button
            type="button"
            className={`dialog-tab ${tab === "template" ? "dialog-tab--active" : ""}`}
            onClick={() => setTab("template")}
          >
            <FileText className="h-4 w-4" />
            {t("dashboardUploadFromTemplate")}
          </button>
          <button
            type="button"
            className={`dialog-tab ${tab === "upload" ? "dialog-tab--active" : ""}`}
            onClick={() => setTab("upload")}
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
            <Button onClick={() => void handleUploadParse()} disabled={!file || isParsing}>
              {isParsing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isParsing ? t("dashboardUploadParsing") : t("dashboardUploadUploadAndParse")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
