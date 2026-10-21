import { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";

import { useOrbitPage } from "@/src/theme/orbit";

// null = blank; undefined = not a valid (finite, non-negative) number.
function parse(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function SettingsNumericInput({
  value,
  onChange,
  placeholder,
  unit,
  onFocus,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder: string;
  unit?: string;
  onFocus?: () => void;
}) {
  const [text, setText] = useState(value != null ? String(value) : "");
  // (On an Orbit page, in its colours.)
  const o = useOrbitPage();

  // Resync from `value` only when it actually differs from what's typed —
  // so reporting "1." as 1 mid-typing doesn't snap the text back to "1".
  useEffect(() => {
    setText(prev => (parse(prev) === value ? prev : value != null ? String(value) : ""));
  }, [value]);

  // Valid values are reported as they're typed, not just on blur — a Save
  // button tapped while this field still has focus (keyboardShouldPersistTaps
  // ="handled" keeps it focused) would otherwise save the pre-edit value.
  function handleChangeText(raw: string) {
    setText(raw);
    const n = parse(raw);
    if (n !== undefined) onChange(n);
  }

  // On blur, anything invalid left in the field snaps back to the last
  // good value.
  function commit(raw: string) {
    const n = parse(raw);
    onChange(n !== undefined ? n : value);
    if (n === undefined) setText(value != null ? String(value) : "");
  }

  return (
    <View className="flex-row items-center">
      <TextInput
        value={text}
        onChangeText={handleChangeText}
        onBlur={() => commit(text)}
        onFocus={onFocus}
        placeholder={placeholder}
        placeholderTextColor={o?.faint ?? "#94A3B8"}
        keyboardType="numeric"
        returnKeyType="done"
        className="w-24 rounded-xl bg-slate-100 px-3 py-2 text-right text-base font-semibold text-slate-900"
        style={o && { backgroundColor: o.pill, color: o.text }}
      />
      {unit && (
        <Text className="ml-1.5 text-sm text-slate-400" style={o && { color: o.faint }}>{unit}</Text>
      )}
    </View>
  );
}

export default SettingsNumericInput;
