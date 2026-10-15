import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Alert, Platform, Pressable, Text, View } from "react-native";

import { showActions } from "@/src/components/todo/theme";
import { removeRecipePhoto, setRecipePhoto } from "@/src/services/recipeApi";
import { pastedImage, pastePhoto, pickPhoto, photoUri, preparePhoto, type PreparedPhoto } from "@/src/utils/photos";

// A recipe's photo on its new and edit forms: taken, pasted (⌘V on the page,
// in a browser) or chosen, shown straight away, and saved with the recipe
// (applyPhotoChange, once it's saved and has an id).

export type PhotoChange = { kind: "keep" } | { kind: "new"; photo: PreparedPhoto } | { kind: "remove" };

export async function applyPhotoChange(recipeId: string, change: PhotoChange): Promise<void> {
  if (change.kind === "new") await setRecipePhoto(recipeId, change.photo);
  else if (change.kind === "remove") await removeRecipePhoto(recipeId);
}

export function RecipePhotoField({ current, change, onChange }: { current?: string | null; change: PhotoChange; onChange: (change: PhotoChange) => void }) {
  const [busy, setBusy] = useState(false);
  const preview = change.kind === "new" ? `data:image/jpeg;base64,${change.photo.base64}` : change.kind === "remove" ? null : photoUri(current);

  async function take(get: () => Promise<PreparedPhoto | null>, nothing?: string) {
    try {
      setBusy(true);
      const photo = await get();
      if (photo) onChange({ kind: "new", photo });
      else if (nothing) Alert.alert(nothing);
    } catch (error) {
      Alert.alert("Couldn't add the photo", error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  // (In a browser, ⌘V anywhere on the form — outside a text field — is a paste of the photo.)
  const takeRef = useRef(take);
  takeRef.current = take;
  // (Only while this screen's the one showing: in a browser the screens
  // underneath stay on the page, and would take the paste too.)
  useFocusEffect(
    useCallback(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const uri = pastedImage(event);
      if (!uri) return;
      event.preventDefault();
      void takeRef.current(() => preparePhoto(uri));
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    }, []),
  );

  function choose() {
    if (busy) return;
    showActions(preview ? "Change photo" : "Add a photo", [
      { label: "Take a photo", onPress: () => void take(() => pickPhoto("camera")) },
      { label: Platform.OS === "web" ? "Paste a copied image (or ⌘V on the page)" : "Paste photo", onPress: () => void take(pastePhoto, "There's no image copied. Copy a photo first, then paste it here.") },
      { label: Platform.OS === "web" ? "Choose a file" : "Choose from library", onPress: () => void take(() => pickPhoto("library")) },
      ...(preview ? [{ label: "Remove photo", destructive: true, onPress: () => onChange(current ? { kind: "remove" } : { kind: "keep" }) }] : []),
    ]);
  }

  if (preview) {
    return (
      <View className="mb-4 mt-3">
        <Image source={{ uri: preview }} style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 14, backgroundColor: "#E2E8F0" }} contentFit="cover" />
        <Pressable onPress={choose} disabled={busy} accessibilityLabel="Change photo" className="absolute bottom-2.5 right-2.5 flex-row items-center rounded-full bg-black/55 px-3 py-1.5 active:opacity-70">
          <Ionicons name="camera-outline" size={15} color="#FFFFFF" />
          <Text className="ml-1.5 text-xs font-semibold text-white">{busy ? "Working…" : "Change"}</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <Pressable onPress={choose} disabled={busy} accessibilityLabel="Add a photo" className="mb-4 mt-3 flex-row items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3.5 active:bg-slate-100">
      <Ionicons name="camera-outline" size={20} color="#64748B" />
      <View className="ml-3 flex-1">
        <Text className="text-sm font-semibold text-slate-700">{busy ? "Working…" : "Add a photo"}</Text>
        <Text className="text-xs text-slate-400">{Platform.OS === "web" ? "Take, paste (⌘V) or choose one — optional" : "Take, paste or choose one — optional"}</Text>
      </View>
    </Pressable>
  );
}
