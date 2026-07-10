import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import type { SelectOption } from "@/src/types/options";

interface CreatableMultiTagDropdownProps {
  options?: SelectOption[];
  selectedItems?: SelectOption[];
  placeholder?: string;
  createLabel?: string;
  disabled?: boolean;
  onAdd: (option: SelectOption) => void;
  onRemove: (id: string) => void;
  onCreate: (name: string) => Promise<SelectOption>;
}

export function CreatableMultiTagDropdown({
  options,
  selectedItems = [],
  placeholder = "Add a tag…",
  createLabel = "Create",
  disabled = false,
  onAdd,
  onRemove,
  onCreate,
}: CreatableMultiTagDropdownProps) {
  const safeOptions = useMemo(
    () => (Array.isArray(options) ? options : []),
    [options],
  );

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const selectedIds = useMemo(
    () => new Set(selectedItems.map((s) => s._id)),
    [selectedItems],
  );

  const normalizedQuery = query.trim().toLowerCase();

  const filteredOptions = useMemo(() => {
    const unselected = safeOptions.filter((o) => !selectedIds.has(o._id));
    if (!normalizedQuery) return unselected;
    return unselected.filter((o) =>
      o.name.trim().toLowerCase().includes(normalizedQuery),
    );
  }, [safeOptions, selectedIds, normalizedQuery]);

  const exactMatch = safeOptions.some(
    (o) => o.name.trim().toLowerCase() === normalizedQuery,
  );

  const canCreate = normalizedQuery.length > 0 && !exactMatch && !creating;

  function handleTextChange(value: string) {
    setQuery(value);
    if (!disabled) setOpen(true);
  }

  function handleSelect(option: SelectOption) {
    setQuery("");
    setOpen(false);
    onAdd(option);
  }

  async function handleCreate() {
    const trimmedName = query.trim();
    if (!trimmedName || creating) return;
    try {
      setCreating(true);
      const created = await onCreate(trimmedName);
      setQuery("");
      setOpen(false);
      onAdd(created);
    } catch (error) {
      console.error("Failed to create tag:", error);
    } finally {
      setCreating(false);
    }
  }

  return (
    <View style={{ width: "100%", zIndex: open ? 1000 : 1, elevation: open ? 20 : 0 }}>
      {/* Selected tag chips */}
      {selectedItems.length > 0 && (
        <View className="mb-2 flex-row flex-wrap gap-2">
          {selectedItems.map((tag) => (
            <View
              key={tag._id}
              className="flex-row items-center rounded-full bg-blue-100 px-3 py-1"
            >
              <Text className="mr-1 text-sm font-medium text-blue-700">
                {tag.name}
              </Text>
              {!disabled && (
                <Pressable hitSlop={8} onPress={() => onRemove(tag._id)}>
                  <Ionicons name="close-circle" size={16} color="#1D4ED8" />
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Input row */}
      <View
        style={{ height: 56 }}
        className={`flex-row items-center rounded-2xl border bg-white px-4 ${
          disabled
            ? "border-slate-100 opacity-60"
            : open
              ? "border-blue-500"
              : "border-slate-200"
        }`}
      >
        <Ionicons name="pricetag-outline" size={20} color="#64748B" />

        <TextInput
          value={query}
          editable={!disabled}
          placeholder={placeholder}
          placeholderTextColor="#94A3B8"
          autoCapitalize="words"
          autoCorrect={false}
          className="ml-3 flex-1 text-base text-slate-950"
          onFocus={() => { if (!disabled) setOpen(true); }}
          onChangeText={handleTextChange}
          onSubmitEditing={() => setOpen(false)}
        />

        {query.length > 0 && !disabled ? (
          <Pressable hitSlop={10} onPress={() => { setQuery(""); setOpen(true); }}>
            <Ionicons name="close-circle" size={20} color="#94A3B8" />
          </Pressable>
        ) : (
          <Pressable
            disabled={disabled}
            hitSlop={10}
            onPress={() => { if (!disabled) setOpen((prev) => !prev); }}
          >
            <Ionicons
              name={open ? "chevron-up" : "chevron-down"}
              size={18}
              color="#64748B"
            />
          </Pressable>
        )}
      </View>

      {/* Dropdown list */}
      {open && !disabled && (
        <View
          className="absolute left-0 right-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"
          style={{ top: selectedItems.length > 0 ? undefined : 60, maxHeight: 240, zIndex: 1001, elevation: 20 }}
        >
          <ScrollView
            nestedScrollEnabled
            keyboardShouldPersistTaps="always"
            showsVerticalScrollIndicator={false}
          >
            {filteredOptions.map((option) => (
              <Pressable
                key={option._id}
                className="flex-row items-center border-b border-slate-100 px-4 py-4 active:bg-slate-50"
                onPress={() => handleSelect(option)}
              >
                <Text className="flex-1 text-base text-slate-900">
                  {option.name}
                </Text>
              </Pressable>
            ))}

            {canCreate && (
              <Pressable
                className="flex-row items-center px-4 py-4 active:bg-blue-50"
                disabled={creating}
                onPress={() => void handleCreate()}
              >
                <View className="h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                  <Ionicons name="add" size={19} color="#2563EB" />
                </View>
                <Text className="ml-3 flex-1 text-base font-semibold text-blue-700">
                  {createLabel} "{query.trim()}"
                </Text>
              </Pressable>
            )}

            {creating && (
              <View className="flex-row items-center px-4 py-4">
                <ActivityIndicator size="small" color="#2563EB" />
                <Text className="ml-3 text-base text-slate-500">Creating…</Text>
              </View>
            )}

            {filteredOptions.length === 0 && !canCreate && !creating && (
              <View className="px-4 py-5">
                <Text className="text-center text-sm text-slate-500">
                  No matching tags
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

export default CreatableMultiTagDropdown;
