import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";

import { getPantryItemDeductions, type PantryDeduction } from "@/src/services/pantryApi";
import { formatDateDisplay } from "@/src/utils/date";

interface PantryItemCardProps {
  pantryItemId: string;
  ingredientName: string;
  quantityAvailable: number;
  quantityUnit: string;
  storageLocationName?: string;
  purchaseDate?: string | null;
  expiryDate?: string | null;
  purchasePrice?: number | null;
  storeName?: string | null;
  notes?: string;
  rightBadge?: ReactNode;
  onEdit: () => void;
  onDelete: () => void;
  onSubtract: () => void;
  onAdd: () => void;
  onSplit: () => void;
  busy?: boolean;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-start justify-between gap-3 py-0.5">
      <Text className="text-xs text-slate-400">{label}</Text>
      <Text className="flex-1 text-right text-xs font-medium text-slate-600" numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

// Shared by the Pantry tab's "list" view and the location detail page — a
// swipe-to-delete card (swipe right, matching every other list in the app)
// with a quick +/- 1 unit and split footer, on top of a tap-to-expand
// detail view (this item's own storage/purchase/price/store/notes, plus
// what's been deducted from it and by which planner entries) — editing
// those details is a separate, explicit action from within that expanded
// view rather than the card's own tap target.
export function PantryItemCard({
  pantryItemId,
  ingredientName,
  quantityAvailable,
  quantityUnit,
  storageLocationName,
  purchaseDate,
  expiryDate,
  purchasePrice,
  storeName,
  notes,
  rightBadge,
  onEdit,
  onDelete,
  onSubtract,
  onAdd,
  onSplit,
  busy = false,
}: PantryItemCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [deductions, setDeductions] = useState<PantryDeduction[] | null>(null);
  const [loadingDeductions, setLoadingDeductions] = useState(false);

  function toggleExpanded() {
    setExpanded((current) => !current);

    // Lazy, once-per-mount fetch — re-expanding after collapsing just
    // re-shows what's already loaded rather than re-fetching every time.
    if (deductions === null && !loadingDeductions) {
      setLoadingDeductions(true);
      getPantryItemDeductions(pantryItemId)
        .then(setDeductions)
        .catch(() => setDeductions([]))
        .finally(() => setLoadingDeductions(false));
    }
  }

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
        onPress={toggleExpanded}
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

          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color="#94A3B8" />
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

        {expanded && (
          <View className="mt-3 border-t border-slate-100 pt-3">
            <View>
              {storageLocationName ? <DetailRow label="Storage location" value={storageLocationName} /> : null}
              {purchaseDate ? (
                <DetailRow label="Purchased" value={formatDateDisplay(purchaseDate) ?? purchaseDate} />
              ) : null}
              {expiryDate ? (
                <DetailRow label="Expires" value={formatDateDisplay(expiryDate) ?? expiryDate} />
              ) : null}
              {purchasePrice != null ? (
                <DetailRow label="Price paid" value={`$${purchasePrice.toFixed(2)}`} />
              ) : null}
              {storeName ? <DetailRow label="Store" value={storeName} /> : null}
              {notes ? <DetailRow label="Notes" value={notes} /> : null}
            </View>

            <Pressable
              className="mt-3 h-10 flex-row items-center justify-center gap-1.5 rounded-xl bg-slate-100 active:bg-slate-200"
              onPress={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              <Ionicons name="create-outline" size={16} color="#475569" />
              <Text className="text-sm font-semibold text-slate-600">Edit details</Text>
            </Pressable>

            <View className="mt-4 border-t border-slate-100 pt-3">
              <Text className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                Deductions · last 30 days
              </Text>

              {loadingDeductions ? (
                <ActivityIndicator size="small" color="#94A3B8" />
              ) : !deductions || deductions.length === 0 ? (
                <Text className="text-sm text-slate-400">Nothing deducted in the last 30 days.</Text>
              ) : (
                deductions.map((deduction) => (
                  <View key={deduction._id} className="mb-2 flex-row items-center justify-between">
                    <View className="mr-2 flex-1">
                      <Text className="text-sm text-slate-700" numberOfLines={1}>
                        {deduction.source}
                      </Text>
                      <Text className="text-xs capitalize text-slate-400">
                        {formatDateDisplay(deduction.date) ?? deduction.date} · {deduction.slot}
                      </Text>
                    </View>
                    <Text className="text-sm font-semibold text-slate-600">
                      -{deduction.amount} {quantityUnit}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </View>
        )}
      </Pressable>
    </ReanimatedSwipeable>
  );
}

export default PantryItemCard;
