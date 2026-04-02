import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditableText } from "../fields/editable-text";
import { Separator } from "@/components/ui/separator";
import { generateId } from "../../../stores/resume-store";
import type { ResumeSection } from "../../../types/resume";
import type { GitHubContent, GitHubRepoItem } from "../../../types/resume";

interface Props {
  section: ResumeSection;
  onUpdate: (content: Partial<GitHubContent>) => void;
}

export function GitHubSection({ section, onUpdate }: Props) {
  const { t } = useTranslation();
  const content = section.content as Partial<GitHubContent>;
  const items: GitHubRepoItem[] = (content.items || []) as GitHubRepoItem[];

  const addItem = () => {
    const newItem: GitHubRepoItem = {
      id: generateId(),
      repoUrl: "",
      name: "",
      stars: 0,
      language: "",
      description: "",
    };
    onUpdate({ items: [...items, newItem] });
  };

  const updateItem = (index: number, data: Partial<GitHubRepoItem>) => {
    const updated = items.map((item: GitHubRepoItem, i: number) =>
      i === index ? { ...item, ...data } : item
    );
    onUpdate({ items: updated });
  };

  const removeItem = (index: number) => {
    onUpdate({ items: items.filter((_: GitHubRepoItem, i: number) => i !== index) });
  };

  return (
    <div className="space-y-4">
      {items.map((item: GitHubRepoItem, index: number) => (
        <div key={item.id || `gh-${index}`}>
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
                label={t("editor.fields.repoUrl")}
                value={item.repoUrl}
                onChange={(v) => updateItem(index, { repoUrl: v })}
              />
              <EditableText
                label={t("editor.fields.repoName")}
                value={item.name}
                onChange={(v) => updateItem(index, { name: v })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <EditableText
                label={t("editor.fields.language")}
                value={item.language}
                onChange={(v) => updateItem(index, { language: v })}
              />
              <EditableText
                label={t("editor.fields.description")}
                value={item.description}
                onChange={(v) => updateItem(index, { description: v })}
              />
            </div>
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
