import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";

import { FieldLabel, FormInput, PriceInput } from "@/src/components/forms";
import { RateRecipeModal } from "@/src/components/recipes/RateRecipeModal";
import { Tap } from "@/src/components/ui/Tap";
import { addDishScore, deleteDishScore, isSuggested, removeDish, setDishMine, type ChangeRequest, type Restaurant, type RestaurantDish } from "@/src/services/restaurantApi";
import { ALL_NUTRITION_FIELDS, NUTRITION_FIELD_META } from "@/src/types/nutrition";
import { useOrbitTheme } from "@/src/theme/orbit";

import { DishEditor } from "./DishEditor";
import { averageScore, errorText, Macros, Sheet, SheetButton, shortDate, showSuggested, StatusChip, useIsReviewer } from "./parts";

// One dish on a restaurant's menu, opened from the menu: its nutrition in
// full, your ratings (1–10), your notes and what you paid — yours alone —
// and correcting it or taking it off the menu, which are everyone's (the
// meals that had it keep their own copy of its numbers). For a member those
// are suggestions a reviewer looks at first — unless it's their own dish
// still waiting for review, which is theirs to fix.

const SOURCE_LABEL: Record<RestaurantDish["source"], string> = {
  library: "From the dish library",
  photo: "Estimated from a photo",
  label: "From its label",
  chain: "The chain's own numbers",
  typed: "Typed in",
};

const parsePrice = (text: string): number | null => {
  const n = Number(text.trim().replace(",", "."));
  return text.trim() && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

export function DishSheet({
  restaurant,
  dish,
  sections,
  canReview,
  onClose,
  onChanged,
  onRemoved,
  onSuggested,
}: {
  restaurant: Pick<Restaurant, "_id" | "name">;
  dish: RestaurantDish;
  // The menu's sections, for the dish form.
  sections?: string[];
  onClose: () => void;
  // The dish as it is now (corrected, rated, your notes changed).
  onChanged: (dish: RestaurantDish) => void;
  onRemoved: (dishId: string) => void;
  // Whether one reviews (the restaurant page's `canReview`): one's changes are made, not suggested.
  canReview?: boolean;
  // A correction or removal sent as a suggestion.
  onSuggested?: (request: ChangeRequest) => void;
}) {
  const { colors: o } = useOrbitTheme();
  const [notes, setNotes] = useState(dish.mine?.notes ?? "");
  const [price, setPrice] = useState(dish.mine?.price != null ? dish.mine.price.toFixed(2) : "");
  const [savingMine, setSavingMine] = useState(false);
  const [rating, setRating] = useState(false);
  const [savingScore, setSavingScore] = useState(false);
  const [editing, setEditing] = useState(false);
  // Suggesting it come off the menu: why (optional).
  const [suggestingRemoval, setSuggestingRemoval] = useState(false);
  const [removalNote, setRemovalNote] = useState("");
  const [removing, setRemoving] = useState(false);
  const reviewer = useIsReviewer() || !!canReview;
  const direct = reviewer || dish.status === "pending";

  useEffect(() => {
    setNotes(dish.mine?.notes ?? "");
    setPrice(dish.mine?.price != null ? dish.mine.price.toFixed(2) : "");
  }, [dish._id, dish.mine?.notes, dish.mine?.price]);

  const scores = dish.mine?.scores ?? [];
  const average = averageScore(scores);
  const mineChanged = notes.trim() !== (dish.mine?.notes ?? "") || parsePrice(price) !== (dish.mine?.price ?? null);
  const known = ALL_NUTRITION_FIELDS.filter((field) => dish.nutrition?.[field] != null);

  async function saveMine() {
    setSavingMine(true);
    try {
      const mine = await setDishMine(dish._id, { notes: notes.trim(), price: parsePrice(price) });
      onChanged({ ...dish, mine: { ...dish.mine, ...mine } });
    } catch (error) {
      Alert.alert("Couldn't save", errorText(error));
    } finally {
      setSavingMine(false);
    }
  }

  async function rate(value: number) {
    setSavingScore(true);
    try {
      const next = await addDishScore(dish._id, value);
      onChanged({ ...dish, mine: { ...dish.mine, scores: next } });
      setRating(false);
    } catch (error) {
      Alert.alert("Couldn't save the rating", errorText(error));
    } finally {
      setSavingScore(false);
    }
  }

  function unrate(scoreId: string) {
    Alert.alert("Delete this rating?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteDishScore(dish._id, scoreId)
            .then((next) => onChanged({ ...dish, mine: { ...dish.mine, scores: next } }))
            .catch((error) => Alert.alert("Couldn't delete it", errorText(error)));
        },
      },
    ]);
  }

  // Off the menu — or, for a member, suggested (said so before it's sent).
  function send(note?: string) {
    setRemoving(true);
    removeDish(dish._id, note)
      .then((result) => {
        if (isSuggested(result)) {
          setSuggestingRemoval(false);
          setRemovalNote("");
          showSuggested(() => onSuggested?.(result.request));
          return;
        }
        onRemoved(dish._id);
      })
      .catch((error) => Alert.alert("Couldn't take it off", errorText(error)))
      .finally(() => setRemoving(false));
  }
  function takeOff() {
    if (!direct) {
      setSuggestingRemoval(true);
      return;
    }
    const mineWaiting = dish.status === "pending" && !reviewer;
    Alert.alert(
      `Take "${dish.name}" off the menu?`,
      mineWaiting
        ? "It hasn't been reviewed yet, so it's simply taken off. Meals that had it keep their numbers."
        : "It comes off this restaurant's menu for everyone. Meals that had it keep their numbers, and the change is kept in its history.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Take it off", style: "destructive", onPress: () => send() },
      ],
    );
  }

  const card = { borderRadius: 18, borderWidth: 1, borderColor: o.border, backgroundColor: o.surface, padding: 14, marginTop: 12 };
  const heading = { fontSize: 11, fontWeight: "700" as const, letterSpacing: 1.2, color: o.faint };
  const from = dish.fromLibrary;

  return (
    <Sheet visible title={dish.name} subtitle={[dish.section, restaurant.name].filter(Boolean).join(" · ")} onClose={onClose} width={620}>
      {(dish.status === "pending" || dish.status === "rejected") && (
        <View style={{ marginTop: 4 }}>
          <StatusChip status={dish.status} reviewNote={dish.reviewNote} withNote />
          {dish.status === "pending" && <Text style={{ marginTop: 6, fontSize: 12, lineHeight: 17, color: o.muted }}>Only you see it until a reviewer approves it — you can still log it.</Text>}
        </View>
      )}
      {/* Its nutrition, one serving as it's served */}
      <View style={card}>
        <Text style={heading}>NUTRITION · ONE SERVING</Text>
        <Macros nutrition={dish.nutrition} size={15} style={{ marginTop: 8 }} />
        {known.length > 0 && (
          <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap" }}>
            {known.map((field) => (
              <View key={field} style={{ width: "50%", flexDirection: "row", paddingVertical: 4, paddingRight: 12 }}>
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: o.muted }}>
                  {NUTRITION_FIELD_META[field].label}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: "600", color: o.text }}>
                  {Math.round((dish.nutrition[field] ?? 0) * 10) / 10} {NUTRITION_FIELD_META[field].unit}
                </Text>
              </View>
            ))}
          </View>
        )}
        <Text style={{ marginTop: 8, fontSize: 12, color: o.faint }}>
          {SOURCE_LABEL[dish.source] ?? "Typed in"}
          {from ? ` · ${from.amount} ${from.unit}` : ""}
        </Text>
      </View>

      {/* Your ratings */}
      <View style={card}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={heading}>YOUR RATING</Text>
            {average != null ? (
              <View style={{ marginTop: 6, flexDirection: "row", alignItems: "baseline" }}>
                <Text style={{ fontSize: 22, fontWeight: "800", color: o.text }}>{average}</Text>
                <Text style={{ marginLeft: 4, fontSize: 13, fontWeight: "600", color: o.faint }}>/ 10</Text>
                <Text style={{ marginLeft: 6, fontSize: 12, color: o.faint }}>
                  · {scores.length} {scores.length === 1 ? "rating" : "ratings"}
                </Text>
              </View>
            ) : (
              <Text style={{ marginTop: 6, fontSize: 14, color: o.faint }}>Not rated yet</Text>
            )}
          </View>
          <Tap onPress={() => setRating(true)} accessibilityRole="button" style={{ height: 40, paddingHorizontal: 18, borderRadius: 14, justifyContent: "center", backgroundColor: o.ink }} pressedStyle={{ opacity: 0.85 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: o.onInk }}>Rate</Text>
          </Tap>
        </View>
        {scores.length > 0 && (
          <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: o.border }}>
            {scores
              .slice(-10)
              .reverse()
              .map((score) => (
                <View key={score._id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: o.border }}>
                  <Text style={{ flex: 1, fontSize: 13, color: o.muted }}>{shortDate(score.ratedAt)}</Text>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: o.text }}>{score.value} / 10</Text>
                  <Tap onPress={() => unrate(score._id)} hitSlop={8} accessibilityLabel="Delete this rating" style={{ marginLeft: 12 }}>
                    <Ionicons name="trash-outline" size={16} color={o.faint} />
                  </Tap>
                </View>
              ))}
          </View>
        )}
      </View>

      {/* Your notes and what you paid: yours alone */}
      <View style={card}>
        <Text style={heading}>YOURS · ONLY YOU SEE THESE</Text>
        <FieldLabel text="Notes" />
        <FormInput value={notes} onChangeText={setNotes} placeholder="e.g. Ask for extra salsa, no rice" multiline />
        <FieldLabel text="What you paid" />
        <View style={{ width: 160 }}>
          <PriceInput value={price} onChangeText={setPrice} compact />
        </View>
        {mineChanged && (
          <View style={{ marginTop: 12, flexDirection: "row" }}>
            <SheetButton label={savingMine ? "Saving…" : "Save notes & price"} onPress={() => void saveMine()} disabled={savingMine} />
          </View>
        )}
      </View>

      {/* Everyone's: correct it, or take it off */}
      <View style={{ marginTop: 16, flexDirection: "row", gap: 10 }}>
        <SheetButton kind="secondary" icon="create-outline" label={direct ? "Edit dish" : "Suggest a fix"} onPress={() => setEditing(true)} />
        <SheetButton kind="danger" icon="remove-circle-outline" label="Off the menu" onPress={takeOff} disabled={removing} />
      </View>
      {suggestingRemoval && (
        <View style={card}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: o.text }}>Suggest taking it off the menu?</Text>
          <Text style={{ marginTop: 4, fontSize: 13, lineHeight: 19, color: o.muted }}>It&apos;s sent as a suggestion: a reviewer looks at it before it comes off for everyone. Meals that had it keep their numbers.</Text>
          <FieldLabel text="Why (optional)" />
          <FormInput value={removalNote} onChangeText={setRemovalNote} placeholder="e.g. No longer on their menu" maxLength={200} />
          <View style={{ marginTop: 12, flexDirection: "row", gap: 10 }}>
            <SheetButton kind="secondary" label="Cancel" onPress={() => setSuggestingRemoval(false)} disabled={removing} />
            <SheetButton label={removing ? "Sending…" : "Suggest it"} onPress={() => send(removalNote.trim() || undefined)} disabled={removing} />
          </View>
        </View>
      )}
      <Text style={{ marginTop: 8, marginHorizontal: 4, fontSize: 12, lineHeight: 17, color: o.faint }}>
        {direct ? "The menu is shared by everyone in Orbit; changes to it are kept in its history." : "The menu is shared by everyone in Orbit, so changes to it are suggestions a reviewer looks at first."}
      </Text>

      <RateRecipeModal visible={rating} saving={savingScore} title="Rate this dish" subtitle="How was it, out of 10?" onClose={() => setRating(false)} onSubmit={(value) => void rate(value)} />
      {editing && (
        <DishEditor
          restaurant={restaurant}
          dish={dish}
          sections={sections}
          canReview={canReview}
          onCancel={() => setEditing(false)}
          onSuggested={(request) => {
            setEditing(false);
            onSuggested?.(request);
          }}
          onSaved={(saved) => {
            setEditing(false);
            onChanged({ ...saved, mine: dish.mine });
          }}
        />
      )}
    </Sheet>
  );
}
