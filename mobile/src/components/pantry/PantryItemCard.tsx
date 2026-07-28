import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";

interface PantryItemCardProps {
  ingredientName: string;
  quantityAvailable: number;
  quantityUnit: string;
  rightBadge?: ReactNode;
  onPress: () => void;
  onDelete: () => void;
  onSubtract: () => void;
  onAdd: () => void;
  onSplit: () => void;
  busy?: boolean;
}

// Shared by the Pantry tab's "list" view and the location detail page — a
// swipe-to-delete card (swipe right, matching every other list in the app)
// with a quick +/- 1 unit and split footer, on top of the existing
// tap-to-open-detail behavior.
export function PantryItemCard({
  ingredientName,
  quantityAvailable,
  quantityUnit,
  rightBadge,
  onPress,
  onDelete,
  onSubtract,
  onAdd,
  onSplit,
  busy = false,
}: PantryItemCardProps) {
  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={40}
      renderLeftActions={() => (
        <Pressable
          className="mb-2.5 w-20 items-center justify-center rounded-2xl bg-red-500 active:bg-red-600"
          onPress={onDelete}
        >
          <Ionicons name="trash-outline" size={22} color="white" />
        </Pressable>
      )}
    >
      <Pressable
        className="mb-2.5 rounded-2xl border border-slate-200 bg-white p-4 active:bg-slate-50"
        onPress={onPress}
      >
        <View className="flex-row items-center">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-blue-50">
            <Ionicons name="nutrition-outline" size={16} color="#2563EB" />
          </View>

          <View className="ml-3 flex-1">
            <Text className="font-semibold text-slate-900" numberOfLines={1}>
              {ingredientName}
            </Text>
            <Text className="mt-0.5 text-sm text-slate-500">
              {quantityAvailable} {quantityUnit}
            </Text>
          </View>

          {rightBadge}

          <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
        </View>

        <View className="mt-3 flex-row items-center gap-2 border-t border-slate-100 pt-3">
          <Pressable
            disabled={busy}
            onPress={(e) => {
              e.stopPropagation();
              onSubtract();
            }}
            className="h-9 w-9 items-center justify-center rounded-full bg-slate-100 active:bg-slate-200"
          >
            <Ionicons name="remove" size={18} color="#475569" />
          </Pressable>

          <Pressable
            disabled={busy}
            onPress={(e) => {
              e.stopPropagation();
              onSplit();
            }}
            className="h-9 flex-1 flex-row items-center justify-center gap-1.5 rounded-full bg-slate-100 active:bg-slate-200"
          >
            <Ionicons name="git-branch-outline" size={15} color="#475569" />
            <Text className="text-xs font-semibold text-slate-600">Split</Text>
          </Pressable>

          <Pressable
            disabled={busy}
            onPress={(e) => {
              e.stopPropagation();
              onAdd();
            }}
            className="h-9 w-9 items-center justify-center rounded-full bg-slate-100 active:bg-slate-200"
          >
            <Ionicons name="add" size={18} color="#475569" />
          </Pressable>
        </View>
      </Pressable>
    </ReanimatedSwipeable>
  );
}

export default PantryItemCard;
