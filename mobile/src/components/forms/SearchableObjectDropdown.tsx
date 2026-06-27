import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

interface BaseDropdownOption {
  _id: string;
  name: string;
}

interface SearchableObjectDropdownProps<T extends BaseDropdownOption> {
  options?: T[];
  selectedId?: string;
  selectedName?: string;

  placeholder: string;

  showAllWhenEmpty?: boolean;
  disabled?: boolean;

  onSelect: (option: T) => void;
  onTextChange?: (value: string) => void;
}

export function SearchableObjectDropdown<T extends BaseDropdownOption>({
  options,
  selectedId = "",
  selectedName = "",
  placeholder,
  showAllWhenEmpty = true,
  disabled = false,
  onSelect,
  onTextChange,
}: SearchableObjectDropdownProps<T>) {
  const safeOptions = useMemo<T[]>(
    () => (Array.isArray(options) ? options : []),
    [options],
  );

  const safeSelectedName = typeof selectedName === "string" ? selectedName : "";

  const [query, setQuery] = useState(safeSelectedName);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(safeSelectedName);
  }, [safeSelectedName]);

  const normalizedQuery = query.trim().toLowerCase();

  const normalizedSelectedName = safeSelectedName.trim().toLowerCase();

  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) {
      return showAllWhenEmpty ? safeOptions : [];
    }

    if (showAllWhenEmpty && normalizedQuery === normalizedSelectedName) {
      return safeOptions;
    }

    return safeOptions.filter((option) =>
      option.name.trim().toLowerCase().includes(normalizedQuery),
    );
  }, [normalizedQuery, normalizedSelectedName, safeOptions, showAllWhenEmpty]);

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

  function handleSelect(option: T) {
    setQuery(option.name);
    setOpen(false);
    onSelect(option);
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
        width: "100%",
        zIndex: open ? 1000 : 1,
        elevation: open ? 20 : 0,
      }}
    >
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
        <Ionicons name="search-outline" size={20} color="#64748B" />

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
          <Pressable hitSlop={10} onPress={handleClear}>
            <Ionicons name="close-circle" size={20} color="#94A3B8" />
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
                    <Ionicons name="checkmark" size={20} color="#2563EB" />
                  )}
                </Pressable>
              );
            })}

            {filteredOptions.length === 0 && (
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

export default SearchableObjectDropdown;
