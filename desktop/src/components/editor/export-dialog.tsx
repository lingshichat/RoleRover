import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  AlignLeft,
  Braces,
  CheckCircle2,
  FileDown,
  FileText,
  Globe,
  Info,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useResumeStore } from "../../stores/resume-store";
import type { ResumeSection } from "../../types/resume";
import {
  writeTemplateValidationExport,
  type TemplateValidationDocument,
} from "../../lib/desktop-api";
import { buildTemplateValidationDocumentHtml } from "../../lib/template-validation";

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  resumeId: string;
}

type ExportFormat = "pdf" | "pdf-one-page" | "docx" | "html" | "txt" | "json";
type ExportState = "idle" | "exporting" | "success" | "error" | "cancelled";

interface NativeDialogSaveOptions {
  defaultPath?: string;
  filters?: Array<{
    name: string;
    extensions: string[];
  }>;
}

interface NativeDialogModule {
  save: (
    options: NativeDialogSaveOptions,
  ) => Promise<string | string[] | null>;
}

interface FormatOption {
  value: ExportFormat;
  icon: typeof FileDown;
  labelKey: string;
  descKey: string;
  supported: boolean;
  extension: string;
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    value: "pdf",
    icon: FileDown,
    labelKey: "pdf",
    descKey: "pdfDescription",
    supported: false,
    extension: "pdf",
  },
  {
    value: "pdf-one-page",
    icon: Sparkles,
    labelKey: "pdfOnePage",
    descKey: "pdfOnePageDescription",
    supported: false,
    extension: "pdf",
  },
  {
    value: "docx",
    icon: FileText,
    labelKey: "docx",
    descKey: "docxDescription",
    supported: false,
    extension: "docx",
  },
  {
    value: "html",
    icon: Globe,
    labelKey: "html",
    descKey: "htmlDescription",
    supported: true,
    extension: "html",
  },
  {
    value: "txt",
    icon: AlignLeft,
    labelKey: "txt",
    descKey: "txtDescription",
    supported: true,
    extension: "txt",
  },
  {
    value: "json",
    icon: Braces,
    labelKey: "json",
    descKey: "jsonDescription",
    supported: true,
    extension: "json",
  },
];

function sanitizeFileName(raw: string): string {
  const sanitized = raw.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-");
  return sanitized || "resume";
}

function formatTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  const seconds = `${date.getSeconds()}`.padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function stringifyValue(value: unknown, depth = 0): string[] {
  const prefix = "  ".repeat(depth);

  if (value == null) {
    return [];
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed.split("\n").map((line) => `${prefix}${line}`) : [];
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [`${prefix}${String(value)}`];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const lines = stringifyValue(item, depth + 1);
      if (lines.length === 0) {
        return [];
      }

      const [first, ...rest] = lines;
      return [`${prefix}- ${first.trimStart()}`, ...rest];
    });
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => {
      const lines = stringifyValue(nested, depth + 1);
      if (lines.length === 0) {
        return [];
      }

      if (lines.length === 1) {
        return [`${prefix}${key}: ${lines[0].trimStart()}`];
      }

      return [`${prefix}${key}:`, ...lines];
    });
  }

  return [`${prefix}${String(value)}`];
}

function buildTextExport(document: TemplateValidationDocument): string {
  const lines: string[] = [document.metadata.title, ""];

  if (document.metadata.targetJobTitle || document.metadata.targetCompany) {
    lines.push(
      [document.metadata.targetJobTitle, document.metadata.targetCompany]
        .filter(Boolean)
        .join(" @ "),
    );
    lines.push("");
  }

  document.sections
    .filter((section) => section.visible)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .forEach((section) => {
      lines.push(section.title);
      lines.push("-".repeat(section.title.length));
      lines.push(...stringifyValue(section.content));
      lines.push("");
    });

  return lines.join("\n").trim();
}

function toTemplateValidationDocument(
  title: string,
  language: string,
  template: string,
  isDefault: boolean,
  targetJobTitle: string | null | undefined,
  targetCompany: string | null | undefined,
  theme: {
    primaryColor: string;
    accentColor: string;
    fontFamily: string;
    fontSize: string;
    lineSpacing: number;
    margin: { top: number; right: number; bottom: number; left: number };
    sectionSpacing: number;
    avatarStyle?: string;
  },
  sections: ResumeSection[],
  resumeId: string,
): TemplateValidationDocument {
  return {
    metadata: {
      id: resumeId,
      title,
      template,
      language,
      targetJobTitle,
      targetCompany,
      isDefault,
      isSample: false,
      createdAtEpochMs: Date.now(),
      updatedAtEpochMs: Date.now(),
    },
    theme: {
      primaryColor: theme.primaryColor,
      accentColor: theme.accentColor,
      fontFamily: theme.fontFamily,
      fontSize: theme.fontSize,
      lineSpacing: theme.lineSpacing,
      margin: theme.margin,
      sectionSpacing: theme.sectionSpacing,
      avatarStyle: (theme.avatarStyle || "circle") as "circle" | "oneInch",
    },
    sections: sections.map((section, index) => ({
      id: section.id,
      documentId: resumeId,
      sectionType: section.type as TemplateValidationDocument["sections"][number]["sectionType"],
      title: section.title,
      sortOrder: section.sortOrder ?? index,
      visible: section.visible,
      content: section.content as unknown as Record<string, unknown>,
      createdAtEpochMs: typeof section.createdAt === "string"
        ? new Date(section.createdAt).getTime()
        : Date.now(),
      updatedAtEpochMs: typeof section.updatedAt === "string"
        ? new Date(section.updatedAt).getTime()
        : Date.now(),
    })),
  };
}

async function openNativeSaveDialog(
  options: NativeDialogSaveOptions,
): Promise<string | string[] | null> {
  const moduleSpecifier = "@tauri-apps/plugin-dialog";

  try {
    const dialogModule = (await import(moduleSpecifier)) as NativeDialogModule;
    if (typeof dialogModule.save !== "function") {
      throw new Error("save() is unavailable.");
    }

    return dialogModule.save(options);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Native save dialog is unavailable: ${reason}`);
  }
}

export function ExportDialog({ open, onClose, resumeId }: ExportDialogProps) {
  const { t, i18n } = useTranslation();
  const { currentResume, isDirty, save, sections } = useResumeStore();

  const translate = useCallback(
    (key: string, fallback: string) => {
      const value = t(key);
      return value === key ? fallback : value;
    },
    [t],
  );

  const isZh = i18n.language.startsWith("zh");
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("pdf");
  const [state, setState] = useState<ExportState>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [savedPath, setSavedPath] = useState("");

  useEffect(() => {
    if (open) {
      setSelectedFormat("pdf");
      setState("idle");
      setStatusMessage("");
      setSavedPath("");
    }
  }, [open]);

  const selectedOption = useMemo(
    () =>
      FORMAT_OPTIONS.find((option) => option.value === selectedFormat) ??
      FORMAT_OPTIONS[0],
    [selectedFormat],
  );

  const capabilityBadge = selectedOption.supported
    ? isZh
      ? "当前可导出"
      : "Available now"
    : isZh
      ? "桌面暂不支持"
      : "Not in desktop yet";

  const capabilityMessage = selectedOption.supported
    ? isZh
      ? "当前 desktop runtime 已经能真实写出这个格式文件，并通过原生保存路径落盘。"
      : "The current desktop runtime can write this format for real and save it through the native file picker."
    : isZh
      ? "这个格式在 web 有完整出口，但当前 desktop runtime 还没有对应原生导出链路，所以这里只展示状态，不会伪成功。"
      : "This format exists in the web product, but the current desktop runtime does not have a native export pipeline for it yet, so the dialog reports the gap instead of faking success.";

  const exportActionLabel =
    state === "exporting"
      ? translate("exporting", "Exporting...")
      : selectedOption.supported
        ? translate("export", "Export")
        : isZh
          ? "暂不可导出"
          : "Unavailable";

  const closeLabel =
    state === "success" || state === "cancelled"
      ? translate("close", "Close")
      : translate("exportCancel", "Cancel");

  const handleExport = useCallback(async () => {
    if (!currentResume) {
      setState("error");
      setStatusMessage(
        isZh ? "当前还没有可导出的简历内容。" : "There is no loaded resume to export yet.",
      );
      return;
    }

    if (!selectedOption.supported) {
      setState("error");
      setStatusMessage(capabilityMessage);
      return;
    }

    setState("exporting");
    setStatusMessage("");
    setSavedPath("");

    try {
      if (isDirty) {
        await save();
      }

      const document = toTemplateValidationDocument(
        currentResume.title || "Resume",
        currentResume.language || "en",
        currentResume.template || "classic",
        currentResume.isDefault,
        currentResume.targetJobTitle,
        currentResume.targetCompany,
        currentResume.themeConfig,
        sections,
        resumeId,
      );

      const fileBase = `${sanitizeFileName(currentResume.title || "resume")}-${formatTimestamp(
        new Date(),
      )}`;

      const content =
        selectedFormat === "html"
          ? buildTemplateValidationDocumentHtml(document)
          : selectedFormat === "json"
            ? JSON.stringify(document, null, 2)
            : buildTextExport(document);

      const defaultPath = `${fileBase}.${selectedOption.extension}`;
      const selectedOutputPath = await openNativeSaveDialog({
        defaultPath,
        filters: [
          {
            name: selectedOption.labelKey.toUpperCase(),
            extensions: [selectedOption.extension],
          },
        ],
      });

      const resolvedOutputPath = Array.isArray(selectedOutputPath)
        ? selectedOutputPath[0] ?? null
        : selectedOutputPath;

      if (!resolvedOutputPath) {
        setState("cancelled");
        setStatusMessage(
          isZh ? "保存对话框已关闭，没有写入任何文件。" : "The save dialog was closed and no file was written.",
        );
        return;
      }

      const receipt = await writeTemplateValidationExport({
        fileName: defaultPath,
        outputPath: resolvedOutputPath,
        html: content,
      });

      setState("success");
      setSavedPath(receipt.outputPath);
      setStatusMessage(
        isZh ? "文件已成功写入桌面导出路径。" : "The file was written successfully.",
      );
    } catch (error) {
      setState("error");
      setStatusMessage(
        error instanceof Error
          ? error.message
          : isZh
            ? "导出失败，请重试。"
            : "Export failed. Please try again.",
      );
    }
  }, [
    capabilityMessage,
    currentResume,
    isDirty,
    isZh,
    resumeId,
    save,
    sections,
    selectedFormat,
    selectedOption.extension,
    selectedOption.labelKey,
    selectedOption.supported,
  ]);

  if (!open) {
    return null;
  }

  return (
    <div className="dialog-backdrop" onClick={state !== "exporting" ? onClose : undefined}>
      <div
        className="dialog-content dialog-content--lg overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-header border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <FileDown className="h-5 w-5 text-pink-500" />
            <div>
              <h2 className="dialog-title">
                {translate("exportTitle", "Export Resume")}
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                {translate(
                  "exportDescription",
                  "Choose a format to export your resume",
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="dialog-close"
            onClick={onClose}
            disabled={state === "exporting"}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="dialog-body space-y-5">
          {state === "idle" ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {FORMAT_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const isSelected = option.value === selectedFormat;
                  const statusChip = option.supported
                    ? isZh
                      ? "可用"
                      : "Ready"
                    : isZh
                      ? "未支持"
                      : "Soon";

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSelectedFormat(option.value)}
                      className={`flex min-h-[128px] flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all duration-150 ${
                        isSelected
                          ? "border-pink-500 bg-pink-50"
                          : "border-zinc-200 bg-white hover:border-pink-300 hover:bg-pink-50/50"
                      }`}
                    >
                      <div className="flex w-full justify-end">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            option.supported
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {statusChip}
                        </span>
                      </div>
                      <Icon
                        className={`h-6 w-6 ${
                          isSelected ? "text-pink-500" : "text-zinc-500"
                        }`}
                      />
                      <span
                        className={`text-sm font-medium ${
                          isSelected ? "text-pink-600" : "text-zinc-700"
                        }`}
                      >
                        {translate(option.labelKey, option.labelKey.toUpperCase())}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {translate(option.descKey, "")}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div
                className={`rounded-2xl border px-4 py-3 ${
                  selectedOption.supported
                    ? "border-emerald-200 bg-emerald-50/70"
                    : "border-amber-200 bg-amber-50/80"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">
                      {translate(selectedOption.labelKey, selectedOption.labelKey)}
                    </p>
                    <p className="mt-1 text-sm text-zinc-600">
                      {translate(selectedOption.descKey, "")}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                      selectedOption.supported
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {capabilityBadge}
                  </span>
                </div>
                <div className="mt-3 flex items-start gap-2 text-[12px] leading-5 text-zinc-600">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{capabilityMessage}</span>
                </div>
              </div>
            </>
          ) : null}

          {state === "exporting" ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-pink-500" />
              <p className="text-sm font-medium text-zinc-700">
                {translate("exporting", "Exporting...")}
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                {isZh
                  ? "正在保存到你选择的桌面路径。"
                  : "Saving to the desktop path you selected."}
              </p>
            </div>
          ) : null}

          {state === "success" ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="mb-3 h-8 w-8 text-green-500" />
              <p className="text-sm font-medium text-zinc-700">{statusMessage}</p>
              {savedPath ? (
                <p className="mt-2 max-w-md break-all text-xs text-zinc-500">
                  {savedPath}
                </p>
              ) : null}
            </div>
          ) : null}

          {state === "cancelled" ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Info className="mb-3 h-8 w-8 text-amber-500" />
              <p className="text-sm font-medium text-zinc-700">{statusMessage}</p>
            </div>
          ) : null}

          {state === "error" ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="mb-3 h-8 w-8 text-red-500" />
              <p className="max-w-md text-sm font-medium text-red-600">
                {statusMessage}
              </p>
            </div>
          ) : null}
        </div>

        <div className="dialog-footer border-t border-zinc-100">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={state === "exporting"}
          >
            {closeLabel}
          </Button>
          {(state === "idle" || state === "error") && (
            <Button
              onClick={() => void handleExport()}
              disabled={!selectedOption.supported}
            >
              {exportActionLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
