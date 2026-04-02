import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateId, useResumeStore } from "../../stores/resume-store";
import type { Resume, SectionContent } from "../../types/resume";
import { Sparkles, X, Loader2 } from "lucide-react";

interface GenerateResumeDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export function GenerateResumeDialog({ open, onClose, onCreated }: GenerateResumeDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setResume } = useResumeStore();

  const [jobTitle, setJobTitle] = useState("");
  const [yearsOfExperience, setYearsOfExperience] = useState("");
  const [skills, setSkills] = useState("");
  const [industry, setIndustry] = useState("");
  const [language, setLanguage] = useState("en");
  const [isGenerating, setIsGenerating] = useState(false);

  const resetAndClose = () => {
    setJobTitle("");
    setYearsOfExperience("");
    setSkills("");
    setIndustry("");
    setLanguage("en");
    setIsGenerating(false);
    onClose();
  };

  const handleGenerate = async () => {
    if (!jobTitle.trim()) return;

    setIsGenerating(true);

    try {
      const id = generateId();
      const now = new Date().toISOString();
      // TODO: Implement actual AI generation via Tauri
      // For now, create a template resume
      const newResume: Resume = {
        id,
        userId: "desktop-workspace",
        title: `${jobTitle} Resume`,
        template: "modern",
        language,
        isDefault: false,
        themeConfig: {
          primaryColor: "#111827",
          accentColor: "#2563eb",
          fontFamily: "Inter",
          fontSize: "medium",
          lineSpacing: 1.6,
          margin: { top: 24, right: 24, bottom: 24, left: 24 },
          sectionSpacing: 16,
          avatarStyle: "circle",
        },
        sections: [
          {
            id: generateId(),
            resumeId: id,
            type: "personal_info",
            title: t("editor.sections.personalInfo"),
            sortOrder: 0,
            visible: true,
            content: {
              fullName: "Your Name",
              jobTitle,
              email: "email@example.com",
              phone: "+1 (000) 000-0000",
              location: "City, Country",
            } as unknown as SectionContent,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: generateId(),
            resumeId: id,
            type: "summary",
            title: t("editor.sections.summary"),
            sortOrder: 1,
            visible: true,
            content: {
              text: `Experienced ${jobTitle} with ${yearsOfExperience || "several"} years of expertise in ${industry || "the industry"}. Skilled in ${skills || "various relevant technologies"}.`,
            } as unknown as SectionContent,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: generateId(),
            resumeId: id,
            type: "skills",
            title: t("editor.sections.skills"),
            sortOrder: 2,
            visible: true,
            content: {
              categories: [
                {
                  id: generateId(),
                  name: "Technical Skills",
                  skills: skills ? skills.split(",").map((s) => s.trim()) : ["Skill 1", "Skill 2", "Skill 3"],
                },
              ],
            } as unknown as SectionContent,
            createdAt: now,
            updatedAt: now,
          },
        ],
        createdAt: now,
        updatedAt: now,
      };

      // Simulate AI generation delay
      await new Promise((resolve) => setTimeout(resolve, 2000));

      setResume(newResume);
      onCreated?.();
      resetAndClose();
      navigate({ to: "/editor/$id", params: { id: newResume.id } });
    } catch (error) {
      console.error("Failed to generate resume:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!open) return null;

  return (
    <div className="dialog-backdrop" onClick={resetAndClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="dialog-header">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-pink-500" />
            <h2 className="dialog-title">{t("generateResumeTitle")}</h2>
          </div>
          <button type="button" className="dialog-close" onClick={resetAndClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="dialog-body">
          <p className="text-sm text-zinc-500 mb-4">{t("generateResumeDescription")}</p>

          <div className="space-y-4">
            <div className="form-field">
              <label className="form-label">{t("generateResumeJobTitle")}</label>
              <Input
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder={t("generateResumeJobTitlePlaceholder")}
              />
            </div>

            <div className="form-field">
              <label className="form-label">{t("generateResumeYearsOfExperience")}</label>
              <Input
                value={yearsOfExperience}
                onChange={(e) => setYearsOfExperience(e.target.value)}
                placeholder={t("generateResumeYearsPlaceholder")}
              />
            </div>

            <div className="form-field">
              <label className="form-label">{t("generateResumeSkills")}</label>
              <Input
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                placeholder={t("generateResumeSkillsPlaceholder")}
              />
            </div>

            <div className="form-field">
              <label className="form-label">{t("generateResumeIndustry")}</label>
              <Input
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder={t("generateResumeIndustryPlaceholder")}
              />
            </div>

            <div className="form-field">
              <label className="form-label">{t("generateResumeLanguage")}</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="select-input"
              >
                <option value="en">English</option>
                <option value="zh">中文</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="dialog-footer">
          <Button variant="secondary" onClick={resetAndClose} disabled={isGenerating}>
            {t("commonCancel")}
          </Button>
          <Button onClick={() => void handleGenerate()} disabled={!jobTitle.trim() || isGenerating}>
            {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isGenerating ? t("generateResumeGenerating") : t("generateResumeGenerate")}
          </Button>
        </div>
      </div>
    </div>
  );
}
