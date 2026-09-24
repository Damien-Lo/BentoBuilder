import { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";

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

  useEffect(() => {
    setText(value != null ? String(value) : "");
  }, [value]);

  function commit(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) { onChange(null); return; }
    const n = Number(trimmed);
    onChange(Number.isFinite(n) && n >= 0 ? n : value);
  }

  return (
    <View className="flex-row items-center">
      <TextInput
        value={text}
        onChangeText={setText}
        onBlur={() => commit(text)}
        onFocus={onFocus}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        keyboardType="numeric"
        returnKeyType="done"
        className="min-w-[72px] rounded-xl bg-slate-100 px-3 py-2 text-right text-base font-semibold text-slate-900"
      />
      {unit && (
        <Text className="ml-1.5 text-sm text-slate-400">{unit}</Text>
      )}
    </View>
  );
}

export default SettingsNumericInput;
