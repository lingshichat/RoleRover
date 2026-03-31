# Document Model Specification

> Canonical document model for unified template rendering.

---

## Overview

This specification defines the canonical document model that serves as the single source of truth for both preview (React JSX) and export (HTML string) rendering.

The goal is to eliminate the dual-track rendering problem where:
- Preview uses React JSX components (50+ template files)
- Export uses HTML string builders (50+ template files)
- Each template has two independent implementations that can drift apart

---

## Core Types

### CanonicalResume

The canonical resume data structure that templates receive:

```typescript
interface CanonicalResume {
  id: string;
  title: string;
  template: string;
  language: string;
  themeConfig: ThemeConfig;
  personalInfo: PersonalInfoContent;
  sections: CanonicalSection[];
}
```

### CanonicalSection

A normalized section with pre-processed content:

```typescript
interface CanonicalSection {
  id: string;
  type: SectionType;
  title: string;
  visible: boolean;
  sortOrder: number;
  content: SectionContent;
}
```

Canonical sections are sorted by `sortOrder` and normalized before rendering so
preview and export receive the same data shape.

### SectionType

Supported section types:

```typescript
type SectionType =
  | 'personal_info'
  | 'summary'
  | 'work_experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'certifications'
  | 'languages'
  | 'custom'
  | 'github'
  | 'qr_codes';
```

---

## Rendering Context

Templates receive a rendering context that provides:

```typescript
interface TemplateRenderContext {
  resume: CanonicalResume;
  lang: 'en' | 'zh' | string;
  theme: ThemeConfig;
  helpers: {
    md: (text: unknown) => string;       // Markdown to HTML
    esc: (text: unknown) => string;      // HTML escape
    degreeField: (degree: string, field?: string) => string;
    formatDate: (start: string, end: string | null, current: boolean) => string;
    isSectionEmpty: (section: CanonicalSection) => boolean;
    visibleSections: (sections: CanonicalSection[]) => CanonicalSection[];
    getPersonalInfo: (resume: CanonicalResume) => PersonalInfoContent;
  };
}
```

---

## Section Content Types

Each section type has a defined content structure (from `src/types/resume.ts`):

| Section Type | Content Type | Description |
|--------------|--------------|-------------|
| `personal_info` | `PersonalInfoContent` | Name, contact, avatar |
| `summary` | `SummaryContent` | Text summary |
| `work_experience` | `WorkExperienceContent` | Work history items |
| `education` | `EducationContent` | Education items |
| `skills` | `SkillsContent` | Skill categories |
| `projects` | `ProjectsContent` | Project items |
| `certifications` | `CertificationsContent` | Certification items |
| `languages` | `LanguagesContent` | Language proficiency items |
| `custom` | `CustomContent` | Custom items |
| `github` | `GitHubContent` | GitHub repo items |
| `qr_codes` | `QrCodesContent` | QR code items |

---

## Migration Strategy

1. **Phase 1**: Define canonical types and contracts
2. **Phase 2**: Create unified rendering interface
3. **Phase 3**: Migrate representative templates (classic, modern)
4. **Phase 4**: Validate parity between preview and export
5. **Phase 5**: Document migration guide for remaining templates

---

## Compatibility Requirements

- All existing 50+ templates must continue to work
- Unified templates should render identically in both contexts
- Fallback mechanism: if unified template not found, use legacy implementation
- Unified templates should receive canonical data only after content
  normalization and section sorting
- Type definitions must be compatible with `src/types/resume.ts`

---

## Related Documents

- [Template Contract](./template-contract.md) - Template rendering contract
- [Template Migration Guide](./template-migration-guide.md) - Step-by-step migration
