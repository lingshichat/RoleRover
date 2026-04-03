import type { Resume as SharedResume, ResumeSection as SharedResumeSection } from "@/types/resume";
import type {
  Resume as DesktopResume,
  ResumeSection as DesktopResumeSection,
} from "../types/resume";

function normalizeDate(value: string): Date {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function cloneContent<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function toSharedResume(
  resume: DesktopResume,
  sections: DesktopResumeSection[],
): SharedResume {
  const normalizedSections: SharedResumeSection[] = sections.map((section) => ({
    id: section.id,
    resumeId: section.resumeId,
    type: section.type,
    title: section.title,
    sortOrder: section.sortOrder,
    visible: section.visible,
    content: cloneContent(section.content) as SharedResumeSection["content"],
    createdAt: normalizeDate(section.createdAt),
    updatedAt: normalizeDate(section.updatedAt),
  }));

  return {
    id: resume.id,
    userId: resume.userId,
    title: resume.title,
    template: resume.template,
    themeConfig: resume.themeConfig,
    isDefault: resume.isDefault,
    language: resume.language,
    targetJobTitle: resume.targetJobTitle,
    targetCompany: resume.targetCompany,
    sections: normalizedSections,
    createdAt: normalizeDate(resume.createdAt),
    updatedAt: normalizeDate(resume.updatedAt),
  };
}

export function prepareDesktopPdfHtml(
  html: string,
  options: { fitOnePage: boolean },
): string {
  if (!options.fitOnePage || !html.includes("</body>")) {
    return html;
  }

  const fitScript = `
<script>
(function () {
  const A4_HEIGHT_PX = 1123;
  const MIN_SCALE = 0.78;

  function waitForLayout() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  async function fitToOnePage() {
    try {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      await waitForLayout();

      const root = document.querySelector('.resume-export');
      if (!(root instanceof HTMLElement)) {
        return;
      }

      const currentHeight = root.scrollHeight;
      if (!currentHeight || currentHeight <= A4_HEIGHT_PX) {
        return;
      }

      const scale = Math.max(MIN_SCALE, Math.min(1, A4_HEIGHT_PX / currentHeight));
      root.dataset.fitOnePage = 'true';
      root.style.transformOrigin = 'top center';
      root.style.transform = 'scale(' + scale.toFixed(3) + ')';
      root.style.width = (100 / scale).toFixed(2) + '%';
      root.style.margin = '0 auto';
    } catch (error) {
      console.error('[desktop-export] fit-one-page failed', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function onReady() {
      document.removeEventListener('DOMContentLoaded', onReady);
      void fitToOnePage();
    });
    return;
  }

  void fitToOnePage();
})();
</script>`;

  return html.replace("</body>", `${fitScript}\n</body>`);
}
