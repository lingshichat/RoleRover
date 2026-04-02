import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditableText } from "../fields/editable-text";
import { generateId } from "../../../stores/resume-store";
import type { ResumeSection } from "../../../types/resume";
import type { QrCodesContent, QrCodeItem } from "../../../types/resume";

interface Props {
  section: ResumeSection;
  onUpdate: (content: Partial<QrCodesContent>) => void;
}

export function QrCodesSection({ section, onUpdate }: Props) {
  const { t } = useTranslation();
  const content = section.content as Partial<QrCodesContent>;
  const items: QrCodeItem[] = (content.items || []) as QrCodeItem[];

  const addItem = () => {
    const newItem: QrCodeItem = {
      id: generateId(),
      label: "",
      url: "",
    };
    onUpdate({ items: [...items, newItem] });
  };

  const updateItem = (index: number, data: Partial<QrCodeItem>) => {
    const updated = items.map((item: QrCodeItem, i: number) =>
      i === index ? { ...item, ...data } : item
    );
    onUpdate({ items: updated });
  };

  const removeItem = (index: number) => {
    onUpdate({ items: items.filter((_: QrCodeItem, i: number) => i !== index) });
  };

  return (
    <div className="space-y-4">
      {items.map((item: QrCodeItem, index: number) => (
        <div key={item.id || `qr-${index}`} className="space-y-3">
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
              label={t("editor.fields.qrLabel")}
              value={item.label}
              onChange={(v) => updateItem(index, { label: v })}
            />
            <EditableText
              label={t("editor.fields.qrUrl")}
              value={item.url}
              onChange={(v) => updateItem(index, { url: v })}
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
        {t("editor.fields.qrAdd")}
      </Button>
    </div>
  );
}
