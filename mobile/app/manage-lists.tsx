import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  createBrand,
  createCategory,
  createStore,
  createTag,
  deleteBrand,
  deleteCategory,
  deleteStore,
  deleteTag,
  getBrands,
  getCategories,
  getStores,
  getTags,
  renameBrand,
  renameCategory,
  renameStore,
  renameTag,
} from "@/src/services/optionsApi";
import {
  createRecipeCategory,
  deleteRecipeCategory,
  getRecipeCategories,
  renameRecipeCategory,
} from "@/src/services/recipeApi";
import { useWideForm } from "@/src/components/forms/wideForm";
import { dangerSoft, PageHeader, useGoBack } from "@/src/components/settings/AccountParts";
import { WebSettingsFrame } from "@/src/components/settings/web/WebSettingsFrame";
import { Tap } from "@/src/components/ui/Tap";
import { OrbitPage, useOrbitTheme } from "@/src/theme/orbit";

type ListKind = "tags" | "ingredientCategories" | "recipeCategories" | "brands" | "stores";

type ListItem = { _id: string; name: string; isDefault?: boolean };

interface ListConfig {
  label: string;
  singular: string;
  get: () => Promise<ListItem[]>;
  create: (name: string) => Promise<ListItem>;
  rename: (id: string, name: string) => Promise<ListItem>;
  remove: (id: string) => Promise<void>;
  deleteNote: string;
}

const LIST_CONFIG: Record<ListKind, ListConfig> = {
  tags: {
    label: "Tags",
    singular: "tag",
    get: getTags,
    create: createTag,
    rename: renameTag,
    remove: deleteTag,
    deleteNote: "Removed from every ingredient, recipe, and meal it's applied to.",
  },
  ingredientCategories: {
    label: "Ingredient Categories",
    singular: "category",
    get: getCategories,
    create: createCategory,
    rename: renameCategory,
    remove: deleteCategory,
    deleteNote: "Ingredients here move to \"Uncategorized\".",
  },
  recipeCategories: {
    label: "Recipe Categories",
    singular: "category",
    get: getRecipeCategories as unknown as () => Promise<ListItem[]>,
    create: createRecipeCategory as unknown as (name: string) => Promise<ListItem>,
    rename: renameRecipeCategory as unknown as (id: string, name: string) => Promise<ListItem>,
    remove: deleteRecipeCategory,
    deleteNote: "Recipes here just lose the category.",
  },
  brands: {
    label: "Brands",
    singular: "brand",
    get: getBrands,
    create: createBrand,
    rename: renameBrand,
    remove: deleteBrand,
    deleteNote: "Ingredients here just lose the brand.",
  },
  stores: {
    label: "Stores",
    singular: "store",
    get: getStores,
    create: createStore,
    rename: renameStore,
    remove: deleteStore,
    deleteNote: "Pantry entries here just lose the store.",
  },
};

// In a desktop browser, beside the Settings list.
function Frame({ wide, children }: { wide: boolean; children: ReactNode }) {
  return wide ? <WebSettingsFrame>{children}</WebSettingsFrame> : <>{children}</>;
}

const KIND_ORDER: ListKind[] = ["tags", "ingredientCategories", "recipeCategories", "brands", "stores"];

// Settings → Kitchen → Manage lists: the tags, categories, brands and stores
// the Kitchen's pickers offer — added, renamed and deleted here. On the
// phone in Orbit's look, light or dark (`o`: its colours), in the plain
// accent like the rest of Settings; in a desktop browser the same, beside the
// Settings list (settings/web/WebSettingsFrame), with Kitchen's row chosen.
export default function ManageListsScreen() {
  const back = useGoBack("/settings-section/kitchen");
  const [activeKind, setActiveKind] = useState<ListKind>("tags");
  const [itemsByKind, setItemsByKind] = useState<Partial<Record<ListKind, ListItem[]>>>({});
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");

  const [renameTarget, setRenameTarget] = useState<ListItem | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createDraft, setCreateDraft] = useState("");
  const layout = useWideForm();
  const { colors, dark } = useOrbitTheme();
  const o = colors;
  const card = { backgroundColor: o.surface, borderColor: o.border, borderRadius: 18 };
  const field = { backgroundColor: o.surface, borderColor: o.border, color: o.text };
  // (The page's side padding: more in a desktop browser.)
  const pad = layout.wide ? 36 : 16;

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      try {
        const entries = await Promise.all(
          KIND_ORDER.map(async (kind) => [kind, await LIST_CONFIG[kind].get()] as const),
        );
        if (!cancelled) {
          setItemsByKind(Object.fromEntries(entries) as Record<ListKind, ListItem[]>);
        }
      } catch (err) {
        if (!cancelled) {
          Alert.alert("Couldn't load lists", err instanceof Error ? err.message : "Something went wrong.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadAll();
    return () => { cancelled = true; };
  }, []);

  const config = LIST_CONFIG[activeKind];

  const items = useMemo(() => {
    const list = itemsByKind[activeKind] ?? [];
    const query = searchText.trim().toLowerCase();
    const filtered = query ? list.filter((i) => i.name.toLowerCase().includes(query)) : list;
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [itemsByKind, activeKind, searchText]);

  // In a desktop browser the list reads down two columns; on a phone, one.
  const half = Math.ceil(items.length / 2);
  const itemColumns = layout.wide && items.length > 1 ? [items.slice(0, half), items.slice(half)] : [items];
  // (And the rename / create boxes stay a dialog's width there.)
  const dialogStyle = layout.wide ? { maxWidth: 440 } : undefined;

  function updateKindItems(kind: ListKind, updater: (current: ListItem[]) => ListItem[]) {
    setItemsByKind((prev) => ({ ...prev, [kind]: updater(prev[kind] ?? []) }));
  }

  async function handleCreate() {
    const name = createDraft.trim();
    if (!name) return;

    setSaving(true);
    try {
      const created = await config.create(name);
      updateKindItems(activeKind, (current) =>
        current.some((i) => i._id === created._id) ? current : [...current, created],
      );
      setShowCreate(false);
      setCreateDraft("");
    } catch (err) {
      Alert.alert("Couldn't create", err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRename() {
    if (!renameTarget) return;
    const name = renameDraft.trim();
    if (!name) return;

    setSaving(true);
    try {
      const updated = await config.rename(renameTarget._id, name);
      updateKindItems(activeKind, (current) =>
        current.map((i) => (i._id === updated._id ? updated : i)),
      );
      setRenameTarget(null);
    } catch (err) {
      Alert.alert("Couldn't rename", err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(item: ListItem) {
    Alert.alert(
      `Delete "${item.name}"?`,
      config.deleteNote,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await config.remove(item._id);
              updateKindItems(activeKind, (current) => current.filter((i) => i._id !== item._id));
            } catch (err) {
              Alert.alert("Couldn't delete", err instanceof Error ? err.message : "Something went wrong.");
            }
          },
        },
      ],
    );
  }

  return (
    <OrbitPage>
    <Frame wide={layout.wide}>
    <SafeAreaView className="flex-1 bg-slate-50" style={[layout.page, layout.wide && { alignSelf: "flex-start" }, { backgroundColor: o.canvas }]} edges={["top", "left", "right"]}>
      <PageHeader title="Manage lists" subtitle="Tags, categories, brands and stores" onBack={back} style={{ paddingHorizontal: pad, paddingTop: layout.wide ? 24 : 4 }} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: pad, paddingVertical: 12, gap: 8 }}
        className="border-b border-slate-200 bg-white"
        // (On the web a sideways scroller grows to fill the page unless told not to.)
        style={[{ flexGrow: 0 }, { backgroundColor: "transparent", borderBottomWidth: 0, marginTop: 4 }]}
      >
        {KIND_ORDER.map((kind) => {
          const isActive = kind === activeKind;
          return (
            <Pressable
              key={kind}
              className={`rounded-full px-4 py-2 ${isActive ? "bg-blue-600" : "bg-slate-100"}`}
              style={{ backgroundColor: isActive ? o.ink : o.pill }}
              onPress={() => setActiveKind(kind)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <Text className={`text-sm font-semibold ${isActive ? "text-white" : "text-slate-600"}`} style={{ color: isActive ? o.onInk : o.onPill }}>
                {LIST_CONFIG[kind].label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View className="px-5 pt-4" style={{ paddingHorizontal: pad, paddingTop: 4 }}>
        <View className="h-12 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4" style={{ backgroundColor: o.surface, borderColor: o.border, borderRadius: 16 }}>
          <Ionicons name="search-outline" size={19} color={o.muted} />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder={`Search ${config.label.toLowerCase()}`}
            placeholderTextColor={o.faint}
            className="ml-3 flex-1 text-base text-slate-950"
            style={{ color: o.text }}
          />
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={o.muted} />
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: pad, paddingTop: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {items.length === 0 ? (
            <View className="items-center rounded-2xl border border-slate-200 bg-white px-6 py-16" style={card}>
              <Ionicons name="pricetag-outline" size={38} color={o.faint} />
              <Text className="mt-3 text-center text-slate-500" style={{ color: o.muted }}>
                {searchText ? "No matches." : `No ${config.label.toLowerCase()} yet.`}
              </Text>
            </View>
          ) : (
            <View style={layout.columns}>
            {itemColumns.map((columnItems, columnIndex) => (
            <View key={columnIndex} style={layout.column}>
            <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white" style={card}>
              {columnItems.map((item, index) => (
                <View
                  key={item._id}
                  className={`flex-row items-center px-4 py-3.5 ${
                    index < columnItems.length - 1 ? "border-b border-slate-100" : ""
                  }`}
                  style={{ borderBottomColor: o.border }}
                >
                  <Text className="flex-1 text-base text-slate-900" style={{ color: o.text }} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.isDefault ? (
                    <View className="mr-2 rounded-full bg-slate-100 px-2.5 py-1" style={{ backgroundColor: o.pill }}>
                      <Text className="text-xs font-semibold text-slate-500" style={{ color: o.muted }}>Default</Text>
                    </View>
                  ) : (
                    <>
                      <Tap
                        accessibilityRole="button"
                        accessibilityLabel={`Rename ${item.name}`}
                        style={{ marginRight: 4, width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }}
                        pressedStyle={{ backgroundColor: o.pill }}
                        onPress={() => {
                          setRenameTarget(item);
                          setRenameDraft(item.name);
                        }}
                      >
                        <Ionicons name="pencil-outline" size={18} color={o.icon} />
                      </Tap>
                      <Tap
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${item.name}`}
                        style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }}
                        pressedStyle={{ backgroundColor: dangerSoft(dark) }}
                        onPress={() => handleDelete(item)}
                      >
                        <Ionicons name="trash-outline" size={18} color={o.danger} />
                      </Tap>
                    </>
                  )}
                </View>
              ))}
            </View>
            </View>
            ))}
            </View>
          )}
        </ScrollView>
      )}

      <View className="absolute bottom-6 right-5">
        <Tap
          accessibilityRole="button"
          accessibilityLabel={`New ${config.singular}`}
          style={{ width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: o.ink, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 }}
          pressedStyle={{ opacity: 0.85 }}
          onPress={() => {
            setCreateDraft(searchText.trim());
            setShowCreate(true);
          }}
        >
          <Ionicons name="add" size={28} color={o.onInk} />
        </Tap>
      </View>
    </SafeAreaView>
    </Frame>

    {/* Rename modal */}
    <Modal visible={!!renameTarget} transparent animationType="fade" onRequestClose={() => setRenameTarget(null)}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 items-center justify-center bg-black/40 px-6" style={{ backgroundColor: o.scrim }}>
        <Pressable className="absolute inset-0" onPress={() => setRenameTarget(null)} />
        <View className="w-full rounded-3xl bg-white p-5" style={[dialogStyle, { backgroundColor: o.surface }]}>
          <Text className="text-lg font-bold text-slate-950" style={{ color: o.text }}>Rename {config.singular}</Text>
          <TextInput
            value={renameDraft}
            onChangeText={setRenameDraft}
            autoFocus
            className="mt-4 h-14 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950"
            style={field}
          />
          <View className="mt-5 flex-row gap-3">
            <Pressable
              disabled={saving}
              className="flex-1 items-center rounded-2xl bg-slate-100 py-3.5 active:bg-slate-200"
              style={{ backgroundColor: o.pill, height: 52, justifyContent: "center", paddingVertical: 0, borderRadius: 16 }}
              onPress={() => setRenameTarget(null)}
            >
              <Text className="text-sm font-semibold text-slate-600" style={{ color: o.onPill, fontSize: 15 }}>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={saving}
              className={`flex-1 items-center rounded-2xl py-3.5 ${saving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"}`}
              style={{ backgroundColor: o.ink, opacity: saving ? 0.5 : 1, height: 52, justifyContent: "center", paddingVertical: 0, borderRadius: 16 }}
              onPress={() => void handleRename()}
            >
              <Text className="text-sm font-semibold text-white" style={{ color: o.onInk, fontSize: 15 }}>{saving ? "Saving..." : "Save"}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>

    {/* Create modal */}
    <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 items-center justify-center bg-black/40 px-6" style={{ backgroundColor: o.scrim }}>
        <Pressable className="absolute inset-0" onPress={() => setShowCreate(false)} />
        <View className="w-full rounded-3xl bg-white p-5" style={[dialogStyle, { backgroundColor: o.surface }]}>
          <Text className="text-lg font-bold text-slate-950" style={{ color: o.text }}>New {config.singular}</Text>
          <TextInput
            value={createDraft}
            onChangeText={setCreateDraft}
            autoFocus
            placeholder={`e.g. ${config.singular === "tag" ? "Freezer-friendly" : "Name"}`}
            placeholderTextColor={o.faint}
            className="mt-4 h-14 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950"
            style={field}
          />
          <View className="mt-5 flex-row gap-3">
            <Pressable
              disabled={saving}
              className="flex-1 items-center rounded-2xl bg-slate-100 py-3.5 active:bg-slate-200"
              style={{ backgroundColor: o.pill, height: 52, justifyContent: "center", paddingVertical: 0, borderRadius: 16 }}
              onPress={() => setShowCreate(false)}
            >
              <Text className="text-sm font-semibold text-slate-600" style={{ color: o.onPill, fontSize: 15 }}>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={saving}
              className={`flex-1 items-center rounded-2xl py-3.5 ${saving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"}`}
              style={{ backgroundColor: o.ink, opacity: saving ? 0.5 : 1, height: 52, justifyContent: "center", paddingVertical: 0, borderRadius: 16 }}
              onPress={() => void handleCreate()}
            >
              <Text className="text-sm font-semibold text-white" style={{ color: o.onInk, fontSize: 15 }}>{saving ? "Creating..." : "Create"}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    </OrbitPage>
  );
}
