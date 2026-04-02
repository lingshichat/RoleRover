import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Copy, Trash2, MoreVertical, Pencil } from "lucide-react";
import { TemplateThumbnail } from "@/components/dashboard/template-thumbnail";
import { templateLabelsMap } from "../lib/template-labels";
import type { Resume } from "../types/resume";

interface ResumeCardProps {
  resume: Resume;
  onDelete: () => void;
  onDuplicate: () => void;
  onRename: (title: string) => void;
}

export function ResumeCard({ resume, onDelete, onDuplicate, onRename }: ResumeCardProps) {
  const { t } = useTranslation();
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(resume.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const renamingRef = useRef(false);

  const startRenaming = () => {
    renamingRef.current = true;
    setIsRenaming(true);
    setMenuOpen(false);
  };

  useEffect(() => {
    if (isRenaming) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [isRenaming]);

  const commitRename = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== resume.title) {
      onRename(trimmed);
    } else {
      setRenameValue(resume.title);
    }
    setIsRenaming(false);
    renamingRef.current = false;
  }, [renameValue, resume.title, onRename]);

  useEffect(() => {
    if (!isRenaming) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        commitRename();
      }
    };
    document.addEventListener("mousedown", handleMouseDown, true);
    return () => document.removeEventListener("mousedown", handleMouseDown, true);
  }, [isRenaming, commitRename]);

  const handleBlur = useCallback(() => {
    requestAnimationFrame(() => {
      if (renamingRef.current && inputRef.current) {
        inputRef.current.focus();
      }
    });
  }, []);

  const labelKey = templateLabelsMap[resume.template] || "dashboardTemplateClassic";
  const templateLabel = t(labelKey);

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border border-zinc-200 bg-white transition-all duration-200 dark:border-zinc-700/60 dark:bg-card ${isRenaming ? "" : "cursor-pointer hover:shadow-lg hover:-translate-y-0.5"}`}
    >
      {/* Template preview thumbnail */}
      <div className="relative border-b border-zinc-100 bg-zinc-50 p-2.5 dark:border-zinc-700/40 dark:bg-zinc-800/50">
        <TemplateThumbnail
          template={resume.template}
          className="mx-auto h-[100px] w-[71px] shadow-sm ring-1 ring-zinc-200/60"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all duration-200 group-hover:bg-black/5 dark:group-hover:bg-white/5" />
      </div>

      {/* Info section */}
      <div className="p-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {isRenaming ? (
              <input
                ref={inputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitRename();
                  }
                  if (e.key === "Escape") {
                    setRenameValue(resume.title);
                    setIsRenaming(false);
                    renamingRef.current = false;
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className="w-full truncate rounded border border-pink-300 bg-white px-1 text-sm font-semibold text-zinc-900 outline-none focus:ring-1 focus:ring-pink-400 dark:bg-zinc-800 dark:text-zinc-100"
              />
            ) : (
              <Link to="/editor/$id" params={{ id: resume.id }}>
                <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100 hover:text-pink-600">
                  {resume.title}
                </h3>
              </Link>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center rounded-full bg-zinc-100 px-1.5 py-0 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {templateLabel}
              </span>
              {resume.targetJobTitle && (
                <span className="inline-flex items-center rounded-full bg-pink-50 px-1.5 py-0 text-[11px] font-medium text-pink-700 dark:bg-pink-950/30 dark:text-pink-300">
                  {resume.targetJobTitle}
                </span>
              )}
              <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                {resume.updatedAt
                  ? t("dashboardLastEdited", {
                      date: new Date(resume.updatedAt).toLocaleDateString(),
                    })
                  : ""}
              </span>
            </div>
          </div>

          {/* Dropdown menu */}
          <div className="relative">
            <button
              type="button"
              className="cursor-pointer rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
            >
              <MoreVertical className="h-4 w-4 text-zinc-400" />
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      startRenaming();
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                    {t("commonRename")}
                  </button>
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onDuplicate();
                    }}
                  >
                    <Copy className="h-4 w-4" />
                    {t("commonDuplicate")}
                  </button>
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onDelete();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    {t("commonDelete")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
