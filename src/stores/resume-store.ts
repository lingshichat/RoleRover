import { create } from 'zustand';
import type { Resume, ResumeSection, SectionContent } from '@/types/resume';
import { AUTOSAVE_DELAY } from '@/lib/constants';
import { generateId } from '@/lib/utils';
import { getSectionCollection, normalizeSectionContentForRender } from '@/lib/section-content';
import { useSettingsStore } from '@/stores/settings-store';

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
  save: () => Promise<void>;
  _scheduleSave: () => void;
  reset: () => void;
}

function ensureSectionEntryIds<T extends object>(entries: T[]): T[] {
  return entries.map((entry) => {
    const record = entry as T & { id?: unknown };
    return typeof record.id === 'string' && record.id.trim()
      ? entry
      : { ...record, id: generateId() } as T;
  });
}

function normalizeSectionContent(section: { type: string; content: unknown }): SectionContent {
  const content = normalizeSectionContentForRender(section.type, section.content);

  if ('items' in content) {
    content.items = ensureSectionEntryIds(getSectionCollection(content.items, 'items'));
  }

  if ('categories' in content) {
    content.categories = ensureSectionEntryIds(getSectionCollection(content.categories, 'categories'));
  }

  return content as unknown as SectionContent;
}

export const useResumeStore = create<ResumeStore>((set, get) => ({
  currentResume: null,
  sections: [],
  isDirty: false,
  isSaving: false,
  _saveTimeout: null,

  setResume: (resume) => {
    // Cancel any pending autosave to prevent stale data overwriting server changes (e.g., from AI tool calls)
    const { _saveTimeout } = get();
    if (_saveTimeout) clearTimeout(_saveTimeout);

    const sections = resume.sections.map((section) => ({
      ...section,
      content: normalizeSectionContent(section),
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
              content: normalizeSectionContent({
                type: s.type,
                content: {
                  ...(typeof s.content === 'object' && s.content !== null ? s.content as unknown as Record<string, unknown> : {}),
                  ...(typeof content === 'object' && content !== null ? content as unknown as Record<string, unknown> : {}),
                },
              }),
            }
          : s
      );
      return {
        sections,
        currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
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
        currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
        isDirty: true,
      };
    });
    get()._scheduleSave();
  },

  addSection: (section) => {
    set((state) => {
      const sections = [...state.sections, { ...section, content: normalizeSectionContent(section) }];
      return {
        sections,
        currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
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
        currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
        isDirty: true,
      };
    });
    get()._scheduleSave();
  },

  reorderSections: (sections) => {
    set((state) => ({
      sections,
      currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
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
        currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
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

  save: async () => {
    const { currentResume, sections, isDirty } = get();
    if (!currentResume || !isDirty) return;

    set({ isSaving: true });
    try {
      const fingerprint = typeof window !== 'undefined'
        ? localStorage.getItem('jade_fingerprint')
        : null;

      await fetch(`/api/resume/${currentResume.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
        },
        body: JSON.stringify({
          title: currentResume.title,
          template: currentResume.template,
          themeConfig: currentResume.themeConfig,
          sections: sections.map((s, i) => ({
            id: s.id,
            type: s.type,
            title: s.title,
            sortOrder: i,
            visible: s.visible,
            content: s.content,
          })),
        }),
      });

      set({ isDirty: false });
    } catch (error) {
      console.error('Failed to save resume:', error);
    } finally {
      set({ isSaving: false });
    }
  },

  _scheduleSave: () => {
    const { _saveTimeout } = get();
    if (_saveTimeout) clearTimeout(_saveTimeout);

    const { autoSave, autoSaveInterval, _hydrated } = useSettingsStore.getState();

    // If settings are hydrated and autoSave is off, only mark dirty, don't auto-save
    if (_hydrated && !autoSave) {
      set({ _saveTimeout: null });
      return;
    }

    const delay = _hydrated ? autoSaveInterval : AUTOSAVE_DELAY;
    const timeout = setTimeout(() => {
      get().save();
    }, delay);

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
