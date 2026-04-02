import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditableText } from "../fields/editable-text";
import { FieldWrapper } from "../fields/field-wrapper";
import { generateId } from "../../../stores/resume-store";
import type { ResumeSection } from "../../../types/resume";
import type { CertificationsContent, CertificationItem } from "../../../types/resume";

interface Props {
  section: ResumeSection;
  onUpdate: (content: Partial<CertificationsContent>) => void;
}

export function CertificationsSection({ section, onUpdate }: Props) {
  const { t } = useTranslation();
  const content = section.content as Partial<CertificationsContent>;
  const items: CertificationItem[] = (content.items || []) as CertificationItem[];

  const addItem = () => {
    const newItem: CertificationItem = {
      id: generateId(),
      name: "",
      issuer: "",
      date: "",
      url: "",
    };
    onUpdate({ items: [...items, newItem] });
  };

  const updateItem = (index: number, data: Partial<CertificationItem>) => {
    const updated = items.map((item: CertificationItem, i: number) =>
      i === index ? { ...item, ...data } : item
    );
    onUpdate({ items: updated });
  };

  const removeItem = (index: number) => {
    onUpdate({ items: items.filter((_: CertificationItem, i: number) => i !== index) });
  };

  return (
    <div className="space-y-4">
      {items.map((item: CertificationItem, index: number) => (
        <div key={item.id || `cert-${index}`} className="space-y-3">
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
              label={t("editor.fields.certName")}
              value={item.name}
              onChange={(v) => updateItem(index, { name: v })}
            />
            <EditableText
              label={t("editor.fields.issuer")}
              value={item.issuer}
              onChange={(v) => updateItem(index, { issuer: v })}
            />
          </FieldWrapper>
          <FieldWrapper>
            <EditableText
              label={t("editor.fields.certDate")}
              value={item.date}
              onChange={(v) => updateItem(index, { date: v })}
            />
            <EditableText
              label={t("editor.fields.url")}
              value={item.url || ""}
              onChange={(v) => updateItem(index, { url: v })}
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
