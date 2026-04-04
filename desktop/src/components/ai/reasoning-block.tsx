"use client";

import { useMemo, useState } from "react";
import { Brain, ChevronDown, ChevronRight } from "lucide-react";

interface ReasoningBlockProps {
  label: string;
  content: string;
  defaultOpen?: boolean;
}

export function ReasoningBlock({
  label,
  content,
  defaultOpen = false,
}: ReasoningBlockProps) {
  const [open, setOpen] = useState(defaultOpen);

  const preview = useMemo(() => {
    const compact = content.replace(/\s+/gu, " ").trim();
    if (compact.length <= 72) {
      return compact;
    }
    return `${compact.slice(0, 72).trim()}...`;
  }, [content]);

  if (!content.trim()) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white/70 ring-1 ring-zinc-200/60">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-zinc-600 transition-colors hover:bg-zinc-50"
        onClick={() => setOpen((current) => !current)}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        <Brain className="h-3.5 w-3.5 shrink-0 text-pink-500" />
        <span className="shrink-0 font-medium text-zinc-700">{label}</span>
        {!open && preview ? (
          <span className="min-w-0 truncate text-zinc-400">{preview}</span>
        ) : null}
      </button>
      {open ? (
        <div className="border-t border-zinc-200 bg-zinc-50 px-3 py-2">
          <pre className="whitespace-pre-wrap break-words font-sans text-[12px] leading-relaxed text-zinc-600">
            {content}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
