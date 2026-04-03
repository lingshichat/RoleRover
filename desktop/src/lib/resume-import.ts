import type { ParsedResume } from "@/lib/ai/parse-schema";
import mupdfWasmUrl from "../../../node_modules/mupdf/dist/mupdf-wasm.wasm?url";
import {
  importDocument,
  type DesktopDocumentDetail,
  type ImportDocumentInput,
} from "./desktop-api";
import {
  getDesktopAiRuntimeConfig,
  runPromptStream,
} from "../components/editor/ai-dialog-helpers";

type SupportedResumeImportMimeType =
  | "application/pdf"
  | "image/png"
  | "image/jpeg"
  | "image/webp";

export type ResumeImportStage =
  | "validating"
  | "extracting"
  | "rendering"
  | "parsing"
  | "saving";

export type ResumeImportErrorCode =
  | "vision_model_required_for_image"
  | "vision_model_required_for_scanned_pdf";

export interface ResumeImportProgress {
  stage: ResumeImportStage;
  completed: number;
  total: number;
  fileName: string;
}

export class ResumeImportError extends Error {
  constructor(public readonly code: ResumeImportErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ResumeImportError";
  }
}

interface ImportResumeFromFileInput {
  file: File;
  template?: string;
  language?: string;
  onProgress?: (progress: ResumeImportProgress) => void;
}

interface ResumePromptPayload {
  prompt: string;
  images?: string[];
  requiresVision?: boolean;
}

interface MupdfModuleConfig {
  locateFile?: (path: string, prefix: string) => string;
}

type GlobalWithMupdfModule = typeof globalThis & {
  $libmupdf_wasm_Module?: MupdfModuleConfig;
};

const TEXT_BASED_PDF_THRESHOLD = 200;

export const MAX_RESUME_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const SYSTEM_PROMPT = `You are a resume parser. Extract ALL information from the resume into the EXACT JSON schema below.

REQUIRED JSON SCHEMA:
{"personalInfo":{"fullName":"","jobTitle":"","age":"","gender":"","politicalStatus":"","ethnicity":"","hometown":"","maritalStatus":"","yearsOfExperience":"","educationLevel":"","email":"","phone":"","wechat":"","location":"","website":"","linkedin":"","github":""},"summary":"","workExperience":[{"company":"Company A","position":"","location":"","startDate":"YYYY-MM","endDate":"YYYY-MM or null","current":false,"description":"","highlights":["bullet 1","bullet 2"]},{"company":"Company B","position":"","location":"","startDate":"YYYY-MM","endDate":"YYYY-MM","current":false,"description":"","highlights":[]}],"education":[{"institution":"University A","degree":"","field":"","location":"","startDate":"YYYY-MM","endDate":"YYYY-MM","gpa":"","highlights":[]},{"institution":"University B","degree":"","field":"","location":"","startDate":"YYYY-MM","endDate":"YYYY-MM","gpa":"","highlights":[]}],"skills":[{"name":"category name","skills":["skill1","skill2"]}],"projects":[{"name":"Project A","description":"","technologies":[],"highlights":[]},{"name":"Project B","description":"","technologies":[],"highlights":[]}],"certifications":[{"name":"","issuer":"","date":""}],"languages":[{"language":"","proficiency":""}]}

RULES:
- You MUST use the EXACT field names shown above (fullName, jobTitle, workExperience, etc.)
- Output compact single-line JSON. No indentation, no newlines.
- You are a JSON API. Your entire response must be a single valid JSON object starting with { and ending with }. Do NOT use markdown syntax. Do NOT wrap in code fences. Do NOT add any text before or after the JSON.
- Use YYYY-MM for dates. Empty string "" for missing fields.
- For current jobs: current=true, endDate=null.
- Omit empty arrays (e.g. if no projects, omit "projects" entirely).
- Extract ALL items for EVERY section — every work experience, every project, every education entry, every certification, every language. Do NOT merge or omit any entries. If the resume has 3 projects, return 3 objects in the projects array. If the resume has 5 work experiences, return 5 objects in the workExperience array.
- Read ALL pages of the document thoroughly. Information may span multiple pages.`;

function emitImportProgress(
  onProgress: ImportResumeFromFileInput["onProgress"],
  progress: ResumeImportProgress,
) {
  onProgress?.(progress);
}

export function resolveResumeImportMimeType(
  file: Pick<File, "name" | "type">,
): SupportedResumeImportMimeType | null {
  const fileType = file.type.trim().toLowerCase();

  if (fileType === "application/pdf") {
    return fileType;
  }

  if (fileType === "image/png" || fileType === "image/jpeg" || fileType === "image/webp") {
    return fileType;
  }

  const lowerName = file.name.trim().toLowerCase();
  if (lowerName.endsWith(".pdf")) return "application/pdf";
  if (lowerName.endsWith(".png")) return "image/png";
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "image/jpeg";
  if (lowerName.endsWith(".webp")) return "image/webp";

  return null;
}

export async function importResumeFromFile({
  file,
  template,
  language = "zh",
  onProgress,
}: ImportResumeFromFileInput): Promise<DesktopDocumentDetail> {
  emitImportProgress(onProgress, {
    stage: "validating",
    completed: 0,
    total: 1,
    fileName: file.name,
  });

  const aiRuntime = await getDesktopAiRuntimeConfig();
  const promptPayload = await buildResumePromptPayload(file, {
    fileName: file.name,
    visionModel: aiRuntime.resumeImportVisionModel,
    onProgress,
  });

  emitImportProgress(onProgress, {
    stage: "validating",
    completed: 1,
    total: 1,
    fileName: file.name,
  });

  emitImportProgress(onProgress, {
    stage: "parsing",
    completed: 0,
    total: 1,
    fileName: file.name,
  });

  const rawResponse = await runPromptStream({
    provider: aiRuntime.provider,
    model: promptPayload.requiresVision
      ? aiRuntime.resumeImportVisionModel || aiRuntime.model
      : aiRuntime.model,
    baseUrl: aiRuntime.baseUrl,
    prompt: promptPayload.prompt,
    systemPrompt: SYSTEM_PROMPT,
    images: promptPayload.images,
  });

  emitImportProgress(onProgress, {
    stage: "parsing",
    completed: 1,
    total: 1,
    fileName: file.name,
  });

  const rawJson = parseJsonFromText(rawResponse);

  if (!rawJson || typeof rawJson !== "object") {
    throw new Error("Failed to parse AI response as resume JSON.");
  }

  const parsedResume = mapToResumeSchema(rawJson as Record<string, unknown>);
  const documentInput = buildImportDocumentInput(parsedResume, {
    language,
    template,
    fallbackTitle: stripFileExtension(file.name),
  });

  emitImportProgress(onProgress, {
    stage: "saving",
    completed: 0,
    total: 1,
    fileName: file.name,
  });

  const imported = await importDocument(documentInput);

  emitImportProgress(onProgress, {
    stage: "saving",
    completed: 1,
    total: 1,
    fileName: file.name,
  });

  return imported;
}

async function buildResumePromptPayload(
  file: File,
  options: {
    fileName: string;
    visionModel?: string;
    onProgress?: (progress: ResumeImportProgress) => void;
  },
): Promise<ResumePromptPayload> {
  const mimeType = resolveResumeImportMimeType(file);

  if (!mimeType) {
    throw new Error("Unsupported resume file type. Accepted: PDF, PNG, JPG, WebP.");
  }

  if (mimeType === "application/pdf") {
    return buildPdfPromptPayload(file, options);
  }

  if (!options.visionModel?.trim()) {
    throw new ResumeImportError("vision_model_required_for_image");
  }

  return {
    prompt:
      "Extract all resume information from this image. Use the EXACT JSON schema from the system prompt.",
    images: [await readBlobAsDataUrl(file)],
    requiresVision: true,
  };
}

async function buildPdfPromptPayload(
  file: File,
  options: {
    fileName: string;
    visionModel?: string;
    onProgress?: (progress: ResumeImportProgress) => void;
  },
): Promise<ResumePromptPayload> {
  const { default: mupdf } = await loadMupdf();
  const buffer = new Uint8Array(await file.arrayBuffer());
  const document = mupdf.Document.openDocument(buffer, "application/pdf");
  const pageCount = document.countPages();
  const parts: string[] = [];

  emitImportProgress(options.onProgress, {
    stage: "extracting",
    completed: 0,
    total: pageCount,
    fileName: options.fileName,
  });

  for (let index = 0; index < pageCount; index += 1) {
    const page = document.loadPage(index);
    parts.push(page.toStructuredText("preserve-whitespace").asText());
    emitImportProgress(options.onProgress, {
      stage: "extracting",
      completed: index + 1,
      total: pageCount,
      fileName: options.fileName,
    });
  }

  const extractedText = parts.join("\n").trim();
  if (extractedText.length > TEXT_BASED_PDF_THRESHOLD) {
    return {
      prompt: `Below is the full text extracted from a resume PDF. Extract all resume information using the EXACT JSON schema from the system prompt.\n\n---\n${extractedText}\n---`,
    };
  }

  if (!options.visionModel?.trim()) {
    throw new ResumeImportError("vision_model_required_for_scanned_pdf");
  }

  const images: string[] = [];
  emitImportProgress(options.onProgress, {
    stage: "rendering",
    completed: 0,
    total: pageCount,
    fileName: options.fileName,
  });

  for (let index = 0; index < pageCount; index += 1) {
    const page = document.loadPage(index);
    const pixmap = page.toPixmap(
      mupdf.Matrix.scale(2, 2),
      mupdf.ColorSpace.DeviceRGB,
      false,
      true,
    );
    const pngBytes = new Uint8Array(pixmap.asPNG());

    images.push(
      await readBlobAsDataUrl(new Blob([pngBytes], { type: "image/png" })),
    );
    emitImportProgress(options.onProgress, {
      stage: "rendering",
      completed: index + 1,
      total: pageCount,
      fileName: options.fileName,
    });
  }

  if (images.length === 0) {
    throw new Error("Failed to render PDF pages for resume parsing.");
  }

  return {
    prompt:
      "Extract all resume information from these resume page images. Use the EXACT JSON schema from the system prompt.",
    images,
    requiresVision: true,
  };
}

async function loadMupdf() {
  const runtime = globalThis as GlobalWithMupdfModule;
  const previousConfig = runtime.$libmupdf_wasm_Module;

  runtime.$libmupdf_wasm_Module = {
    ...previousConfig,
    locateFile: (path: string, prefix: string) => {
      if (path === "mupdf-wasm.wasm") {
        return mupdfWasmUrl;
      }

      if (previousConfig?.locateFile) {
        return previousConfig.locateFile(path, prefix);
      }

      return `${prefix}${path}`;
    },
  };

  return import("mupdf");
}

function stripFileExtension(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, "").trim();
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Failed to convert file to data URL."));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error("Failed to read file."));
    };

    reader.readAsDataURL(blob);
  });
}

function parseJsonFromText(text: string): unknown | null {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?\s*```\s*$/, "");
  cleaned = cleaned.trim();

  const candidates: string[] = [cleaned];
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start !== -1 && end > start) {
    candidates.push(cleaned.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      const repaired = repairTruncatedJson(candidate);
      if (!repaired) {
        continue;
      }

      try {
        return JSON.parse(repaired);
      } catch {
        // Try the next candidate.
      }
    }
  }

  return null;
}

function repairTruncatedJson(text: string): string | null {
  let value = text.trim();
  if (!value.startsWith("{") && !value.startsWith("[")) {
    return null;
  }

  value = value.replace(/,\s*$/, "");
  value = value.replace(/,\s*"[^"]*"\s*:\s*"[^"]*$/, "");
  if (value.match(/:\s*"[^"]*$/)) {
    value += '"';
  }
  value = value.replace(/,\s*"[^"]*"?\s*:?\s*$/, "");
  value = value.replace(/,\s*$/, "");

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\" && inString) {
      escaped = true;
      continue;
    }

    if (character === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (character === "{") {
      stack.push("}");
    } else if (character === "[") {
      stack.push("]");
    } else if ((character === "}" || character === "]") && stack.length > 0) {
      stack.pop();
    }
  }

  if (inString) {
    value += '"';
  }

  while (stack.length > 0) {
    value += stack.pop();
  }

  return value;
}

function mapToResumeSchema(raw: Record<string, unknown>): ParsedResume {
  const personalInfoSource = (
    raw.personalInfo ||
    raw.personal_info ||
    raw.basicInfo ||
    raw.basic_info ||
    {}
  ) as Record<string, unknown>;
  const jobIntentionSource = (
    raw.jobIntention ||
    raw.job_intention ||
    {}
  ) as Record<string, unknown>;

  const personalInfo = {
    fullName: str(personalInfoSource.fullName || personalInfoSource.name || personalInfoSource.姓名 || ""),
    jobTitle: str(
      personalInfoSource.jobTitle ||
        personalInfoSource.title ||
        personalInfoSource.position ||
        jobIntentionSource.position ||
        jobIntentionSource.jobTitle ||
        personalInfoSource.职位 ||
        "",
    ),
    age: str(personalInfoSource.age || personalInfoSource.年龄 || ""),
    gender: str(personalInfoSource.gender || personalInfoSource.sex || personalInfoSource.性别 || ""),
    politicalStatus: str(
      personalInfoSource.politicalStatus ||
        personalInfoSource.political_status ||
        personalInfoSource.政治面貌 ||
        "",
    ),
    ethnicity: str(personalInfoSource.ethnicity || personalInfoSource.nationality || personalInfoSource.民族 || ""),
    hometown: str(
      personalInfoSource.hometown ||
        personalInfoSource.nativePlace ||
        personalInfoSource.native_place ||
        personalInfoSource.籍贯 ||
        "",
    ),
    maritalStatus: str(
      personalInfoSource.maritalStatus ||
        personalInfoSource.marital_status ||
        personalInfoSource.婚姻状况 ||
        personalInfoSource.婚姻 ||
        "",
    ),
    yearsOfExperience: str(
      personalInfoSource.yearsOfExperience ||
        personalInfoSource.years_of_experience ||
        personalInfoSource.experience ||
        personalInfoSource.工作年限 ||
        personalInfoSource.工作经验 ||
        "",
    ),
    educationLevel: str(
      personalInfoSource.educationLevel ||
        personalInfoSource.education_level ||
        personalInfoSource.education ||
        personalInfoSource.最高学历 ||
        personalInfoSource.学历 ||
        "",
    ),
    email: str(personalInfoSource.email || personalInfoSource.邮箱 || ""),
    phone: str(personalInfoSource.phone || personalInfoSource.tel || personalInfoSource.mobile || personalInfoSource.电话 || personalInfoSource.手机 || ""),
    wechat: str(personalInfoSource.wechat || personalInfoSource.weixin || personalInfoSource.微信 || ""),
    location: str(
      personalInfoSource.location ||
        personalInfoSource.city ||
        personalInfoSource.address ||
        jobIntentionSource.city ||
        personalInfoSource.地址 ||
        personalInfoSource.城市 ||
        "",
    ),
    website: str(personalInfoSource.website || personalInfoSource.url || personalInfoSource.homepage || ""),
    linkedin: str(personalInfoSource.linkedin || ""),
    github: str(personalInfoSource.github || ""),
  };

  const summary = str(
    raw.summary ||
      raw.objective ||
      raw.selfIntroduction ||
      raw.selfEvaluation ||
      raw.profile ||
      raw.about ||
      "",
  );

  const workExperience = mapArray(
    raw.workExperience || raw.work_experience || raw.experience || raw.work || [],
    (item: Record<string, unknown>) => {
      const rawEndDate = item.endDate ?? item.end_date ?? item.endTime ?? "";
      const endDateString = str(rawEndDate);
      const current =
        Boolean(item.current || item.isCurrent) ||
        rawEndDate === null ||
        endDateString === "至今" ||
        endDateString.toLowerCase() === "present" ||
        endDateString.toLowerCase() === "current";

      return {
        company: str(item.company || item.companyName || item.employer || ""),
        position: str(item.position || item.title || item.jobTitle || item.role || ""),
        location: str(item.location || item.city || ""),
        startDate: str(item.startDate || item.start_date || item.startTime || ""),
        endDate: current ? null : endDateString,
        current,
        description: str(item.description || item.desc || item.content || ""),
        highlights: toStringArray(
          item.highlights || item.achievements || item.bullets || item.duties || [],
        ),
      };
    },
  );

  const education = mapArray(
    raw.education || raw.edu || [],
    (item: Record<string, unknown>) => ({
      institution: str(item.institution || item.school || item.university || item.college || item.schoolName || ""),
      degree: str(item.degree || item.学历 || ""),
      field: str(item.field || item.major || item.专业 || ""),
      location: str(item.location || ""),
      startDate: str(item.startDate || item.start_date || item.startTime || ""),
      endDate: str(item.endDate || item.end_date || item.endTime || ""),
      gpa: str(item.gpa || item.GPA || ""),
      highlights: toStringArray(item.highlights || item.achievements || item.courses || []),
    }),
  );

  const skills = mapSkills(raw.skills || raw.skill || []);

  const projects = mapArray(
    raw.projects || raw.project || [],
    (item: Record<string, unknown>) => ({
      name: str(item.name || item.projectName || item.title || ""),
      url: str(item.url || item.link || ""),
      startDate: str(item.startDate || item.start_date || ""),
      endDate: str(item.endDate || item.end_date || ""),
      description: str(item.description || item.desc || item.content || ""),
      technologies: toStringArray(item.technologies || item.tech || item.techStack || item.skills || []),
      highlights: toStringArray(item.highlights || item.achievements || []),
    }),
  );

  const certifications = mapArray(
    raw.certifications || raw.certificates || raw.certs || [],
    (item: Record<string, unknown>) => ({
      name: str(item.name || item.title || ""),
      issuer: str(item.issuer || item.organization || item.org || ""),
      date: str(item.date || item.issueDate || ""),
      url: str(item.url || ""),
    }),
  );

  const languages = mapArray(
    raw.languages || raw.language || [],
    (item: Record<string, unknown>) => ({
      language: str(item.language || item.name || ""),
      proficiency: str(item.proficiency || item.level || ""),
    }),
  );

  return {
    personalInfo,
    ...(summary ? { summary } : {}),
    ...(workExperience.length ? { workExperience } : {}),
    ...(education.length ? { education } : {}),
    ...(skills.length ? { skills } : {}),
    ...(projects.length ? { projects } : {}),
    ...(certifications.length ? { certifications } : {}),
    ...(languages.length ? { languages } : {}),
  };
}

function buildImportDocumentInput(
  parsed: ParsedResume,
  options: {
    language: string;
    template?: string;
    fallbackTitle: string;
  },
): ImportDocumentInput {
  const isChinese = options.language.toLowerCase().startsWith("zh");
  const title =
    parsed.personalInfo?.fullName ||
    options.fallbackTitle ||
    (isChinese ? "未命名简历" : "Untitled Resume");

  const sections: ImportDocumentInput["sections"] = [
    {
      sectionType: "personal_info",
      title: isChinese ? "个人信息" : "Personal Info",
      content: {
        fullName: parsed.personalInfo?.fullName || "",
        jobTitle: parsed.personalInfo?.jobTitle || "",
        age: parsed.personalInfo?.age || "",
        gender: parsed.personalInfo?.gender || "",
        politicalStatus: parsed.personalInfo?.politicalStatus || "",
        ethnicity: parsed.personalInfo?.ethnicity || "",
        hometown: parsed.personalInfo?.hometown || "",
        maritalStatus: parsed.personalInfo?.maritalStatus || "",
        yearsOfExperience: parsed.personalInfo?.yearsOfExperience || "",
        educationLevel: parsed.personalInfo?.educationLevel || "",
        email: parsed.personalInfo?.email || "",
        phone: parsed.personalInfo?.phone || "",
        wechat: parsed.personalInfo?.wechat || "",
        location: parsed.personalInfo?.location || "",
        website: parsed.personalInfo?.website || "",
        linkedin: parsed.personalInfo?.linkedin || "",
        github: parsed.personalInfo?.github || "",
      },
    },
  ];

  if (parsed.summary) {
    sections.push({
      sectionType: "summary",
      title: isChinese ? "个人简介" : "Summary",
      content: { text: parsed.summary },
    });
  }

  if (parsed.workExperience?.length) {
    sections.push({
      sectionType: "work_experience",
      title: isChinese ? "工作经历" : "Work Experience",
      content: {
        items: parsed.workExperience.map((item) => ({
          id: crypto.randomUUID(),
          company: item.company,
          position: item.position,
          location: item.location || "",
          startDate: item.startDate,
          endDate: item.endDate,
          current: item.current,
          description: item.description,
          technologies: [],
          highlights: item.highlights,
        })),
      },
    });
  }

  if (parsed.education?.length) {
    sections.push({
      sectionType: "education",
      title: isChinese ? "教育背景" : "Education",
      content: {
        items: parsed.education.map((item) => ({
          id: crypto.randomUUID(),
          institution: item.institution,
          degree: item.degree,
          field: item.field,
          location: item.location || "",
          startDate: item.startDate,
          endDate: item.endDate,
          gpa: item.gpa || "",
          highlights: item.highlights,
        })),
      },
    });
  }

  if (parsed.skills?.length) {
    sections.push({
      sectionType: "skills",
      title: isChinese ? "技能特长" : "Skills",
      content: {
        categories: parsed.skills.map((item) => ({
          id: crypto.randomUUID(),
          name: item.name,
          skills: item.skills,
        })),
      },
    });
  }

  if (parsed.projects?.length) {
    sections.push({
      sectionType: "projects",
      title: isChinese ? "项目经历" : "Projects",
      content: {
        items: parsed.projects.map((item) => ({
          id: crypto.randomUUID(),
          name: item.name,
          url: item.url || "",
          startDate: item.startDate || "",
          endDate: item.endDate || "",
          description: item.description,
          technologies: item.technologies,
          highlights: item.highlights,
        })),
      },
    });
  }

  if (parsed.certifications?.length) {
    sections.push({
      sectionType: "certifications",
      title: isChinese ? "资格证书" : "Certifications",
      content: {
        items: parsed.certifications.map((item) => ({
          id: crypto.randomUUID(),
          name: item.name,
          issuer: item.issuer,
          date: item.date,
          url: item.url || "",
        })),
      },
    });
  }

  if (parsed.languages?.length) {
    sections.push({
      sectionType: "languages",
      title: isChinese ? "语言能力" : "Languages",
      content: {
        items: parsed.languages.map((item) => ({
          id: crypto.randomUUID(),
          language: item.language,
          proficiency: item.proficiency,
        })),
      },
    });
  }

  return {
    title,
    template: options.template || "classic",
    language: isChinese ? "zh" : "en",
    sections,
  };
}

function str(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function mapArray<T>(
  raw: unknown,
  mapper: (item: Record<string, unknown>) => T,
): T[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((item) => mapper(item as Record<string, unknown>));
}

function toStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((value) => String(value)).filter(Boolean);
}

function mapSkills(raw: unknown): { name: string; skills: string[] }[] {
  if (!raw) {
    return [];
  }

  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      return [];
    }

    if (typeof raw[0] === "object" && raw[0] !== null) {
      return raw
        .map((item: Record<string, unknown>) => ({
          name: str(item.name || item.category || item.type || item.group || "Skills"),
          skills: toStringArray(item.skills || item.items || item.list || item.keywords || []),
        }))
        .filter((item) => item.skills.length > 0);
    }

    if (typeof raw[0] === "string") {
      return [{ name: "Skills", skills: raw.map(String) }];
    }
  }

  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return Object.entries(raw as Record<string, unknown>)
      .filter(([, value]) => Array.isArray(value))
      .map(([key, value]) => ({
        name: key,
        skills: (value as unknown[]).map(String),
      }));
  }

  return [];
}
