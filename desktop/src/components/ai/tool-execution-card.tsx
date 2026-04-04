"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Play,
  Terminal,
  XCircle,
} from "lucide-react";

export type ToolExecutionState =
  | "input-streaming"
  | "output-available"
  | "output-error";

interface ToolExecutionCardProps {
  toolName: string;
  state: ToolExecutionState;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  callingLabel: string;
  resultLabel: string;
  resultErrorLabel: string;
}

interface CollapsibleBlockProps {
  label: string;
  content: string;
  defaultOpen?: boolean;
  icon: ReactNode;
  statusIcon?: ReactNode;
}

function formatToolName(toolName: string): string {
  if (!toolName) {
    return "tool";
  }

  return toolName
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function stringifyToolPayload(payload: unknown, fallback: string): string {
  if (payload === undefined || payload === null) {
    return fallback;
  }

  if (typeof payload === "string") {
    return payload;
  }

  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return fallback;
  }
}

function CollapsibleBlock({
  label,
  content,
  defaultOpen = false,
  icon,
  statusIcon,
}: CollapsibleBlockProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-md border border-zinc-200 bg-zinc-50">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] font-medium text-zinc-500 hover:bg-zinc-100"
        onClick={() => setOpen((previous) => !previous)}
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        {icon}
        <span>{label}</span>
        {statusIcon ? <span className="ml-auto">{statusIcon}</span> : null}
      </button>
      {open ? (
        <div className="border-t border-zinc-200 bg-zinc-900 px-3 py-2">
          <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-zinc-300">
            {content}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

export function ToolExecutionCard({
  toolName,
  state,
  input,
  output,
  errorText,
  callingLabel,
  resultLabel,
  resultErrorLabel,
}: ToolExecutionCardProps) {
  const formattedToolName = useMemo(() => formatToolName(toolName), [toolName]);
  const inputText = useMemo(() => stringifyToolPayload(input, "{}"), [input]);
  const resultText = useMemo(() => {
    if (state === "output-error") {
      return errorText || resultErrorLabel;
    }

    return stringifyToolPayload(output, "{}");
  }, [errorText, output, resultErrorLabel, state]);

  const isCompleted = state === "output-available";
  const isError = state === "output-error";

  return (
    <div className="space-y-1.5 text-xs">
      <CollapsibleBlock
        label={`${callingLabel} ${formattedToolName}`}
        content={inputText}
        icon={
          isCompleted || isError ? (
            <Terminal className="h-3 w-3 shrink-0" />
          ) : (
            <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-[1.5px] border-zinc-300 border-t-zinc-600" />
          )
        }
      />
      {isCompleted || isError ? (
        <CollapsibleBlock
          label={resultLabel}
          content={resultText}
          icon={<Play className="h-3 w-3 shrink-0" />}
          statusIcon={
            isCompleted ? (
              <CheckCircle2 className="h-3 w-3 text-green-500" />
            ) : (
              <XCircle className="h-3 w-3 text-red-500" />
            )
          }
        />
      ) : null}
    </div>
  );
}
