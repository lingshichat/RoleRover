import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Undo2,
  Redo2,
  Download,
  Settings,
  Palette,
  Save,
  FileSearch,
  Languages,
  FileText,
  SpellCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useEditorStore } from "../../stores/editor-store";
import { useResumeStore } from "../../stores/resume-store";
import { ExportDialog } from "./export-dialog";
import { SettingsDialog } from "./settings-dialog";
import { JdAnalysisDialog } from "./jd-analysis-dialog";
import { TranslateDialog } from "./translate-dialog";
import { CoverLetterDialog } from "./cover-letter-dialog";
import { GrammarCheckDialog } from "./grammar-check-dialog";
import { getWorkspaceSettingsSnapshot } from "../../lib/desktop-api";

export function EditorToolbar() {
  const { t } = useTranslation();
  const { toggleThemeEditor, showThemeEditor, undo, redo, undoStack, redoStack } =
    useEditorStore();
  const { isSaving, isDirty, currentResume, save } = useResumeStore();
  const [autoSave, setAutoSave] = useState(true);

  // Dialog states
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [jdAnalysisDialogOpen, setJdAnalysisDialogOpen] = useState(false);
  const [translateDialogOpen, setTranslateDialogOpen] = useState(false);
  const [coverLetterDialogOpen, setCoverLetterDialogOpen] = useState(false);
  const [grammarCheckDialogOpen, setGrammarCheckDialogOpen] = useState(false);

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
      // Apply snapshot
    }
  };

  const handleRedo = () => {
    const snapshot = redo();
    if (snapshot) {
      // Apply snapshot
    }
  };

  const resumeId = currentResume?.id || "";

  return (
    <>
      <div className="flex h-12 items-center justify-between border-b bg-white px-3 dark:bg-zinc-900 dark:border-zinc-800">
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
            {currentResume?.title || t("editor.untitled")}
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
            onClick={() => setExportDialogOpen(true)}
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
            onClick={() => setJdAnalysisDialogOpen(true)}
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
            onClick={() => setTranslateDialogOpen(true)}
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
            onClick={() => setCoverLetterDialogOpen(true)}
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
            onClick={() => setGrammarCheckDialogOpen(true)}
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
            onClick={() => setSettingsDialogOpen(true)}
            className="cursor-pointer"
            title={t("editor.toolbar.settings")}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Export Dialog */}
      <ExportDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        resumeId={resumeId}
      />

      {/* Settings Dialog */}
      <SettingsDialog
        open={settingsDialogOpen}
        onClose={() => setSettingsDialogOpen(false)}
      />

      {/* JD Analysis Dialog */}
      <JdAnalysisDialog
        open={jdAnalysisDialogOpen}
        onClose={() => setJdAnalysisDialogOpen(false)}
        resumeId={resumeId}
      />

      {/* Translate Dialog */}
      <TranslateDialog
        open={translateDialogOpen}
        onClose={() => setTranslateDialogOpen(false)}
        resumeId={resumeId}
      />

      {/* Cover Letter Dialog */}
      <CoverLetterDialog
        open={coverLetterDialogOpen}
        onClose={() => setCoverLetterDialogOpen(false)}
        resumeId={resumeId}
      />

      {/* Grammar Check Dialog */}
      <GrammarCheckDialog
        open={grammarCheckDialogOpen}
        onClose={() => setGrammarCheckDialogOpen(false)}
        resumeId={resumeId}
      />
    </>
  );
}
