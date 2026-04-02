import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface EditableDateProps {
  label: string;
  value: string; // "YYYY-MM" format
  onChange: (value: string) => void;
}

const MONTHS = [
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
] as const;

export function EditableDate({ label, value, onChange }: EditableDateProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const [selectedYear, selectedMonth] = useMemo(() => {
    if (!value) return ["", ""];
    const parts = value.split("-");
    return [parts[0] || "", parts[1] || ""];
  }, [value]);

  const [browseYear, setBrowseYear] = useState(() => {
    return selectedYear ? Number(selectedYear) : new Date().getFullYear();
  });

  const displayText = useMemo(() => {
    if (!selectedYear || !selectedMonth) return "";
    return t("editor.fields.dateDisplay", {
      year: selectedYear,
      month: t(`editor.fields.months.${selectedMonth}` as any),
    });
  }, [selectedYear, selectedMonth, t]);

  const handleMonthClick = (month: string) => {
    onChange(`${browseYear}-${month}`);
    setOpen(false);
  };

  const handleClear = () => {
    onChange("");
    setOpen(false);
  };

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </label>
      <Popover
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (v) {
            setBrowseYear(
              selectedYear ? Number(selectedYear) : new Date().getFullYear()
            );
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="h-8 w-full cursor-pointer justify-start text-sm font-normal"
          >
            <CalendarDays className="mr-2 h-3.5 w-3.5 text-zinc-400" />
            {displayText ? (
              <span>{displayText}</span>
            ) : (
              <span className="text-zinc-400">{label}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-3" align="start">
          <div className="space-y-3">
            {/* Year navigation */}
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 cursor-pointer p-0"
                onClick={() => setBrowseYear((y) => y - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium">{browseYear}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 cursor-pointer p-0"
                onClick={() => setBrowseYear((y) => y + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Month grid 4x3 */}
            <div className="grid grid-cols-4 gap-1">
              {MONTHS.map((m) => {
                const isSelected =
                  selectedYear === String(browseYear) && selectedMonth === m;
                return (
                  <Button
                    key={m}
                    variant="ghost"
                    size="sm"
                    className={`h-8 cursor-pointer text-xs ${
                      isSelected
                        ? "bg-pink-100 text-pink-700 hover:bg-pink-200 dark:bg-pink-900/30 dark:text-pink-300 dark:hover:bg-pink-900/50"
                        : ""
                    }`}
                    onClick={() => handleMonthClick(m)}
                  >
                    {t(`editor.fields.months.${m}` as any)}
                  </Button>
                );
              })}
            </div>

            {/* Clear button */}
            {value && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-full cursor-pointer text-xs text-zinc-400"
                onClick={handleClear}
              >
                {t("editor.fields.clear")}
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
