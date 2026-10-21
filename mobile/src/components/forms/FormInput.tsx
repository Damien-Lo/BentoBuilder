import type { ComponentProps } from "react";
import { TextInput } from "react-native";

import { useOrbitPage } from "@/src/theme/orbit";

type FormInputProps = ComponentProps<typeof TextInput>;

export function FormInput({
  multiline = false,
  className = "",
  style,
  ...props
}: FormInputProps) {
  // (On an Orbit page, in its colours.)
  const o = useOrbitPage();
  return (
    <TextInput
      {...props}
      multiline={multiline}
      textAlignVertical={multiline ? "top" : "center"}
      placeholderTextColor={o?.faint ?? "#94A3B8"}
      style={[multiline ? undefined : { height: 56 }, o && { backgroundColor: o.surface, borderColor: o.border, color: o.text }, style]}
      className={`rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950 ${
        multiline ? "min-h-24 py-3" : ""
      } ${className}`}
    />
  );
}

export default FormInput;