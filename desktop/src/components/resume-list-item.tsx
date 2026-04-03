import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Copy, Trash2, MoreVertical, Pencil } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { templateLabelsMap } from "../lib/template-labels";
import type { Resume } from "../types/resume";

interface ResumeListItemProps {
  resume: Resume;
  onDelete: () => void;
  onDuplicate: () => void;
  onRename: (title: string) => void;
}

export function ResumeListItem({ resume, onDelete, onDuplicate, onRename }: ResumeListItemProps) {
  const { t } = useTranslation();
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(resume.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const renamingRef = useRef(false);

  const startRenaming = () => {
    renamingRef.current = true;
    setIsRenaming(true);
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
      className={`group flex items-center gap-4 rounded-xl border border-zinc-200 bg-white px-4 py-3 transition-all duration-200 dark:border-zinc-700/60 dark:bg-card ${isRenaming ? "" : "cursor-pointer hover:shadow-md hover:-translate-y-0.5"}`}
    >
      {/* Title */}
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
          <>
            <Link to="/editor/$id" params={{ id: resume.id }}>
              <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100 hover:text-pink-600">
                {resume.title}
              </h3>
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="shrink-0 inline-flex items-center rounded-full bg-zinc-100 px-1.5 py-0 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {templateLabel}
              </span>
              {resume.targetJobTitle && (
                <span className="inline-flex items-center rounded-full bg-pink-50 px-1.5 py-0 text-[11px] font-medium text-pink-700 dark:bg-pink-950/30 dark:text-pink-300">
                  {resume.targetJobTitle}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Last edited */}
      <span className="hidden shrink-0 text-[12px] text-zinc-400 sm:inline dark:text-zinc-500">
        {resume.updatedAt
          ? t("dashboardLastEdited", {
              date: new Date(resume.updatedAt).toLocaleDateString(),
            })
          : ""}
      </span>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="cursor-pointer rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-4 w-4 text-zinc-400" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onCloseAutoFocus={(e) => {
            if (renamingRef.current) e.preventDefault();
          }}
        >
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              startRenaming();
            }}
          >
            <Pencil className="h-4 w-4" />
            {t("commonRename")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
          >
            <Copy className="h-4 w-4" />
            {t("commonDuplicate")}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="h-4 w-4" />
            {t("commonDelete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
