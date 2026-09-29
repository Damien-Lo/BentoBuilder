import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

interface FormCardProps {
  icon: ComponentProps<typeof Ionicons>["name"];
  title: string;
  description?: string;
  // Collapsible when onToggle is given: the header toggles `expanded` and
  // the body only renders while expanded.
  expanded?: boolean;
  onToggle?: () => void;
  // Extra control in the header, left of the chevron (e.g. "Scan label").
  headerAccessory?: ReactNode;
  // Cards stack as siblings, so a dropdown's floating option list in one
  // card would draw under the cards after it — give earlier cards a higher
  // zIndex than later ones.
  zIndex?: number;
  children?: ReactNode;
}

// One white, rounded section of a long form page (the add-ingredient page):
// an icon tile, title and one-line description, then its fields.
export function FormCard({
  icon,
  title,
  description,
  expanded = true,
  onToggle,
  headerAccessory,
  zIndex,
  children,
}: FormCardProps) {
  const collapsible = !!onToggle;
  const open = !collapsible || expanded;

  const header = (
    <View className="flex-row items-center">
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
        <Ionicons name={icon} size={20} color="#2563EB" />
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-base font-bold text-slate-950">{title}</Text>
        {!!description && (
          <Text className="mt-0.5 text-xs leading-4 text-slate-500">{description}</Text>
        )}
      </View>
      {headerAccessory}
      {collapsible && (
        <View className="ml-2 h-8 w-8 items-center justify-center rounded-full bg-slate-50">
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color="#64748B" />
        </View>
      )}
    </View>
  );

  return (
    <View
      className="mb-3 rounded-3xl border border-slate-200 bg-white px-4 py-4"
      style={zIndex != null ? { zIndex, elevation: zIndex > 0 ? 1 : 0 } : undefined}
    >
      {collapsible ? (
        <Pressable onPress={onToggle} className="active:opacity-70">
          {header}
        </Pressable>
      ) : (
        header
      )}
      {open && !!children && <View className="mt-1">{children}</View>}
    </View>
  );
}

export default FormCard;
