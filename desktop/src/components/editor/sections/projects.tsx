import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { EditableText } from "../fields/editable-text";
import { EditableDate } from "../fields/editable-date";
import { EditableRichText } from "../fields/editable-rich-text";
import { EditableList } from "../fields/editable-list";
import { FieldWrapper } from "../fields/field-wrapper";
import { generateId } from "../../../stores/resume-store";
import type { ResumeSection } from "../../../types/resume";
import type { ProjectsContent, ProjectItem } from "../../../types/resume";

interface Props {
  section: ResumeSection;
  onUpdate: (content: Partial<ProjectsContent>) => void;
}

export function ProjectsSection({ section, onUpdate }: Props) {
  const { t } = useTranslation();
  const content = section.content as Partial<ProjectsContent>;
  const items: ProjectItem[] = (content.items || []) as ProjectItem[];

  const addItem = () => {
    const newItem: ProjectItem = {
      id: generateId(),
      name: "",
      url: "",
      startDate: "",
      endDate: "",
      description: "",
      technologies: [],
      highlights: [],
    };
    onUpdate({ items: [...items, newItem] });
  };

  const updateItem = (index: number, data: Partial<ProjectItem>) => {
    const updated = items.map((item: ProjectItem, i: number) =>
      i === index ? { ...item, ...data } : item
    );
    onUpdate({ items: updated });
  };

  const removeItem = (index: number) => {
    onUpdate({ items: items.filter((_: ProjectItem, i: number) => i !== index) });
  };

  return (
    <div className="space-y-4">
      {items.map((item: ProjectItem, index: number) => (
        <div key={item.id || `proj-${index}`}>
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
            <FieldWrapper>
              <EditableText
                label={t("editor.fields.projectName")}
                value={item.name}
                onChange={(v) => updateItem(index, { name: v })}
              />
              <EditableText
                label={t("editor.fields.url")}
                value={item.url || ""}
                onChange={(v) => updateItem(index, { url: v })}
              />
            </FieldWrapper>
            <FieldWrapper>
              <EditableDate
                label={t("editor.fields.startDate")}
                value={item.startDate || ""}
                onChange={(v) => updateItem(index, { startDate: v })}
              />
              <EditableDate
                label={t("editor.fields.endDate")}
                value={item.endDate || ""}
                onChange={(v) => updateItem(index, { endDate: v })}
              />
            </FieldWrapper>
            <EditableRichText
              label={t("editor.fields.description")}
              value={item.description}
              onChange={(v) => updateItem(index, { description: v })}
            />
            <EditableList
              label={t("editor.fields.technologies")}
              items={item.technologies || []}
              onChange={(v) => updateItem(index, { technologies: v })}
            />
            <EditableList
              label={t("editor.fields.highlights")}
              items={item.highlights || []}
              onChange={(v) => updateItem(index, { highlights: v })}
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
