import { useEffect, useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";

import { updateRecipe, type Recipe } from "@/src/services/recipeApi";

// A recipe's "start ahead" step: something to do before cooking that isn't
// a recipe of its own — soak the scallops, salt it the night before, take
// the steak out to come to room temperature. How many hours before the
// meal, and what; the kitchen's tasks then list it in time. Saved as each
// field is left.
export function StartAhead({ recipe, onSaved }: { recipe: Recipe; onSaved: (startAhead: NonNullable<Recipe["startAhead"]>) => void }) {
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    setHours(recipe.startAhead?.hours ? String(recipe.startAhead.hours) : "");
    setNote(recipe.startAhead?.note ?? "");
  }, [recipe._id, recipe.startAhead?.hours, recipe.startAhead?.note]);

  function save() {
    const parsed = Number(hours);
    const next = { hours: hours.trim() && Number.isFinite(parsed) && parsed > 0 ? parsed : null, note: note.trim() };
    if (next.hours === (recipe.startAhead?.hours ?? null) && next.note === (recipe.startAhead?.note ?? "")) return;
    updateRecipe(recipe._id, { startAhead: next }).then(
      () => onSaved(next),
      (error) => Alert.alert("Couldn't save", error instanceof Error ? error.message : "Something went wrong."),
    );
  }

  return (
    <View className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
      <Text className="text-base font-medium text-slate-900">Start ahead</Text>
      <Text className="mt-0.5 text-xs leading-4 text-slate-500">Anything to do before cooking: soak, salt overnight, take out of the fridge. It shows in your kitchen tasks in time. Leave empty if there&apos;s nothing.</Text>
      <View className="mt-3 flex-row items-center">
        <TextInput
          value={hours}
          onChangeText={(text) => setHours(text.replace(/[^0-9.]/g, ""))}
          onBlur={save}
          placeholder="0"
          placeholderTextColor="#94A3B8"
          keyboardType="decimal-pad"
          accessibilityLabel="Hours ahead"
          className="w-16 rounded-xl bg-slate-100 px-3 py-2 text-center text-base text-slate-900"
        />
        <Text className="mx-2 text-sm text-slate-500">hours before:</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          onBlur={save}
          placeholder="what to do"
          placeholderTextColor="#94A3B8"
          accessibilityLabel="What to do ahead"
          className="flex-1 rounded-xl bg-slate-100 px-3 py-2 text-base text-slate-900"
        />
      </View>
    </View>
  );
}
