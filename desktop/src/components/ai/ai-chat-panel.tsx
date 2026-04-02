import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Bot,
  Clock3,
  MessageSquare,
  Plus,
  SendHorizonal,
  Settings2,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SimpleSelect } from "../simple-select";
import { useEditorStore } from "../../stores/editor-store";
import { useResumeStore } from "../../stores/resume-store";
import {
  getSecretInventorySnapshot,
  getWorkspaceSettingsSnapshot,
  listenToAiStreamEvents,
  startAiPromptStream,
  type DesktopAiStreamEvent,
} from "../../lib/desktop-api";

interface AIChatPanelProps {
  resumeId: string;
}

interface AIChatContentProps {
  resumeId: string;
  hideTitle?: boolean;
}

type ChatRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  error?: boolean;
}

interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
}

interface RuntimeChatSettings {
  loading: boolean;
  provider: string;
  model: string;
  baseUrl: string;
  hasApiKey: boolean;
}

const SESSION_STORAGE_VERSION = 1;
const SESSION_STORAGE_PREFIX = "desktop-ai-chat-sessions";
const MODEL_OPTIONS: Record<string, string[]> = {
  openai: ["gpt-4o", "gpt-4.1", "gpt-4.1-mini"],
  anthropic: ["claude-sonnet-4-20250514", "claude-3-7-sonnet-latest"],
  gemini: ["gemini-2.0-flash", "gemini-1.5-pro"],
};

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function orderSessions(sessions: ChatSession[]): ChatSession[] {
  return [...sessions].sort((left, right) => right.updatedAt - left.updatedAt);
}

function createSession(title: string): ChatSession {
  return {
    id: createId("session"),
    title,
    updatedAt: Date.now(),
    messages: [],
  };
}

function getStorageKey(resumeId: string): string {
  return `${SESSION_STORAGE_PREFIX}:${resumeId}`;
}

function formatTime(epochMs: number): string {
  const date = new Date(epochMs);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}/${month}/${day} · ${hours}:${minutes}`;
}

function loadStoredSessions(resumeId: string): ChatSession[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(getStorageKey(resumeId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as {
      version?: number;
      sessions?: ChatSession[];
    };

    if (parsed.version !== SESSION_STORAGE_VERSION || !Array.isArray(parsed.sessions)) {
      return [];
    }

    return orderSessions(
      parsed.sessions.filter(
        (session): session is ChatSession =>
          typeof session?.id === "string" &&
          typeof session?.title === "string" &&
          typeof session?.updatedAt === "number" &&
          Array.isArray(session?.messages),
      ),
    );
  } catch {
    return [];
  }
}

function persistSessions(resumeId: string, sessions: ChatSession[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    getStorageKey(resumeId),
    JSON.stringify({
      version: SESSION_STORAGE_VERSION,
      sessions,
    }),
  );
}

function toSessionTitle(input: string, fallback: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return fallback;
  }

  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}...` : trimmed;
}

function buildFriendlyError(rawMessage: string, fallback: string): string {
  if (!rawMessage) {
    return fallback;
  }

  const normalized = rawMessage.toLowerCase();
  if (
    normalized.includes("api key") ||
    normalized.includes("credential") ||
    normalized.includes("secret")
  ) {
    return "AI runtime is missing a valid API key. Open Settings > AI and save the credential again.";
  }

  if (normalized.includes("429") || normalized.includes("rate")) {
    return "The current AI provider is rate limited right now. Wait a moment and try again.";
  }

  if (normalized.includes("timeout") || normalized.includes("timed out")) {
    return "The AI runtime timed out before completing the reply. Check the network or provider settings and retry.";
  }

  if (normalized.includes("network") || normalized.includes("connect")) {
    return "The desktop runtime could not reach the configured AI endpoint. Check Base URL, network access, and provider status.";
  }

  return rawMessage;
}

export function AIChatContent({
  resumeId,
  hideTitle = false,
}: AIChatContentProps) {
  const { t, i18n } = useTranslation();
  const { currentResume, sections } = useResumeStore();

  const translate = useCallback(
    (key: string, fallback: string) => {
      const value = t(key);
      return value === key ? fallback : value;
    },
    [t],
  );

  const isZh = i18n.language.startsWith("zh");
  const panelTitle = translate("aiPanelTitle", "AI Assistant");
  const defaultGreeting = translate(
    "aiDefaultGreeting",
    "Hi! I'm your resume optimization assistant. Which part of your resume would you like to improve?",
  );
  const placeholder = translate(
    "aiPlaceholder",
    "Describe what you want to improve...",
  );
  const thinkingLabel = translate("aiThinking", "AI is thinking...");
  const bubbleTooltip = translate("aiBubbleTooltip", "Chat with AI Assistant");
  const apiKeyMissingTitle = translate(
    "aiApiKeyMissing",
    "API Key Not Configured",
  );
  const apiKeyMissingHint = translate(
    "aiApiKeyMissingHint",
    "Please configure your AI API Key in Settings before using AI features.",
  );
  const newChatLabel = translate("aiNewChat", "New Chat");
  const genericError = translate(
    "aiErrorMessage",
    "Something went wrong. Please try again.",
  );

  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeChatSettings>({
    loading: true,
    provider: "openai",
    model: "gpt-4o",
    baseUrl: "",
    hasApiKey: false,
  });
  const [selectedModel, setSelectedModel] = useState("gpt-4o");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const activeSessionIdRef = useRef<string | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const streamingTextRef = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions],
  );

  const modelOptions = useMemo(() => {
    const defaults = MODEL_OPTIONS[runtimeSettings.provider] ?? [];
    return Array.from(
      new Set(
        [selectedModel, runtimeSettings.model, ...defaults].filter(
          (value): value is string => Boolean(value),
        ),
      ),
    );
  }, [runtimeSettings.model, runtimeSettings.provider, selectedModel]);

  const sessionStorageHint = isZh
    ? "当前会话只保存在这台桌面设备里，暂不与 web 历史同步。"
    : "Sessions are stored on this desktop only and do not sync with the web history yet.";
  const settingsHint = isZh
    ? "要启用 AI，请在编辑器工具栏打开 Settings > AI，保存 Provider、Base URL、Model 和 API Key。"
    : "To enable AI, open Settings > AI from the editor toolbar and save the provider, base URL, model, and API key.";
  const desktopBoundaryHint = isZh
    ? "当前桌面聊天已支持真实流式回复和本地会话，但直接改写简历内容仍建议通过专用对话框完成。"
    : "Desktop chat now supports real streaming replies and local sessions, while direct resume-apply flows still belong to the dedicated dialogs.";
  const localHistoryLabel = isZh ? "本地会话历史" : "Local session history";

  const refreshRuntimeSettings = useCallback(async () => {
    try {
      const [settings, inventory] = await Promise.all([
        getWorkspaceSettingsSnapshot(),
        getSecretInventorySnapshot(),
      ]);

      const provider = settings.ai?.defaultProvider || "openai";
      const providerConfig = settings.ai?.providerConfigs?.[provider];
      const hasApiKey = inventory.entries.some(
        (entry) =>
          entry.key === `provider.${provider}.api_key` && entry.isConfigured,
      );

      setRuntimeSettings({
        loading: false,
        provider,
        model: providerConfig?.model || "gpt-4o",
        baseUrl: providerConfig?.baseUrl || "",
        hasApiKey,
      });
      setSelectedModel(providerConfig?.model || "gpt-4o");
    } catch {
      setRuntimeSettings({
        loading: false,
        provider: "openai",
        model: "gpt-4o",
        baseUrl: "",
        hasApiKey: false,
      });
      setSelectedModel("gpt-4o");
    }
  }, []);

  useEffect(() => {
    void refreshRuntimeSettings();
  }, [refreshRuntimeSettings]);

  useEffect(() => {
    const handleFocus = () => {
      void refreshRuntimeSettings();
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [refreshRuntimeSettings]);

  useEffect(() => {
    const storedSessions = loadStoredSessions(resumeId);
    if (storedSessions.length > 0) {
      setSessions(storedSessions);
      setActiveSessionId(storedSessions[0].id);
    } else {
      const initialSession = createSession(newChatLabel);
      setSessions([initialSession]);
      setActiveSessionId(initialSession.id);
    }

    setHistoryOpen(false);
    setInput("");
    setIsThinking(false);
    setStreamingText("");
    streamingTextRef.current = "";
    setErrorMessage("");
    requestIdRef.current = null;
  }, [resumeId, newChatLabel]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    persistSessions(resumeId, sessions);
  }, [resumeId, sessions]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const attach = async () => {
      unlisten = await listenToAiStreamEvents((event: DesktopAiStreamEvent) => {
        if (!requestIdRef.current || event.requestId !== requestIdRef.current) {
          return;
        }

        if (event.kind === "delta" && event.deltaText) {
          streamingTextRef.current += event.deltaText;
          setStreamingText(streamingTextRef.current);
          return;
        }

        if (event.kind === "completed") {
          const sessionId = activeSessionIdRef.current;
          if (sessionId) {
            const content = event.accumulatedText || streamingTextRef.current;
            setSessions((previous) =>
              orderSessions(
                previous.map((session) =>
                  session.id === sessionId
                    ? {
                        ...session,
                        updatedAt: Date.now(),
                        messages: content.trim()
                          ? [
                              ...session.messages,
                              {
                                id: createId("assistant"),
                                role: "assistant",
                                content,
                                createdAt: Date.now(),
                              },
                            ]
                          : session.messages,
                      }
                    : session,
                ),
              ),
            );
          }

          setIsThinking(false);
          setStreamingText("");
          streamingTextRef.current = "";
          setErrorMessage("");
          requestIdRef.current = null;
          return;
        }

        if (event.kind === "error") {
          const friendly = buildFriendlyError(
            event.errorMessage || genericError,
            genericError,
          );
          setIsThinking(false);
          setStreamingText("");
          streamingTextRef.current = "";
          setErrorMessage(friendly);
          requestIdRef.current = null;
        }
      });
    };

    void attach();

    return () => {
      unlisten?.();
    };
  }, [genericError]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !isNearBottomRef.current) {
      return;
    }

    element.scrollTop = element.scrollHeight;
  }, [activeSession?.messages, errorMessage, isThinking, streamingText]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    const handleScroll = () => {
      const distanceToBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight;
      isNearBottomRef.current = distanceToBottom < 80;
    };

    element.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      element.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const createNewSession = useCallback(() => {
    const session = createSession(newChatLabel);
    setSessions((previous) => [session, ...previous]);
    setActiveSessionId(session.id);
    setHistoryOpen(false);
    setInput("");
    setIsThinking(false);
    setStreamingText("");
    streamingTextRef.current = "";
    setErrorMessage("");
    requestIdRef.current = null;
  }, [newChatLabel]);

  const deleteSession = useCallback(
    (sessionId: string) => {
      const remaining = orderSessions(
        sessions.filter((session) => session.id !== sessionId),
      );

      if (remaining.length === 0) {
        const replacement = createSession(newChatLabel);
        setSessions([replacement]);
        setActiveSessionId(replacement.id);
      } else {
        setSessions(remaining);
        if (activeSessionId === sessionId) {
          setActiveSessionId(remaining[0].id);
        }
      }

      if (activeSessionId === sessionId) {
        requestIdRef.current = null;
        setIsThinking(false);
        setStreamingText("");
        streamingTextRef.current = "";
        setErrorMessage("");
      }

      setHistoryOpen(false);
    },
    [activeSessionId, newChatLabel, sessions],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const prompt = input.trim();
      if (!prompt || isThinking) {
        return;
      }

      if (!runtimeSettings.hasApiKey) {
        setErrorMessage(apiKeyMissingHint);
        return;
      }

      let sessionId = activeSession?.id;
      if (!sessionId) {
        const freshSession = createSession(newChatLabel);
        sessionId = freshSession.id;
        setSessions([freshSession]);
        setActiveSessionId(freshSession.id);
      }

      const nextTitle =
        activeSession && activeSession.messages.length > 0
          ? activeSession.title
          : toSessionTitle(prompt, newChatLabel);

      setSessions((previous) =>
        orderSessions(
          previous.map((session) =>
            session.id === sessionId
              ? {
                  ...session,
                  title: nextTitle,
                  updatedAt: Date.now(),
                  messages: [
                    ...session.messages,
                    {
                      id: createId("user"),
                      role: "user",
                      content: prompt,
                      createdAt: Date.now(),
                    },
                  ],
                }
              : session,
          ),
        ),
      );

      setInput("");
      setHistoryOpen(false);
      setErrorMessage("");
      setIsThinking(true);
      setStreamingText("");
      streamingTextRef.current = "";

      const requestId = createId("desktop-chat");
      requestIdRef.current = requestId;

      const resumeContext = {
        title: currentResume?.title || "",
        language: currentResume?.language || "",
        template: currentResume?.template || "",
        targetJobTitle: currentResume?.targetJobTitle || "",
        targetCompany: currentResume?.targetCompany || "",
        sections: sections.map((section) => ({
          type: section.type,
          title: section.title,
          visible: section.visible,
          content: section.content,
        })),
      };

      try {
        await startAiPromptStream({
          provider: runtimeSettings.provider,
          model: selectedModel || runtimeSettings.model,
          baseUrl: runtimeSettings.baseUrl || undefined,
          requestId,
          systemPrompt:
            "You are RoleRover's desktop resume assistant. Use the provided resume context, keep the answer concise and actionable, and provide ready-to-paste rewrites when you suggest text changes. Do not claim you already edited the resume.",
          prompt: `${prompt}\n\nResume context:\n${JSON.stringify(
            resumeContext,
            null,
            2,
          )}`,
        });
      } catch (error) {
        setIsThinking(false);
        setStreamingText("");
        streamingTextRef.current = "";
        setErrorMessage(
          buildFriendlyError(
            error instanceof Error ? error.message : String(error),
            genericError,
          ),
        );
        requestIdRef.current = null;
      }
    },
    [
      activeSession,
      apiKeyMissingHint,
      currentResume?.language,
      currentResume?.targetCompany,
      currentResume?.targetJobTitle,
      currentResume?.template,
      currentResume?.title,
      genericError,
      input,
      isThinking,
      newChatLabel,
      runtimeSettings.baseUrl,
      runtimeSettings.hasApiKey,
      runtimeSettings.model,
      runtimeSettings.provider,
      sections,
      selectedModel,
    ],
  );

  return (
    <div className="flex h-full flex-col bg-white">
      <div
        className={`relative border-b border-zinc-200 px-4 py-3 ${
          hideTitle ? "flex justify-end" : "flex items-start justify-between"
        }`}
      >
        {!hideTitle ? (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-pink-500" />
              <h3 className="truncate text-sm font-semibold text-zinc-900">
                {panelTitle}
              </h3>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500">
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium uppercase tracking-[0.02em] text-zinc-600">
                {runtimeSettings.provider}
              </span>
              <span className="truncate">
                {selectedModel || runtimeSettings.model}
              </span>
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-1">
          <div className="relative">
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
              onClick={() => setHistoryOpen((open) => !open)}
              title={localHistoryLabel}
            >
              <Clock3 className="h-4 w-4" />
            </button>

            {historyOpen ? (
              <div className="absolute right-0 top-9 z-20 w-80 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl">
                <div className="border-b border-zinc-100 px-4 py-3 text-xs font-medium text-zinc-500">
                  {localHistoryLabel}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {sessions.map((session) => {
                    const isActive = session.id === activeSessionId;
                    return (
                      <div
                        key={session.id}
                        className={`group flex items-start gap-3 border-b border-zinc-100 px-4 py-3 transition-colors last:border-b-0 hover:bg-zinc-50 ${
                          isActive ? "bg-pink-50/60" : ""
                        }`}
                      >
                        <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => {
                            setActiveSessionId(session.id);
                            setHistoryOpen(false);
                            setErrorMessage("");
                          }}
                        >
                          <p className="truncate text-sm font-medium text-zinc-800">
                            {session.title}
                          </p>
                          <p className="mt-1 text-[11px] text-zinc-400">
                            {formatTime(session.updatedAt)}
                          </p>
                        </button>
                        <button
                          type="button"
                          className="hidden rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-700 group-hover:block"
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteSession(session.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-zinc-100 px-4 py-2 text-[11px] text-zinc-400">
                  {sessionStorageHint}
                </div>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
            onClick={createNewSession}
            title={newChatLabel}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-white px-4 py-4">
        <div className="space-y-4">
          {!runtimeSettings.hasApiKey ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex items-center gap-2 text-amber-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="text-sm font-semibold">
                  {apiKeyMissingTitle}
                </span>
              </div>
              <p className="mt-2 text-[13px] leading-6 text-amber-700">
                {apiKeyMissingHint}
              </p>
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-white/70 px-3 py-2 text-[12px] leading-5 text-amber-800">
                <Settings2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{settingsHint}</span>
              </div>
            </div>
          ) : null}

          {activeSession && activeSession.messages.length === 0 ? (
            <div className="rounded-2xl bg-gradient-to-br from-pink-50 to-rose-50 p-4 text-[13px] leading-6 text-pink-700">
              <p className="font-medium">{defaultGreeting}</p>
              <p className="mt-2 text-pink-600/90">{desktopBoundaryHint}</p>
              <p className="mt-2 text-xs text-pink-500/90">{sessionStorageHint}</p>
            </div>
          ) : null}

          {activeSession?.messages.map((message) => {
            const isUser = message.role === "user";
            return (
              <div
                key={message.id}
                className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    isUser
                      ? "bg-zinc-800"
                      : message.error
                        ? "bg-red-500"
                        : "bg-gradient-to-br from-pink-400 to-pink-500"
                  }`}
                >
                  {isUser ? (
                    <User className="h-3 w-3 text-white" />
                  ) : (
                    <Bot className="h-3 w-3 text-white" />
                  )}
                </div>
                <div
                  className={`min-w-0 max-w-[calc(100%-2.5rem)] rounded-2xl px-3 py-2 text-[13px] leading-6 ${
                    isUser
                      ? "bg-zinc-800 text-white"
                      : message.error
                        ? "border border-red-200 bg-red-50 text-red-700"
                        : "bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200/70"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">
                    {message.content}
                  </p>
                </div>
              </div>
            );
          })}

          {streamingText ? (
            <div className="flex gap-2.5">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-400 to-pink-500">
                <Bot className="h-3 w-3 text-white" />
              </div>
              <div className="min-w-0 max-w-[calc(100%-2.5rem)] rounded-2xl bg-zinc-50 px-3 py-2 text-[13px] leading-6 text-zinc-700 ring-1 ring-zinc-200/70">
                <p className="whitespace-pre-wrap break-words">{streamingText}</p>
              </div>
            </div>
          ) : null}

          {isThinking && !streamingText ? (
            <div className="flex gap-2.5">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-400 to-pink-500">
                <Bot className="h-3 w-3 text-white" />
              </div>
              <div className="rounded-2xl bg-zinc-50 px-3 py-2 text-[13px] text-zinc-600 ring-1 ring-zinc-200/70">
                <div className="flex items-center gap-2">
                  <span className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pink-400 [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pink-400 [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pink-400 [animation-delay:300ms]" />
                  </span>
                  <span>{thinkingLabel}</span>
                </div>
              </div>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] leading-5 text-red-700">
              {errorMessage}
            </div>
          ) : null}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="border-t border-zinc-200 p-3">
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50/60 transition-colors focus-within:border-zinc-300 focus-within:bg-white">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={placeholder}
            rows={3}
            disabled={isThinking || runtimeSettings.loading || !runtimeSettings.hasApiKey}
            className="min-h-[84px] w-full resize-none bg-transparent px-4 pt-3 pb-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />

          <div className="flex items-center justify-between gap-3 px-3 pb-2.5">
            <div className="min-w-0 flex items-center gap-2">
              <SimpleSelect
                value={selectedModel}
                onValueChange={setSelectedModel}
                className="h-7 max-w-[180px] rounded-full border-zinc-200 bg-white px-2.5 text-[11px] font-medium text-zinc-600 shadow-none"
                disabled={runtimeSettings.loading || isThinking}
                options={modelOptions.map((model) => ({
                  value: model,
                  label: model,
                }))}
              />
              <span className="truncate text-[11px] text-zinc-400">
                {sessionStorageHint}
              </span>
            </div>

            <button
              type="submit"
              disabled={
                isThinking ||
                runtimeSettings.loading ||
                !runtimeSettings.hasApiKey ||
                !input.trim()
              }
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-500 transition-colors hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-40 [&:not(:disabled)]:bg-pink-500 [&:not(:disabled)]:text-white [&:not(:disabled)]:hover:bg-pink-600"
              title={bubbleTooltip}
            >
              <SendHorizonal className="h-4 w-4" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function AIChatPanel({ resumeId }: AIChatPanelProps) {
  const { toggleAiChat } = useEditorStore();
  const { t } = useTranslation();

  const closeLabel = useMemo(() => {
    const value = t("close");
    return value === "close" ? "Close" : value;
  }, [t]);

  return (
    <div className="relative flex w-80 shrink-0 flex-col overflow-hidden border-l border-zinc-200 bg-white">
      <AIChatContent resumeId={resumeId} />
      <Button
        variant="ghost"
        size="sm"
        className="absolute right-2 top-2 h-7 w-7 p-0"
        onClick={toggleAiChat}
        title={closeLabel}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
