import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Undo2,
  Redo2,
  Download,
  Upload,
  Settings,
  Palette,
  Save,
  FileSearch,
  Languages,
  FileText,
  SpellCheck,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useEditorStore } from "../../stores/editor-store";
import { useResumeStore } from "../../stores/resume-store";
import { useUIStore } from "../../stores/ui-store";
import { getWorkspaceSettingsSnapshot } from "../../lib/desktop-api";
import { ExportDialog } from "./export-dialog";
import { SettingsDialog } from "./settings-dialog";
import { JdAnalysisDialog } from "./jd-analysis-dialog";
import { TranslateDialog } from "./translate-dialog";
import { CoverLetterDialog } from "./cover-letter-dialog";
import { GrammarCheckDialog } from "./grammar-check-dialog";

export function EditorToolbar() {
  const { t } = useTranslation();
  const { toggleThemeEditor, showThemeEditor, undo, redo, undoStack, redoStack } =
    useEditorStore();
  const { isSaving, isDirty, currentResume, restoreSections, save } = useResumeStore();
  const { activeModal, openModal, closeModal } = useUIStore();
  const [autoSave, setAutoSave] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    void getWorkspaceSettingsSnapshot()
      .then((settings) => {
        if (!isCancelled) {
          setAutoSave(settings.editor?.autoSave ?? true);
        }
      })
      .catch(() => undefined);

    return () => {
      isCancelled = true;
    };
  }, []);

  const handleUndo = () => {
    const snapshot = undo();
    if (snapshot) {
      restoreSections(snapshot.sections);
    }
  };

  const handleRedo = () => {
    const snapshot = redo();
    if (snapshot) {
      restoreSections(snapshot.sections);
    }
  };

  const resumeId = currentResume?.id || "";

  return (
    <>
      <div className="flex h-12 items-center justify-between border-b bg-white px-3 dark:bg-background dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="cursor-pointer gap-1 text-zinc-600"
          >
            <Link to="/dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <span className="max-w-48 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {currentResume?.title || ""}
          </span>
          <span className="text-xs text-zinc-400">
            {isSaving
              ? t("editor.toolbar.saving")
              : isDirty
                ? autoSave
                  ? ""
                  : t("editor.toolbar.unsaved")
                : t("editor.toolbar.autoSaved")}
          </span>
          {!autoSave && isDirty && !isSaving && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => save()}
              className="cursor-pointer gap-1 text-pink-600 hover:text-pink-700 hover:bg-pink-50"
            >
              <Save className="h-3.5 w-3.5" />
              <span className="text-xs">{t("editor.toolbar.save")}</span>
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className="cursor-pointer"
            title={t("editor.toolbar.undo")}
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className="cursor-pointer"
            title={t("editor.toolbar.redo")}
          >
            <Redo2 className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <Button
            data-tour="export"
            variant="ghost"
            size="sm"
            onClick={() => openModal("export")}
            className="cursor-pointer"
            title={t("editor.toolbar.exportPdf")}
          >
            <Download className="h-4 w-4" />
            <span className="ml-1 text-xs hidden sm:inline">
              {t("editor.toolbar.exportPdf")}
            </span>
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openModal("jd-analysis")}
            className="cursor-pointer"
            title={t("editor.toolbar.jdAnalysis")}
          >
            <FileSearch className="h-4 w-4" />
            <span className="ml-1 text-xs hidden sm:inline">
              {t("editor.toolbar.jdAnalysis")}
            </span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openModal("translate")}
            className="cursor-pointer"
            title={t("editor.toolbar.translate")}
          >
            <Languages className="h-4 w-4" />
            <span className="ml-1 text-xs hidden sm:inline">
              {t("editor.toolbar.translate")}
            </span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openModal("cover-letter")}
            className="cursor-pointer"
            title={t("editor.toolbar.coverLetter")}
          >
            <FileText className="h-4 w-4" />
            <span className="ml-1 text-xs hidden sm:inline">
              {t("editor.toolbar.coverLetter")}
            </span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openModal("grammar-check")}
            className="cursor-pointer"
            title={t("editor.toolbar.grammarCheck")}
          >
            <SpellCheck className="h-4 w-4" />
            <span className="ml-1 text-xs hidden sm:inline">
              {t("editor.toolbar.grammarCheck")}
            </span>
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <Button
            data-tour="theme"
            variant={showThemeEditor ? "secondary" : "ghost"}
            size="sm"
            onClick={toggleThemeEditor}
            className="cursor-pointer"
            title={t("editor.toolbar.theme")}
          >
            <Palette className="h-4 w-4" />
            <span className="ml-1 text-xs hidden sm:inline">
              {t("editor.toolbar.theme")}
            </span>
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openModal("settings")}
            className="cursor-pointer"
            title={t("editor.toolbar.settings")}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Export Dialog */}
      <ExportDialog
        open={activeModal === "export"}
        onClose={closeModal}
        resumeId={resumeId}
      />

      {/* Settings Dialog */}
      <SettingsDialog
        open={activeModal === "settings"}
        onClose={closeModal}
      />

      {/* JD Analysis Dialog */}
      <JdAnalysisDialog
        open={activeModal === "jd-analysis"}
        onClose={closeModal}
        resumeId={resumeId}
      />

      {/* Translate Dialog */}
      <TranslateDialog
        open={activeModal === "translate"}
        onClose={closeModal}
        resumeId={resumeId}
      />

      {/* Cover Letter Dialog */}
      <CoverLetterDialog
        open={activeModal === "cover-letter"}
        onClose={closeModal}
        resumeId={resumeId}
      />

      {/* Grammar Check Dialog */}
      <GrammarCheckDialog
        open={activeModal === "grammar-check"}
        onClose={closeModal}
        resumeId={resumeId}
      />
    </>
  );
}
