import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditableText } from "../fields/editable-text";
import { EditableSelect } from "../fields/editable-select";
import { FieldWrapper } from "../fields/field-wrapper";
import { generateId } from "../../../stores/resume-store";
import type { ResumeSection } from "../../../types/resume";
import type { LanguagesContent, LanguageItem } from "../../../types/resume";

interface Props {
  section: ResumeSection;
  onUpdate: (content: Partial<LanguagesContent>) => void;
}

const PROFICIENCY_OPTIONS = [
  { label: "Native", value: "native" },
  { label: "Fluent", value: "fluent" },
  { label: "Professional", value: "professional" },
  { label: "Conversational", value: "conversational" },
  { label: "Basic", value: "basic" },
];

export function LanguagesSection({ section, onUpdate }: Props) {
  const { t } = useTranslation();
  const content = section.content as Partial<LanguagesContent>;
  const items: LanguageItem[] = (content.items || []) as LanguageItem[];

  const addItem = () => {
    const newItem: LanguageItem = {
      id: generateId(),
      language: "",
      proficiency: "conversational",
      description: "",
    };
    onUpdate({ items: [...items, newItem] });
  };

  const updateItem = (index: number, data: Partial<LanguageItem>) => {
    const updated = items.map((item: LanguageItem, i: number) =>
      i === index ? { ...item, ...data } : item
    );
    onUpdate({ items: updated });
  };

  const removeItem = (index: number) => {
    onUpdate({ items: items.filter((_: LanguageItem, i: number) => i !== index) });
  };

  return (
    <div className="space-y-4">
      {items.map((item: LanguageItem, index: number) => (
        <div key={item.id || `lang-${index}`} className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">#{index + 1}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 cursor-pointer p-1 text-zinc-400 hover:text-red-500"
              onClick={() => removeItem(index)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <FieldWrapper>
            <EditableText
              label={t("editor.fields.language")}
              value={item.language}
              onChange={(v) => updateItem(index, { language: v })}
            />
            <EditableSelect
              label={t("editor.fields.proficiency")}
              value={item.proficiency}
              onChange={(v) => updateItem(index, { proficiency: v })}
              options={PROFICIENCY_OPTIONS}
            />
          </FieldWrapper>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={addItem}
        className="w-full cursor-pointer gap-1"
      >
        <Plus className="h-3.5 w-3.5" />
        {t("editor.fields.addItem")}
      </Button>
    </div>
  );
}
