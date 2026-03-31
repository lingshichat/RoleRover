/**
 * Unified Template Renderer Types
 *
 * This module defines the canonical types for unified template rendering.
 * Both preview (React) and export (HTML string) contexts use these types.
 */

import type {
  Resume,
  ResumeSection,
  ThemeConfig,
  PersonalInfoContent,
  SummaryContent,
  WorkExperienceContent,
  EducationContent,
  SkillsContent,
  ProjectsContent,
  CertificationsContent,
  LanguagesContent,
  CustomContent,
  GitHubContent,
  QrCodesContent,
  SectionContent,
} from '@/types/resume';
import type { SectionType as SharedSectionType } from '@/lib/constants';

// Re-export types from resume.ts for convenience
export type {
  Resume,
  ResumeSection,
  ThemeConfig,
  PersonalInfoContent,
  SummaryContent,
  WorkExperienceContent,
  EducationContent,
  SkillsContent,
  ProjectsContent,
  CertificationsContent,
  LanguagesContent,
  CustomContent,
  GitHubContent,
  QrCodesContent,
  SectionContent,
};

/**
 * Canonical resume data structure for template rendering.
 * This is the normalized form that templates receive.
 */
export interface CanonicalResume {
  id: string;
  title: string;
  template: string;
  language: string;
  themeConfig: ThemeConfig;
  personalInfo: PersonalInfoContent;
  sections: CanonicalSection[];
}

/**
 * Normalized section with pre-processed content.
 */
export interface CanonicalSection {
  id: string;
  type: SectionType;
  title: string;
  visible: boolean;
  sortOrder: number;
  content: SectionContent;
}

/**
 * Supported section types.
 */
export type SectionType = SharedSectionType;

/**
 * Template rendering context passed to templates.
 */
export interface TemplateRenderContext {
  /** The resume being rendered */
  resume: CanonicalResume;
  /** Language code (en, zh, etc.) */
  lang: string;
  /** Theme configuration */
  theme: ThemeConfig;
  /** Helper functions for text processing */
  helpers: TemplateHelpers;
}

/**
 * Helper functions available to templates.
 */
export interface TemplateHelpers {
  /** Convert markdown to HTML */
  md: (text: unknown) => string;
  /** Escape HTML special characters */
  esc: (text: unknown) => string;
  /** Format degree and field together */
  degreeField: (degree: string, field?: string) => string;
  /** Format date range with localization */
  formatDate: (start: string, end: string | null, current: boolean, lang: string) => string;
  /** Check if a section is empty */
  isSectionEmpty: (section: CanonicalSection) => boolean;
  /** Get visible sections from resume */
  visibleSections: (sections: CanonicalSection[]) => CanonicalSection[];
  /** Get personal info from resume */
  getPersonalInfo: (resume: CanonicalResume) => PersonalInfoContent;
}

/**
 * Props passed to template components.
 */
export interface TemplateProps {
  /** The resume to render */
  resume: CanonicalResume;
  /** Optional render context */
  context?: TemplateRenderContext;
}

/**
 * Unified template definition.
 * Implements the template contract for both preview and export.
 */
export interface UnifiedTemplate {
  /** Unique template identifier (matches resume.template field) */
  id: string;

  /** Display name for the template */
  name: string;

  /** React component for preview rendering */
  PreviewComponent: React.ComponentType<TemplateProps>;

  /** HTML builder function for export rendering */
  buildHtml: (resume: CanonicalResume) => string;

  /** Optional: Additional CSS styles for this template */
  styles?: string;
}

/**
 * Template registry type.
 */
export type TemplateRegistry = Map<string, UnifiedTemplate>;

/**
 * Render mode for determining output format.
 */
export type RenderMode = 'preview' | 'export';

/**
 * Options for template rendering.
 */
export interface RenderOptions {
  /** Render mode (preview or export) */
  mode: RenderMode;
  /** Language for localization */
  lang?: string;
  /** Override theme configuration */
  theme?: Partial<ThemeConfig>;
}
