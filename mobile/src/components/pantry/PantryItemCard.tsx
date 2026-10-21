import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";

import { Tap } from "@/src/components/ui/Tap";
import { getPantryItemDeductions, type PantryDeduction } from "@/src/services/pantryApi";
import { useOrbitPage, type OrbitColors } from "@/src/theme/orbit";
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

// Something to tap: on an Orbit page its look as a style (and another while
// held); anywhere else the older look, as classes.
function Press({
  o,
  className,
  style,
  pressedStyle,
  children,
  ...props
}: Omit<PressableProps, "style" | "children"> & {
  o: OrbitColors | null;
  className: string;
  style?: StyleProp<ViewStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  if (o) {
    return (
      <Tap {...props} style={style} pressedStyle={pressedStyle}>
        {children}
      </Tap>
    );
  }
  return (
    <Pressable {...props} className={className}>
      {children}
    </Pressable>
  );
}

function DetailRow({ label, value, o }: { label: string; value: string; o: OrbitColors | null }) {
  return (
    <View className="flex-row items-start justify-between gap-3 py-0.5">
      <Text className="text-xs text-slate-400" style={o && { color: o.faint }}>{label}</Text>
      <Text className="flex-1 text-right text-xs font-medium text-slate-600" style={o && { color: o.icon }} numberOfLines={2}>
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
//
// On an Orbit page (OrbitPage) it takes that page's colours, light or dark;
// anywhere else the older look.
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
  const o = useOrbitPage();
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

  // (The Orbit look's round grey buttons, and the hairlines inside the card.)
  const round = o && { width: 36, height: 36, borderRadius: 18, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: o.pill };
  const roundPressed = o && { opacity: 0.7 };
  const iconColor = o?.onPill ?? "#475569";
  const divider = o && { borderTopColor: o.border };

  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={40}
      renderLeftActions={() => (
        <Press
          o={o}
          className="mb-2.5 w-20 items-center justify-center rounded-2xl bg-red-500 active:bg-red-600"
          style={o && { marginBottom: 10, width: 80, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: "#EF4444" }}
          pressedStyle={{ backgroundColor: "#DC2626" }}
          onPress={onDelete}
        >
          <Ionicons name="trash-outline" size={22} color="white" />
        </Press>
      )}
    >
      <Press
        o={o}
        className="mb-2.5 rounded-2xl border border-slate-200 bg-white p-4 active:bg-slate-50"
        style={o && { marginBottom: 10, borderRadius: 18, borderWidth: 1, borderColor: o.border, backgroundColor: o.surface, padding: 16 }}
        pressedStyle={o && { backgroundColor: o.pill }}
        onPress={toggleExpanded}
      >
        <View className="flex-row items-center">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-blue-50" style={o && { backgroundColor: o.pill }}>
            <Ionicons name="nutrition-outline" size={16} color={o?.onPill ?? "#2563EB"} />
          </View>

          <View className="ml-3 flex-1">
            <Text className="font-semibold text-slate-900" style={o && { color: o.text }} numberOfLines={1}>
              {ingredientName}
            </Text>
            <Text className="mt-0.5 text-sm text-slate-500" style={o && { color: o.muted }}>
              {quantityAvailable} {quantityUnit}
            </Text>
          </View>

          {rightBadge}

          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={o?.faint ?? "#94A3B8"} />
        </View>

        <View className="mt-3 flex-row items-center gap-2 border-t border-slate-100 pt-3" style={divider}>
          <Press
            o={o}
            disabled={busy}
            onPress={(e) => {
              e.stopPropagation();
              onSubtract();
            }}
            className="h-9 w-9 items-center justify-center rounded-full bg-slate-100 active:bg-slate-200"
            style={[round, o && busy && { opacity: 0.5 }]}
            pressedStyle={roundPressed}
            accessibilityLabel="Subtract one"
          >
            <Ionicons name="remove" size={18} color={iconColor} />
          </Press>

          <Press
            o={o}
            disabled={busy}
            onPress={(e) => {
              e.stopPropagation();
              onSplit();
            }}
            className="h-9 flex-1 flex-row items-center justify-center gap-1.5 rounded-full bg-slate-100 active:bg-slate-200"
            style={o && [round, { width: undefined, flex: 1, flexDirection: "row", gap: 6 }, busy && { opacity: 0.5 }]}
            pressedStyle={roundPressed}
          >
            <Ionicons name="git-branch-outline" size={15} color={iconColor} />
            <Text className="text-xs font-semibold text-slate-600" style={o && { color: o.onPill }}>Split</Text>
          </Press>

          <Press
            o={o}
            disabled={busy}
            onPress={(e) => {
              e.stopPropagation();
              onAdd();
            }}
            className="h-9 w-9 items-center justify-center rounded-full bg-slate-100 active:bg-slate-200"
            style={[round, o && busy && { opacity: 0.5 }]}
            pressedStyle={roundPressed}
            accessibilityLabel="Add one"
          >
            <Ionicons name="add" size={18} color={iconColor} />
          </Press>
        </View>

        {expanded && (
          <View className="mt-3 border-t border-slate-100 pt-3" style={divider}>
            <View>
              {storageLocationName ? <DetailRow o={o} label="Storage location" value={storageLocationName} /> : null}
              {purchaseDate ? (
                <DetailRow o={o} label="Purchased" value={formatDateDisplay(purchaseDate) ?? purchaseDate} />
              ) : null}
              {expiryDate ? (
                <DetailRow o={o} label="Expires" value={formatDateDisplay(expiryDate) ?? expiryDate} />
              ) : null}
              {purchasePrice != null ? (
                <DetailRow o={o} label="Price paid" value={`$${purchasePrice.toFixed(2)}`} />
              ) : null}
              {storeName ? <DetailRow o={o} label="Store" value={storeName} /> : null}
              {notes ? <DetailRow o={o} label="Notes" value={notes} /> : null}
            </View>

            <Press
              o={o}
              className="mt-3 h-10 flex-row items-center justify-center gap-1.5 rounded-xl bg-slate-100 active:bg-slate-200"
              style={o && { marginTop: 12, height: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 14, backgroundColor: o.pill }}
              pressedStyle={roundPressed}
              onPress={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              <Ionicons name="create-outline" size={16} color={iconColor} />
              <Text className="text-sm font-semibold text-slate-600" style={o && { color: o.onPill }}>Edit details</Text>
            </Press>

            <View className="mt-4 border-t border-slate-100 pt-3" style={divider}>
              <Text
                className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400"
                style={o && { fontSize: 11, letterSpacing: 1.2, color: o.faint }}
              >
                Deductions · last 30 days
              </Text>

              {loadingDeductions ? (
                <ActivityIndicator size="small" color={o?.faint ?? "#94A3B8"} />
              ) : !deductions || deductions.length === 0 ? (
                <Text className="text-sm text-slate-400" style={o && { color: o.faint }}>Nothing deducted in the last 30 days.</Text>
              ) : (
                deductions.map((deduction) => (
                  <View key={deduction._id} className="mb-2 flex-row items-center justify-between">
                    <View className="mr-2 flex-1">
                      <Text className="text-sm text-slate-700" style={o && { color: o.text }} numberOfLines={1}>
                        {deduction.source}
                      </Text>
                      <Text className="text-xs capitalize text-slate-400" style={o && { color: o.faint }}>
                        {formatDateDisplay(deduction.date) ?? deduction.date} · {deduction.slot}
                      </Text>
                    </View>
                    <Text className="text-sm font-semibold text-slate-600" style={o && { color: o.icon }}>
                      -{deduction.amount} {quantityUnit}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </View>
        )}
      </Press>
    </ReanimatedSwipeable>
  );
}

export default PantryItemCard;
