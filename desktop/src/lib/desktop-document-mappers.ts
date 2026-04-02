import type {
  DesktopDocumentDetail,
  DesktopDocumentListItem,
} from "./desktop-api";
import type { Resume, ResumeSection, ThemeConfig } from "../types/resume";

const DEFAULT_THEME: ThemeConfig = {
  primaryColor: "#1a1a1a",
  accentColor: "#ec4899",
  fontFamily: "Inter",
  fontSize: "medium",
  lineSpacing: 1.5,
  margin: { top: 24, right: 24, bottom: 24, left: 24 },
  sectionSpacing: 16,
  avatarStyle: "circle",
};

function parseRecord(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw);
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // Fall through to default.
  }

  return {};
}

function parseThemeConfig(raw: string): ThemeConfig {
  const parsed = parseRecord(raw);
  const margin = (parsed.margin as Record<string, unknown> | undefined) ?? {};
  const avatarStyle = parsed.avatarStyle;

  return {
    primaryColor:
      typeof parsed.primaryColor === "string"
        ? parsed.primaryColor
        : DEFAULT_THEME.primaryColor,
    accentColor:
      typeof parsed.accentColor === "string"
        ? parsed.accentColor
        : DEFAULT_THEME.accentColor,
    fontFamily:
      typeof parsed.fontFamily === "string"
        ? parsed.fontFamily
        : DEFAULT_THEME.fontFamily,
    fontSize:
      typeof parsed.fontSize === "string"
        ? parsed.fontSize
        : DEFAULT_THEME.fontSize,
    lineSpacing:
      typeof parsed.lineSpacing === "number"
        ? parsed.lineSpacing
        : DEFAULT_THEME.lineSpacing,
    margin: {
      top: typeof margin.top === "number" ? margin.top : DEFAULT_THEME.margin.top,
      right:
        typeof margin.right === "number" ? margin.right : DEFAULT_THEME.margin.right,
      bottom:
        typeof margin.bottom === "number"
          ? margin.bottom
          : DEFAULT_THEME.margin.bottom,
      left:
        typeof margin.left === "number" ? margin.left : DEFAULT_THEME.margin.left,
    },
    sectionSpacing:
      typeof parsed.sectionSpacing === "number"
        ? parsed.sectionSpacing
        : DEFAULT_THEME.sectionSpacing,
    avatarStyle:
      avatarStyle === "oneInch" || avatarStyle === "one_inch"
        ? "oneInch"
        : "circle",
  };
}

export function toResume(document: DesktopDocumentListItem): Resume {
  return {
    id: document.id,
    userId: "desktop-workspace",
    title: document.title,
    template: document.template,
    themeConfig: parseThemeConfig(document.themeJson),
    isDefault: document.isDefault,
    language: document.language,
    targetJobTitle: document.targetJobTitle,
    targetCompany: document.targetCompany,
    sections: [],
    createdAt: new Date(document.createdAtEpochMs).toISOString(),
    updatedAt: new Date(document.updatedAtEpochMs).toISOString(),
  };
}

/**
 * Convert a native document detail (from Tauri backend) into the shared
 * Resume type used by the web preview components and resume-store.
 */
export function toResumeDocument(document: DesktopDocumentDetail): Resume {
  const sections: ResumeSection[] = document.sections.map((section, index) => ({
    id: section.id,
    resumeId: section.documentId || document.id,
    type: section.sectionType,
    title: section.title,
    sortOrder: section.sortOrder ?? index,
    visible: section.visible,
    content: parseRecord(section.contentJson) as unknown as import("../types/resume").SectionContent,
    createdAt: new Date(section.createdAtEpochMs).toISOString(),
    updatedAt: new Date(section.updatedAtEpochMs).toISOString(),
  }));

  return {
    id: document.id,
    userId: "desktop-workspace",
    title: document.title,
    template: document.template,
    themeConfig: parseThemeConfig(document.themeJson),
    isDefault: document.isDefault,
    language: document.language,
    targetJobTitle: document.targetJobTitle,
    targetCompany: document.targetCompany,
    sections,
    createdAt: new Date(document.createdAtEpochMs).toISOString(),
    updatedAt: new Date(document.updatedAtEpochMs).toISOString(),
  };
}
