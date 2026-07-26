import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import type { SelectOption } from "@/src/types/options";

interface CreatableMultiTagDropdownProps {
  options?: SelectOption[];
  selectedItems?: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  onAdd: (option: SelectOption) => void;
  onRemove: (id: string) => void;
}

export function CreatableMultiTagDropdown({
  options,
  selectedItems = [],
  placeholder = "Add a tag…",
  disabled = false,
  onAdd,
  onRemove,
}: CreatableMultiTagDropdownProps) {
  const safeOptions = useMemo(
    () => (Array.isArray(options) ? options : []),
    [options],
  );

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

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

  function handleTextChange(value: string) {
    setQuery(value);
    if (!disabled) setOpen(true);
  }

  function handleSelect(option: SelectOption) {
    setQuery("");
    setOpen(false);
    onAdd(option);
  }

  // Pressing return commits whatever's typed as a tag — matching an existing
  // one if there is one, or adding a pending tag (no real _id yet) if not.
  // The real record gets created (or matched) when the screen saves.
  function handleSubmit() {
    const trimmedName = query.trim();
    if (!trimmedName || disabled) return;

    const alreadySelected = selectedItems.some(
      (item) => item.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    );

    if (!alreadySelected) {
      const existingMatch = safeOptions.find(
        (option) =>
          option.name.trim().toLowerCase() === trimmedName.toLowerCase(),
      );

      onAdd(existingMatch ?? { _id: "", name: trimmedName });
    }

    setQuery("");
    setOpen(false);
  }

  return (
    <View style={{ width: "100%", zIndex: open ? 1000 : 1, elevation: open ? 20 : 0 }}>
      {/* Selected tag chips */}
      {selectedItems.length > 0 && (
        <View className="mb-2 flex-row flex-wrap gap-2">
          {selectedItems.map((tag) => (
            <View
              key={tag._id || tag.name}
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
          onSubmitEditing={handleSubmit}
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

            {filteredOptions.length === 0 && (
              <View className="px-4 py-5">
                <Text className="text-center text-sm text-slate-500">
                  {normalizedQuery
                    ? "No matching tags — press return to add it"
                    : "No matching tags"}
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
