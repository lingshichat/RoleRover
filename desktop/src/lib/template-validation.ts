import { BACKGROUND_TEMPLATES } from "@/lib/constants";
import { EXPORT_TAILWIND_CSS } from "@/lib/pdf/export-tailwind-css";
import {
  esc,
  getUnifiedTemplate,
  toCanonicalResume,
} from "@/lib/template-renderer";
import type { Resume, ResumeSection, ThemeConfig } from "@/types/resume";
import type { TemplateValidationDocument } from "./desktop-api";

type FontSizeToken = "small" | "medium" | "large";

const FONT_SIZE_SCALE: Record<
  FontSizeToken,
  { body: string; h1: string; h2: string; h3: string }
> = {
  small: { body: "12px", h1: "22px", h2: "15px", h3: "13px" },
  medium: { body: "14px", h1: "26px", h2: "17px", h3: "15px" },
  large: { body: "16px", h1: "30px", h2: "19px", h3: "17px" },
};

const DEFAULT_THEME: ThemeConfig = {
  primaryColor: "#111827",
  accentColor: "#2563eb",
  fontFamily: "Inter",
  fontSize: "medium",
  lineSpacing: 1.6,
  margin: { top: 24, right: 24, bottom: 24, left: 24 },
  sectionSpacing: 16,
  avatarStyle: "circle",
};

function normalizeFontSizeToken(fontSize: string): FontSizeToken {
  if (fontSize === "small" || fontSize === "medium" || fontSize === "large") {
    return fontSize;
  }

  const pxMatch = Number.parseFloat(fontSize);

  if (!Number.isNaN(pxMatch)) {
    if (pxMatch <= 12) {
      return "small";
    }

    if (pxMatch >= 16) {
      return "large";
    }
  }

  return "medium";
}

function mapAvatarStyle(
  avatarStyle: TemplateValidationDocument["theme"]["avatarStyle"],
): ThemeConfig["avatarStyle"] {
  return avatarStyle === "one_inch" || avatarStyle === "oneInch"
    ? "oneInch"
    : "circle";
}

function isDark(hex: string): boolean {
  const value = hex.replace("#", "");

  if (value.length !== 6) {
    return false;
  }

  const red = Number.parseInt(value.slice(0, 2), 16) / 255;
  const green = Number.parseInt(value.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(value.slice(4, 6), 16) / 255;

  return 0.299 * red + 0.587 * green + 0.114 * blue < 0.4;
}

function buildTemplateThemeCss(resume: Resume): string {
  const theme = { ...DEFAULT_THEME, ...resume.themeConfig };
  const fontSize = normalizeFontSizeToken(theme.fontSize);
  const fontScale = FONT_SIZE_SCALE[fontSize];
  const needsPadding = !BACKGROUND_TEMPLATES.has(resume.template);
  const primaryIsDark = isDark(theme.primaryColor);

  return `
    body {
      margin: 0;
      padding: 20px;
      background: #f4f4f5;
      min-height: 100vh;
      display: block;
    }

    .resume-export > div {
      font-family: ${theme.fontFamily}, "Noto Sans SC", sans-serif !important;
      line-height: ${theme.lineSpacing} !important;
      ${needsPadding
        ? `padding-top: ${theme.margin.top}px !important;
           padding-right: ${theme.margin.right}px !important;
           padding-bottom: ${theme.margin.bottom}px !important;
           padding-left: ${theme.margin.left}px !important;`
        : ""}
      --base-body-size: ${fontScale.body};
      --base-h1-size: ${fontScale.h1};
      --base-h2-size: ${fontScale.h2};
      --base-h3-size: ${fontScale.h3};
      --base-line-spacing: ${theme.lineSpacing};
      --base-section-spacing: ${theme.sectionSpacing}px;
    }

    .resume-export p,
    .resume-export li,
    .resume-export span,
    .resume-export td,
    .resume-export a,
    .resume-export div {
      font-size: ${fontScale.body} !important;
      line-height: ${theme.lineSpacing} !important;
    }

    .resume-export h1:not([style*="color"]) {
      color: ${theme.primaryColor} !important;
      font-size: ${fontScale.h1} !important;
      line-height: ${theme.lineSpacing} !important;
    }

    .resume-export h2:not([style*="color"]) {
      color: ${theme.primaryColor} !important;
      font-size: ${fontScale.h2} !important;
      line-height: ${theme.lineSpacing} !important;
      border-color: ${theme.accentColor} !important;
    }

    .resume-export h3:not([style*="color"]) {
      color: ${theme.primaryColor} !important;
      font-size: ${fontScale.h3} !important;
      line-height: ${theme.lineSpacing} !important;
    }

    .resume-export [class*="border-b-2"],
    .resume-export [class*="border-b-"] {
      border-color: ${theme.accentColor} !important;
    }

    .resume-export [class*="bg-blue-"],
    .resume-export [class*="bg-indigo-"],
    .resume-export [class*="bg-slate-800"],
    .resume-export [class*="bg-zinc-800"],
    .resume-export [class*="bg-teal-"],
    .resume-export [class*="bg-emerald-"] {
      background-color: ${theme.accentColor} !important;
    }

    .resume-export [data-section] {
      ${needsPadding
        ? `margin-bottom: ${theme.sectionSpacing}px !important;`
        : `padding-bottom: ${theme.sectionSpacing}px !important;`}
    }

    .resume-export .rounded-full {
      border-radius: 9999px !important;
    }

    .resume-export[data-avatar-style="oneInch"] img[class*="object-cover"] {
      border-radius: 4px !important;
      aspect-ratio: 5 / 7 !important;
      height: auto !important;
      max-height: none !important;
    }

    .resume-export[data-avatar-style="oneInch"] div:has(> img[class*="object-cover"]) {
      border-radius: 4px !important;
      height: auto !important;
      overflow: hidden !important;
    }

    .resume-export[data-avatar-style="circle"] img[class*="object-cover"] {
      border-radius: 9999px !important;
      aspect-ratio: 1 / 1 !important;
    }

    .resume-export[data-avatar-style="circle"] div:has(> img[class*="object-cover"]) {
      border-radius: 9999px !important;
      overflow: hidden !important;
    }

    ${
      primaryIsDark
        ? `
    .resume-export [style*="background"][style*="#"] h1:not([style*="color"]),
    .resume-export [style*="background"][style*="#"] h2:not([style*="color"]),
    .resume-export [style*="background"][style*="#"] h3:not([style*="color"]),
    .resume-export [style*="background"][style*="rgb"] h1:not([style*="color"]),
    .resume-export [style*="background"][style*="rgb"] h2:not([style*="color"]),
    .resume-export [style*="background"][style*="rgb"] h3:not([style*="color"]),
    .resume-export [style*="background"][style*="linear-gradient"] h1:not([style*="color"]),
    .resume-export [style*="background"][style*="linear-gradient"] h2:not([style*="color"]),
    .resume-export [style*="background"][style*="linear-gradient"] h3:not([style*="color"]),
    .resume-export .bg-black h1:not([style*="color"]),
    .resume-export .bg-black h2:not([style*="color"]),
    .resume-export .bg-black h3:not([style*="color"]) {
      color: #ffffff !important;
    }`
        : ""
    }
  `;
}

export function toSharedResume(document: TemplateValidationDocument): Resume {
  const margin = document.theme.margin ?? {};
  const themeConfig: ThemeConfig = {
    primaryColor: document.theme.primaryColor ?? DEFAULT_THEME.primaryColor,
    accentColor: document.theme.accentColor ?? DEFAULT_THEME.accentColor,
    fontFamily: document.theme.fontFamily ?? DEFAULT_THEME.fontFamily,
    fontSize: normalizeFontSizeToken(
      document.theme.fontSize ?? DEFAULT_THEME.fontSize,
    ),
    lineSpacing: document.theme.lineSpacing ?? DEFAULT_THEME.lineSpacing,
    margin: {
      top: margin.top ?? DEFAULT_THEME.margin.top,
      right: margin.right ?? DEFAULT_THEME.margin.right,
      bottom: margin.bottom ?? DEFAULT_THEME.margin.bottom,
      left: margin.left ?? DEFAULT_THEME.margin.left,
    },
    sectionSpacing:
      document.theme.sectionSpacing ?? DEFAULT_THEME.sectionSpacing,
    avatarStyle: mapAvatarStyle(document.theme.avatarStyle),
  };

  const sections: ResumeSection[] = [...document.sections]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((section) => ({
      id: section.id,
      resumeId: section.documentId,
      type: section.sectionType,
      title: section.title,
      sortOrder: section.sortOrder,
      visible: section.visible,
      content: section.content as unknown as ResumeSection["content"],
      createdAt: new Date(section.createdAtEpochMs),
      updatedAt: new Date(section.updatedAtEpochMs),
    }));

  return {
    id: document.metadata.id,
    userId: "desktop-workspace",
    title: document.metadata.title,
    template: document.metadata.template,
    themeConfig,
    isDefault: document.metadata.isDefault,
    language: document.metadata.language,
    targetJobTitle: document.metadata.targetJobTitle,
    targetCompany: document.metadata.targetCompany,
    sections,
    createdAt: new Date(document.metadata.createdAtEpochMs),
    updatedAt: new Date(document.metadata.updatedAtEpochMs),
  };
}

export function buildTemplateValidationDocumentHtml(
  document: TemplateValidationDocument,
): string {
  const resume = toSharedResume(document);
  const template =
    getUnifiedTemplate(resume.template) ?? getUnifiedTemplate("classic");

  if (!template) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Template unavailable</title>
</head>
<body>
  <p>Unified template ${esc(resume.template)} is unavailable.</p>
</body>
</html>`;
  }

  const canonicalResume = toCanonicalResume(resume);
  const bodyHtml = template.buildHtml(canonicalResume);
  const avatarStyle = resume.themeConfig.avatarStyle ?? "oneInch";

  return `<!DOCTYPE html>
<html lang="${esc(resume.language || "en")}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(resume.title)}</title>
  <style>${EXPORT_TAILWIND_CSS}</style>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Noto+Sans+SC:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>${buildTemplateThemeCss(resume)}</style>
</head>
<body>
  <div class="resume-export" data-avatar-style="${esc(avatarStyle)}">
    ${bodyHtml}
  </div>
</body>
</html>`;
}

export function countVisibleValidationSections(
  document: TemplateValidationDocument,
): number {
  return document.sections.filter(
    (section) => section.visible && section.sectionType !== "personal_info",
  ).length;
}

export function formatBytes(byteCount: number): string {
  if (byteCount < 1024) {
    return `${byteCount} B`;
  }

  if (byteCount < 1024 * 1024) {
    return `${(byteCount / 1024).toFixed(1)} KB`;
  }

  return `${(byteCount / (1024 * 1024)).toFixed(1)} MB`;
}
