import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, Text } from "react-native";

import { formatDateDisplay } from "@/src/utils/date";

import { DatePickerModal } from "./DatePickerModal";

interface DatePickerFieldProps {
  // "YYYY-MM-DD", or "" for none.
  value: string;
  onChange: (value: string) => void;
  // The picker sheet's heading, e.g. "Expiry date".
  title: string;
  placeholder?: string;
  // Shows an ✕ to clear an optional date back to "".
  clearable?: boolean;
  onFocus?: () => void;
}

// A date field that opens the native date picker — shows "Sep 27, 2026"
// rather than a typed "YYYY-MM-DD".
export function DatePickerField({
  value,
  onChange,
  title,
  placeholder = "Pick a date",
  clearable = false,
  onFocus,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const display = formatDateDisplay(value);

  return (
    <>
      <Pressable
        onPress={() => {
          onFocus?.();
          setOpen(true);
        }}
        className="flex-row items-center rounded-2xl border border-slate-200 bg-white px-3 active:bg-slate-50"
        style={{ height: 56 }}
      >
        <Ionicons name="calendar-outline" size={18} color="#64748B" />
        <Text numberOfLines={1} className={`ml-2 flex-1 text-base ${display ? "text-slate-950" : "text-slate-400"}`}>
          {display ?? placeholder}
        </Text>
        {clearable && value ? (
          <Pressable hitSlop={10} onPress={() => onChange("")}>
            <Ionicons name="close-circle" size={18} color="#94A3B8" />
          </Pressable>
        ) : (
          <Ionicons name="chevron-down" size={16} color="#64748B" />
        )}
      </Pressable>
      <DatePickerModal
        visible={open}
        title={title}
        value={value}
        onCancel={() => setOpen(false)}
        onConfirm={(next) => {
          setOpen(false);
          onChange(next);
        }}
      />
    </>
  );
}

export default DatePickerField;
