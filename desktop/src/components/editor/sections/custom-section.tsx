import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditableText } from "../fields/editable-text";
import { EditableRichText } from "../fields/editable-rich-text";
import { Separator } from "@/components/ui/separator";
import { generateId } from "../../../stores/resume-store";
import type { ResumeSection } from "../../../types/resume";
import type { CustomContent, CustomItem } from "../../../types/resume";

interface Props {
  section: ResumeSection;
  onUpdate: (content: Partial<CustomContent>) => void;
}

export function CustomSection({ section, onUpdate }: Props) {
  const { t } = useTranslation();
  const content = section.content as Partial<CustomContent>;
  const items: CustomItem[] = (content.items || []) as CustomItem[];

  const addItem = () => {
    const newItem: CustomItem = {
      id: generateId(),
      title: "",
      subtitle: "",
      date: "",
      description: "",
    };
    onUpdate({ items: [...items, newItem] });
  };

  const updateItem = (index: number, data: Partial<CustomItem>) => {
    const updated = items.map((item: CustomItem, i: number) =>
      i === index ? { ...item, ...data } : item
    );
    onUpdate({ items: updated });
  };

  const removeItem = (index: number) => {
    onUpdate({ items: items.filter((_: CustomItem, i: number) => i !== index) });
  };

  return (
    <div className="space-y-4">
      {items.map((item: CustomItem, index: number) => (
        <div key={item.id || `custom-${index}`}>
          {index > 0 && <Separator className="mb-4" />}
          <div className="space-y-3">
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
            <div className="grid grid-cols-2 gap-3">
              <EditableText
                label={t("editor.fields.title")}
                value={item.title}
                onChange={(v) => updateItem(index, { title: v })}
              />
              <EditableText
                label={t("editor.fields.subtitle")}
                value={item.subtitle || ""}
                onChange={(v) => updateItem(index, { subtitle: v })}
              />
            </div>
            <EditableText
              label={t("editor.fields.date")}
              value={item.date || ""}
              onChange={(v) => updateItem(index, { date: v })}
            />
            <EditableRichText
              label={t("editor.fields.description")}
              value={item.description}
              onChange={(v) => updateItem(index, { description: v })}
            />
          </div>
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
