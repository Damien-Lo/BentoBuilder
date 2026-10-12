import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { Button, hoverable, WEB } from "@/src/components/web/ui";
import type { Dish } from "@/src/utils/recommend";

// What to put beside a suggestion's main: the likeliest few, or — typed
// for — anything among your recipes, saved meals and ingredients.
export function SidePicker({ title, likely, find, onPick, onClose }: { title: string; likely: Dish[]; find: (query: string) => Dish[]; onPick: (dish: Dish) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;
  const rows = searching ? find(query).slice(0, 30) : likely;
  const kind = (d: Dish) => (d.recipe ? "Recipe" : d.meal ? "Meal" : "Ingredient");
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {/* (On a phone it sits high, clear of the keyboard.) */}
      <View style={{ flex: 1, alignItems: "center", justifyContent: Platform.OS === "web" ? "center" : "flex-start", paddingTop: Platform.OS === "web" ? 0 : 90, backgroundColor: "rgba(15,23,42,0.4)" }}>
        <Pressable style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, cursor: "default" } as object} onPress={onClose} accessibilityLabel="Close" />
        <View style={{ width: "92%", maxWidth: 400, maxHeight: Platform.OS === "web" ? "80%" : "60%", padding: 20, borderRadius: 16, backgroundColor: WEB.card, boxShadow: "0 18px 40px rgba(15,23,42,0.25)" }}>
          <Text numberOfLines={2} style={{ fontSize: 17, fontWeight: "700", color: WEB.text }}>{title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", height: 38, marginTop: 12, paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, borderColor: WEB.border }}>
            <Ionicons name="search" size={15} color={WEB.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              autoFocus
              placeholder="Search recipes, meals and ingredients"
              placeholderTextColor={WEB.faint}
              accessibilityLabel="Search"
              style={{ flex: 1, marginLeft: 8, fontSize: 14, color: WEB.text, outlineStyle: "none" } as object}
            />
          </View>
          <Text style={{ marginTop: 14, marginBottom: 4, fontSize: 11, fontWeight: "700", letterSpacing: 0.4, color: WEB.muted }}>{searching ? "MATCHES" : "GOES WITH IT"}</Text>
          <ScrollView style={{ marginHorizontal: -8 }}>
            {rows.map((dish) => (
              <Pressable
                key={dish.key}
                onPress={() => onPick(dish)}
                accessibilityLabel={`Choose ${dish.name}`}
                style={hoverable(({ hovered }) => ({ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 8, borderRadius: 9, backgroundColor: hovered ? WEB.blueSoft : "transparent" }))}
              >
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: WEB.text }}>{dish.name}</Text>
                  <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 12, color: WEB.muted }}>
                    {kind(dish)}
                    {dish.ingredient ? ` · ${dish.ingredient.defaultPortionAmount || 1} ${dish.ingredient.defaultPortionUnit ?? ""}`.trimEnd() : ""}
                  </Text>
                </View>
                <Text style={{ marginLeft: 10, fontSize: 12, color: WEB.body }}>
                  {Math.round(dish.calories)} kcal · P {Math.round(dish.protein)} g
                </Text>
              </Pressable>
            ))}
            {!rows.length && <Text style={{ paddingHorizontal: 8, paddingVertical: 10, fontSize: 13, color: WEB.muted }}>{searching ? "Nothing by that name." : "Nothing you've had beside it yet — search for something."}</Text>}
          </ScrollView>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 12 }}>
            <Button label="Cancel" kind="secondary" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
