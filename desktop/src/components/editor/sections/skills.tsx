import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { EditableText } from "../fields/editable-text";
import { EditableList } from "../fields/editable-list";
import { generateId } from "../../../stores/resume-store";
import type { ResumeSection } from "../../../types/resume";
import type { SkillsContent, SkillCategory } from "../../../types/resume";

interface Props {
  section: ResumeSection;
  onUpdate: (content: Partial<SkillsContent>) => void;
}

export function SkillsSection({ section, onUpdate }: Props) {
  const { t } = useTranslation();
  const content = section.content as Partial<SkillsContent>;
  const categories: SkillCategory[] = (content.categories || []) as SkillCategory[];

  const addCategory = () => {
    const newCategory: SkillCategory = {
      id: generateId(),
      name: "",
      skills: [],
    };
    onUpdate({ categories: [...categories, newCategory] });
  };

  const updateCategory = (index: number, data: Partial<SkillCategory>) => {
    const updated = categories.map((cat: SkillCategory, i: number) =>
      i === index ? { ...cat, ...data } : cat
    );
    onUpdate({ categories: updated });
  };

  const removeCategory = (index: number) => {
    onUpdate({ categories: categories.filter((_: SkillCategory, i: number) => i !== index) });
  };

  return (
    <div className="space-y-4">
      {categories.map((category: SkillCategory, index: number) => (
        <div key={category.id || `skill-${index}`}>
          {index > 0 ? <Separator className="mb-4" /> : null}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <EditableText
                label={t("editor.fields.skillCategory")}
                value={category.name}
                onChange={(value) => updateCategory(index, { name: value })}
              />
              <Button
                variant="ghost"
                size="sm"
                className="mt-5 h-7 cursor-pointer p-1 text-zinc-400 hover:text-red-500"
                onClick={() => removeCategory(index)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <EditableList
              label={t("editor.fields.technologies")}
              items={category.skills || []}
              onChange={(value) => updateCategory(index, { skills: value })}
            />
          </div>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={addCategory}
        className="w-full cursor-pointer gap-1"
      >
        <Plus className="h-3.5 w-3.5" />
        {t("editor.fields.addItem")}
      </Button>
    </div>
  );
}
