import { Text } from "react-native";

import { useOrbitPage } from "@/src/theme/orbit";

interface FieldLabelProps {
  text: string;
  required?: boolean;
}

export function FieldLabel({
  text,
  required = false,
}: FieldLabelProps) {
  const o = useOrbitPage();
  return (
    <Text className="mb-2 mt-4 text-sm font-semibold text-slate-700" style={o ? { color: o.icon } : undefined}>
      {text}
      {required ? " *" : ""}
    </Text>
  );
}

export default FieldLabel;