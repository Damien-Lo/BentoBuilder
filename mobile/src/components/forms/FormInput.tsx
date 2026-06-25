import type { ComponentProps } from "react";
import { TextInput } from "react-native";

type FormInputProps = ComponentProps<typeof TextInput>;

export function FormInput({
  multiline = false,
  className = "",
  ...props
}: FormInputProps) {
  return (
    <TextInput
      {...props}
      multiline={multiline}
      textAlignVertical={multiline ? "top" : "center"}
      placeholderTextColor="#94A3B8"
      className={`rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950 ${
        multiline ? "min-h-24 py-3" : "h-[52px]"
      } ${className}`}
    />
  );
}

export default FormInput;