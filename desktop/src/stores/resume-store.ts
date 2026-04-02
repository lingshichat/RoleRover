import { create } from "zustand";
import { saveDocument } from "../lib/desktop-api";
import type {
  Resume,
  ResumeSection,
  SectionContent,
  ThemeConfig,
} from "../types/resume";

const AUTOSAVE_DELAY = 500;

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

interface ResumeStore {
  currentResume: Resume | null;
  sections: ResumeSection[];
  isDirty: boolean;
  isSaving: boolean;
  _saveTimeout: ReturnType<typeof setTimeout> | null;

  setResume: (resume: Resume) => void;
  updateSection: (sectionId: string, content: Partial<SectionContent>) => void;
  updateSectionTitle: (sectionId: string, title: string) => void;
  addSection: (section: ResumeSection) => void;
  removeSection: (sectionId: string) => void;
  reorderSections: (sections: ResumeSection[]) => void;
  toggleSectionVisibility: (sectionId: string) => void;
  setTemplate: (template: string) => void;
  setTitle: (title: string) => void;
  updateTheme: (theme: Partial<ThemeConfig>) => void;
  save: () => Promise<void>;
  _scheduleSave: () => void;
  reset: () => void;
}

export const useResumeStore = create<ResumeStore>((set, get) => ({
  currentResume: null,
  sections: [],
  isDirty: false,
  isSaving: false,
  _saveTimeout: null,

  setResume: (resume) => {
    // Cancel any pending autosave to prevent stale data overwriting
    const { _saveTimeout } = get();
    if (_saveTimeout) clearTimeout(_saveTimeout);

    const sections = resume.sections.map((s, i) => ({
      ...s,
      sortOrder: s.sortOrder ?? i,
      content:
        typeof s.content === "object" && s.content !== null
          ? s.content
          : ({} as SectionContent),
    }));

    set({
      currentResume: { ...resume, sections },
      sections,
      isDirty: false,
      _saveTimeout: null,
    });
  },

  updateSection: (sectionId, content) => {
    set((state) => {
      const sections = state.sections.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              content: {
                ...(typeof s.content === "object" && s.content !== null
                  ? (s.content as unknown as Record<string, unknown>)
                  : {}),
                ...(typeof content === "object" && content !== null
                  ? (content as unknown as Record<string, unknown>)
                  : {}),
              } as unknown as SectionContent,
            }
          : s
      );
      return {
        sections,
        currentResume: state.currentResume
          ? { ...state.currentResume, sections }
          : null,
        isDirty: true,
      };
    });
    get()._scheduleSave();
  },

  updateSectionTitle: (sectionId, title) => {
    set((state) => {
      const sections = state.sections.map((s) =>
        s.id === sectionId ? { ...s, title } : s
      );
      return {
        sections,
        currentResume: state.currentResume
          ? { ...state.currentResume, sections }
          : null,
        isDirty: true,
      };
    });
    get()._scheduleSave();
  },

  addSection: (section) => {
    set((state) => {
      const sections = [...state.sections, section];
      return {
        sections,
        currentResume: state.currentResume
          ? { ...state.currentResume, sections }
          : null,
        isDirty: true,
      };
    });
    get()._scheduleSave();
  },

  removeSection: (sectionId) => {
    set((state) => {
      const sections = state.sections.filter((s) => s.id !== sectionId);
      return {
        sections,
        currentResume: state.currentResume
          ? { ...state.currentResume, sections }
          : null,
        isDirty: true,
      };
    });
    get()._scheduleSave();
  },

  reorderSections: (sections) => {
    set((state) => ({
      sections,
      currentResume: state.currentResume
        ? { ...state.currentResume, sections }
        : null,
      isDirty: true,
    }));
    get()._scheduleSave();
  },

  toggleSectionVisibility: (sectionId) => {
    set((state) => {
      const sections = state.sections.map((s) =>
        s.id === sectionId ? { ...s, visible: !s.visible } : s
      );
      return {
        sections,
        currentResume: state.currentResume
          ? { ...state.currentResume, sections }
          : null,
        isDirty: true,
      };
    });
    get()._scheduleSave();
  },

  setTemplate: (template) => {
    set((state) => ({
      currentResume: state.currentResume
        ? { ...state.currentResume, template }
        : null,
      isDirty: true,
    }));
    get()._scheduleSave();
  },

  setTitle: (title) => {
    set((state) => ({
      currentResume: state.currentResume
        ? { ...state.currentResume, title }
        : null,
      isDirty: true,
    }));
    get()._scheduleSave();
  },

  updateTheme: (theme) => {
    set((state) => ({
      currentResume: state.currentResume
        ? {
            ...state.currentResume,
            themeConfig: { ...state.currentResume.themeConfig, ...theme },
          }
        : null,
      isDirty: true,
    }));
    get()._scheduleSave();
  },

  save: async () => {
    const { currentResume, sections, isDirty } = get();
    if (!currentResume || !isDirty) return;

    set({ isSaving: true });
    try {
      await saveDocument({
        id: currentResume.id,
        title: currentResume.title,
        template: currentResume.template,
        language: currentResume.language,
        themeJson: JSON.stringify(currentResume.themeConfig),
        targetJobTitle: currentResume.targetJobTitle,
        targetCompany: currentResume.targetCompany,
        sections: sections.map((section) => ({
          id: section.id,
          documentId: section.resumeId || currentResume.id,
          sectionType: section.type,
          title: section.title,
          sortOrder: section.sortOrder,
          visible: section.visible,
          content: section.content as unknown as Record<string, unknown>,
          createdAtEpochMs: typeof section.createdAt === "string"
            ? new Date(section.createdAt).getTime()
            : Date.now(),
          updatedAtEpochMs: typeof section.updatedAt === "string"
            ? new Date(section.updatedAt).getTime()
            : Date.now(),
        })),
      });

      set({ isDirty: false });
    } catch (error) {
      console.error("Failed to save resume:", error);
    } finally {
      set({ isSaving: false });
    }
  },

  _scheduleSave: () => {
    const { _saveTimeout } = get();
    if (_saveTimeout) clearTimeout(_saveTimeout);

    const timeout = setTimeout(() => {
      get().save();
    }, AUTOSAVE_DELAY);

    set({ _saveTimeout: timeout });
  },

  reset: () => {
    const { _saveTimeout } = get();
    if (_saveTimeout) clearTimeout(_saveTimeout);
    set({
      currentResume: null,
      sections: [],
      isDirty: false,
      isSaving: false,
      _saveTimeout: null,
    });
  },
}));

export { generateId };
