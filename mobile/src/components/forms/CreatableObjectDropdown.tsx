import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import type { SelectOption } from "@/src/types/options";

interface CreatableObjectDropdownProps {
  options?: SelectOption[];
  selectedId?: string;
  selectedName?: string;

  placeholder: string;
  createLabel?: string;

  showAllWhenEmpty?: boolean;
  disabled?: boolean;

  onSelect: (option: SelectOption) => void;
  onCreate: (name: string) => Promise<SelectOption>;

  onTextChange?: (value: string) => void;
}

export function CreatableObjectDropdown({
  options,
  selectedId = "",
  selectedName = "",
  placeholder,
  createLabel = "Create",
  showAllWhenEmpty = true,
  disabled = false,
  onSelect,
  onCreate,
  onTextChange,
}: CreatableObjectDropdownProps) {
  const safeOptions = useMemo(
    () => (Array.isArray(options) ? options : []),
    [options]
  );

  const safeSelectedName =
    typeof selectedName === "string" ? selectedName : "";

  const [query, setQuery] = useState(safeSelectedName);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setQuery(safeSelectedName);
  }, [safeSelectedName]);

  const normalizedQuery = query.trim().toLowerCase();

  const normalizedSelectedName = safeSelectedName
    .trim()
    .toLowerCase();

  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) {
      return showAllWhenEmpty ? safeOptions : [];
    }

    if (
      showAllWhenEmpty &&
      normalizedQuery === normalizedSelectedName
    ) {
      return safeOptions;
    }

    return safeOptions.filter((option) =>
      option.name
        .trim()
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [
    normalizedQuery,
    normalizedSelectedName,
    safeOptions,
    showAllWhenEmpty,
  ]);

  const exactMatch = safeOptions.some(
    (option) =>
      option.name.trim().toLowerCase() === normalizedQuery
  );

  const canCreate =
    normalizedQuery.length > 0 &&
    !exactMatch &&
    !creating;

  function openDropdown() {
    if (!disabled) {
      setOpen(true);
    }
  }

  function closeDropdown() {
    setOpen(false);
  }

  function handleTextChange(value: string) {
    setQuery(value);
    onTextChange?.(value);

    if (!disabled) {
      setOpen(true);
    }
  }

  function handleSelect(option: SelectOption) {
    setQuery(option.name);
    setOpen(false);
    onSelect(option);
  }

  async function handleCreate() {
    const trimmedName = query.trim();

    if (!trimmedName || creating) {
      return;
    }

    try {
      setCreating(true);

      const createdOption = await onCreate(trimmedName);

      setQuery(createdOption.name);
      setOpen(false);
      onSelect(createdOption);
    } catch (error) {
      console.error("Failed to create option:", error);
    } finally {
      setCreating(false);
    }
  }

  function handleClear() {
    setQuery("");
    onTextChange?.("");

    if (showAllWhenEmpty) {
      setOpen(true);
    } else {
      setOpen(false);
    }
  }

  return (
    <View
      className="relative"
      style={{
        zIndex: open ? 1000 : 1,
        elevation: open ? 20 : 0,
      }}
    >
      <View
        className={`h-[52px] flex-row items-center rounded-2xl border bg-white px-4 ${
          disabled
            ? "border-slate-100 opacity-60"
            : open
              ? "border-blue-500"
              : "border-slate-200"
        }`}
      >
        <Ionicons
          name="search-outline"
          size={20}
          color="#64748B"
        />

        <TextInput
          value={query}
          editable={!disabled}
          placeholder={placeholder}
          placeholderTextColor="#94A3B8"
          autoCapitalize="words"
          autoCorrect={false}
          className="ml-3 flex-1 text-base text-slate-950"
          onFocus={openDropdown}
          onChangeText={handleTextChange}
          onSubmitEditing={closeDropdown}
        />

        {query.length > 0 && !disabled ? (
          <Pressable
            hitSlop={10}
            onPress={handleClear}
          >
            <Ionicons
              name="close-circle"
              size={20}
              color="#94A3B8"
            />
          </Pressable>
        ) : (
          <Pressable
            disabled={disabled}
            hitSlop={10}
            onPress={() => {
              if (open) {
                closeDropdown();
              } else {
                openDropdown();
              }
            }}
          >
            <Ionicons
              name={open ? "chevron-up" : "chevron-down"}
              size={18}
              color="#64748B"
            />
          </Pressable>
        )}
      </View>

      {open && !disabled && (
        <View
          className="absolute left-0 right-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"
          style={{
            top: 60,
            maxHeight: 260,
            zIndex: 1001,
            elevation: 20,
          }}
        >
          <ScrollView
            nestedScrollEnabled
            keyboardShouldPersistTaps="always"
            showsVerticalScrollIndicator={false}
          >
            {filteredOptions.map((option) => {
              const isSelected = option._id === selectedId;

              return (
                <Pressable
                  key={option._id}
                  className="flex-row items-center border-b border-slate-100 px-4 py-4 active:bg-slate-50"
                  onPress={() => handleSelect(option)}
                >
                  <Text className="flex-1 text-base text-slate-900">
                    {option.name}
                  </Text>

                  {isSelected && (
                    <Ionicons
                      name="checkmark"
                      size={20}
                      color="#2563EB"
                    />
                  )}
                </Pressable>
              );
            })}

            {canCreate && (
              <Pressable
                className="flex-row items-center px-4 py-4 active:bg-blue-50"
                disabled={creating}
                onPress={() => void handleCreate()}
              >
                <View className="h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                  <Ionicons
                    name="add"
                    size={19}
                    color="#2563EB"
                  />
                </View>

                <Text className="ml-3 flex-1 text-base font-semibold text-blue-700">
                  {createLabel} “{query.trim()}”
                </Text>
              </Pressable>
            )}

            {creating && (
              <View className="flex-row items-center px-4 py-4">
                <ActivityIndicator
                  size="small"
                  color="#2563EB"
                />

                <Text className="ml-3 text-base text-slate-500">
                  Creating...
                </Text>
              </View>
            )}

            {filteredOptions.length === 0 &&
              !canCreate &&
              !creating && (
                <View className="px-4 py-5">
                  <Text className="text-center text-sm text-slate-500">
                    No matching options
                  </Text>
                </View>
              )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

export default CreatableObjectDropdown;