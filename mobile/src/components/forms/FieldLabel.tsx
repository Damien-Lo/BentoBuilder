import { Text } from "react-native";

interface FieldLabelProps {
  text: string;
  required?: boolean;
}

export function FieldLabel({
  text,
  required = false,
}: FieldLabelProps) {
  return (
    <Text className="mb-2 mt-4 text-sm font-semibold text-slate-700">
      {text}
      {required ? " *" : ""}
    </Text>
  );
}

export default FieldLabel;