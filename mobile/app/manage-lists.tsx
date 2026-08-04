import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
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

const KIND_ORDER: ListKind[] = ["tags", "ingredientCategories", "recipeCategories", "brands", "stores"];

export default function ManageListsScreen() {
  const router = useRouter();
  const [activeKind, setActiveKind] = useState<ListKind>("tags");
  const [itemsByKind, setItemsByKind] = useState<Partial<Record<ListKind, ListItem[]>>>({});
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");

  const [renameTarget, setRenameTarget] = useState<ListItem | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createDraft, setCreateDraft] = useState("");

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
    <>
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      <View className="flex-row items-center border-b border-slate-200 bg-white px-4 py-3">
        <Pressable
          className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100"
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <Text className="ml-2 flex-1 text-xl font-bold text-slate-950">Manage lists</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}
        className="border-b border-slate-200 bg-white"
      >
        {KIND_ORDER.map((kind) => {
          const isActive = kind === activeKind;
          return (
            <Pressable
              key={kind}
              className={`rounded-full px-4 py-2 ${isActive ? "bg-blue-600" : "bg-slate-100"}`}
              onPress={() => setActiveKind(kind)}
            >
              <Text className={`text-sm font-semibold ${isActive ? "text-white" : "text-slate-600"}`}>
                {LIST_CONFIG[kind].label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View className="px-5 pt-4">
        <View className="h-12 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4">
          <Ionicons name="search-outline" size={19} color="#64748B" />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder={`Search ${config.label.toLowerCase()}`}
            placeholderTextColor="#94A3B8"
            className="ml-3 flex-1 text-base text-slate-950"
          />
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {items.length === 0 ? (
            <View className="items-center rounded-2xl border border-slate-200 bg-white px-6 py-16">
              <Ionicons name="pricetag-outline" size={38} color="#94A3B8" />
              <Text className="mt-3 text-center text-slate-500">
                {searchText ? "No matches." : `No ${config.label.toLowerCase()} yet.`}
              </Text>
            </View>
          ) : (
            <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {items.map((item, index) => (
                <View
                  key={item._id}
                  className={`flex-row items-center px-4 py-3.5 ${
                    index < items.length - 1 ? "border-b border-slate-100" : ""
                  }`}
                >
                  <Text className="flex-1 text-base text-slate-900" numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.isDefault ? (
                    <View className="mr-2 rounded-full bg-slate-100 px-2.5 py-1">
                      <Text className="text-xs font-semibold text-slate-500">Default</Text>
                    </View>
                  ) : (
                    <>
                      <Pressable
                        className="mr-1 h-9 w-9 items-center justify-center rounded-full active:bg-slate-100"
                        onPress={() => {
                          setRenameTarget(item);
                          setRenameDraft(item.name);
                        }}
                      >
                        <Ionicons name="pencil-outline" size={18} color="#475569" />
                      </Pressable>
                      <Pressable
                        className="h-9 w-9 items-center justify-center rounded-full active:bg-red-50"
                        onPress={() => handleDelete(item)}
                      >
                        <Ionicons name="trash-outline" size={18} color="#DC2626" />
                      </Pressable>
                    </>
                  )}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <View className="absolute bottom-6 right-5">
        <Pressable
          className="h-14 w-14 items-center justify-center rounded-full bg-blue-600 shadow-lg active:bg-blue-700"
          onPress={() => {
            setCreateDraft(searchText.trim());
            setShowCreate(true);
          }}
        >
          <Ionicons name="add" size={28} color="white" />
        </Pressable>
      </View>
    </SafeAreaView>

    {/* Rename modal */}
    <Modal visible={!!renameTarget} transparent animationType="fade" onRequestClose={() => setRenameTarget(null)}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 items-center justify-center bg-black/40 px-6">
        <Pressable className="absolute inset-0" onPress={() => setRenameTarget(null)} />
        <View className="w-full rounded-3xl bg-white p-5">
          <Text className="text-lg font-bold text-slate-950">Rename {config.singular}</Text>
          <TextInput
            value={renameDraft}
            onChangeText={setRenameDraft}
            autoFocus
            className="mt-4 h-14 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950"
          />
          <View className="mt-5 flex-row gap-3">
            <Pressable
              disabled={saving}
              className="flex-1 items-center rounded-2xl bg-slate-100 py-3.5 active:bg-slate-200"
              onPress={() => setRenameTarget(null)}
            >
              <Text className="text-sm font-semibold text-slate-600">Cancel</Text>
            </Pressable>
            <Pressable
              disabled={saving}
              className={`flex-1 items-center rounded-2xl py-3.5 ${saving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"}`}
              onPress={() => void handleRename()}
            >
              <Text className="text-sm font-semibold text-white">{saving ? "Saving..." : "Save"}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>

    {/* Create modal */}
    <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 items-center justify-center bg-black/40 px-6">
        <Pressable className="absolute inset-0" onPress={() => setShowCreate(false)} />
        <View className="w-full rounded-3xl bg-white p-5">
          <Text className="text-lg font-bold text-slate-950">New {config.singular}</Text>
          <TextInput
            value={createDraft}
            onChangeText={setCreateDraft}
            autoFocus
            placeholder={`e.g. ${config.singular === "tag" ? "Freezer-friendly" : "Name"}`}
            placeholderTextColor="#94A3B8"
            className="mt-4 h-14 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950"
          />
          <View className="mt-5 flex-row gap-3">
            <Pressable
              disabled={saving}
              className="flex-1 items-center rounded-2xl bg-slate-100 py-3.5 active:bg-slate-200"
              onPress={() => setShowCreate(false)}
            >
              <Text className="text-sm font-semibold text-slate-600">Cancel</Text>
            </Pressable>
            <Pressable
              disabled={saving}
              className={`flex-1 items-center rounded-2xl py-3.5 ${saving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"}`}
              onPress={() => void handleCreate()}
            >
              <Text className="text-sm font-semibold text-white">{saving ? "Creating..." : "Create"}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    </>
  );
}
