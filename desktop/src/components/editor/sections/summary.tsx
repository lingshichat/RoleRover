import { useTranslation } from "react-i18next";
import { EditableRichText } from "../fields/editable-rich-text";
import type { ResumeSection } from "../../../types/resume";
import type { SummaryContent } from "../../../types/resume";

interface Props {
  section: ResumeSection;
  onUpdate: (content: Partial<SummaryContent>) => void;
}

export function SummarySection({ section, onUpdate }: Props) {
  const { t } = useTranslation();
  const content = section.content as Partial<SummaryContent>;

  return (
    <EditableRichText
      label={t("editor.fields.description")}
      value={content.text || ""}
      onChange={(v) => onUpdate({ text: v })}
    />
  );
}
