import { Link, Outlet, createRootRoute, useMatches } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Settings } from "lucide-react";
import { i18n } from "../i18n";
import { SettingsDialog } from "../components/editor/settings-dialog";
import { Button } from "@/components/ui/button";
import {
  getBootstrapContext,
  getWorkspaceSettingsSnapshot,
} from "../lib/desktop-api";

function RoleRoverLogo() {
  return (
    <svg
      className="h-8 w-auto"
      viewBox="0 0 220 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="rover-f"
          x1="2"
          y1="2"
          x2="46"
          y2="46"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>

      <g>
        <rect x="2" y="2" width="44" height="44" rx="11" fill="url(#rover-f)" />

        <g
          stroke="white"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        >
          <path d="M11 12H24" />
          <path d="M22 12V32" />
          <path d="M22 32C22 35.5 20 38 16.5 38C14.5 38 13 37 13 36" />
          <path d="M22 12H30C34.5 12 37 15 37 19C37 23 34.5 26 30 26H22" />
          <path d="M29 26L39 38" />
        </g>

        <circle cx="41" cy="9" r="6" fill="#FCD34D" opacity="0.12" />
        <path
          d="M41 3.5L42.4 8L47 9.5L42.4 11L41 15.5L39.6 11L35 9.5L39.6 8Z"
          fill="#FCD34D"
        />
        <path
          d="M34.5 2L35.1 4L37 4.5L35.1 5L34.5 7L33.9 5L32 4.5L33.9 4Z"
          fill="#FCD34D"
          opacity="0.6"
        />
        <circle cx="45" cy="4" r="1.1" fill="#FCD34D" opacity="0.45" />
      </g>

      <text
        x="54"
        y="33"
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
        fontSize="24"
        fontWeight="700"
        fill="currentColor"
        letterSpacing="-0.5"
      >
        Role<tspan className="fill-emerald-500">Rover</tspan>
      </text>
    </svg>
  );
}

function LanguagePicker() {
  const activeLanguage = i18n.language;

  return (
    <div className="flex items-center gap-0.5 rounded-full border border-zinc-200 p-0.5 dark:border-zinc-700">
      <button
        type="button"
        className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
          activeLanguage === "zh"
            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
            : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        }`}
        onClick={() => void i18n.changeLanguage("zh")}
      >
        中文
      </button>
      <button
        type="button"
        className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
          activeLanguage === "en"
            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
            : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        }`}
        onClick={() => void i18n.changeLanguage("en")}
      >
        EN
      </button>
    </div>
  );
}

function RootLayout() {
  const { t } = useTranslation();
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const pathname = typeof window === "undefined" ? "/" : window.location.pathname;
  const isEditorSurface = pathname.startsWith("/editor/");

  useEffect(() => {
    const applyWorkspaceSettings = async () => {
      try {
        const settings = await getWorkspaceSettingsSnapshot();
        const theme = settings.theme;
        const resolvedTheme =
          theme === "system"
            ? window.matchMedia("(prefers-color-scheme: dark)").matches
              ? "dark"
              : "light"
            : theme;
        document.documentElement.dataset.theme = theme;
        document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
        document.documentElement.lang = settings.locale;
        if (i18n.language !== settings.locale) {
          await i18n.changeLanguage(settings.locale);
        }
      } catch (error) {
        console.error("Failed to apply workspace settings:", error);
      }
    };

    void applyWorkspaceSettings();
  }, []);

  return (
    <div
      className={
        isEditorSurface
          ? "h-screen overflow-hidden bg-zinc-50 dark:bg-background"
          : "min-h-screen bg-zinc-50 dark:bg-background"
      }
    >
      {!isEditorSurface && (
        <header className="sticky top-0 z-50 w-full border-b border-zinc-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:border-zinc-800 dark:bg-background/95 dark:supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-6">
              <Link to="/dashboard" className="flex items-center" aria-label="RoleRover">
                <RoleRoverLogo />
              </Link>

              <nav className="flex items-center gap-1">
                <Link
                  to="/dashboard"
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  activeProps={{
                    className:
                      "rounded-md px-3 py-1.5 text-sm font-medium bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100",
                  }}
                  activeOptions={{ exact: true }}
                >
                  {t("libraryLabel")}
                </Link>
                <Link
                  to="/templates"
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  activeProps={{
                    className:
                      "rounded-md px-3 py-1.5 text-sm font-medium bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100",
                  }}
                  activeOptions={{ exact: true }}
                >
                  {t("templatesTitle")}
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-3">
              <LanguagePicker />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setSettingsDialogOpen(true)}
                aria-label={t("navSettings")}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>
      )}

      <main
        className={
          isEditorSurface
            ? "h-screen overflow-hidden"
            : "mx-auto max-w-7xl px-4 py-8 sm:px-6"
        }
      >
        <Outlet />
      </main>

      <SettingsDialog
        open={settingsDialogOpen}
        onClose={() => setSettingsDialogOpen(false)}
      />
    </div>
  );
}

export const rootRoute = createRootRoute({
  loader: async () => getBootstrapContext(),
  component: RootLayout,
});
