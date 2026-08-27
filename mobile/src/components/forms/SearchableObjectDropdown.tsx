import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState, type ReactNode } from "react";
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

  // When provided, a "Create '<query>'" row replaces the plain "No matching
  // options" message once nothing matches the typed text — lets the caller
  // offer to create a new option inline instead of just blocking.
  onCreateNew?: (query: string) => void;

  // Optional second line under an option's name — e.g. flagging it as
  // generic — so options that share a name are still distinguishable.
  renderSubtitle?: (option: T) => ReactNode;
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
  onCreateNew,
  renderSubtitle,
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

  // Only the empty-query case is special-cased (browse everything vs. show
  // nothing until you type, per showAllWhenEmpty) — any actual typed text
  // always filters. There used to also be a "query equals the current
  // selection" branch that showed everything, meant to let re-tapping an
  // untouched field browse again — but every caller echoes typed text
  // straight back into the value bound to selectedName, so query and
  // selectedName are equal after literally every keystroke, permanently
  // short-circuiting the filter. Removed rather than patched per call site.
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) {
      return showAllWhenEmpty ? safeOptions : [];
    }

    return safeOptions.filter((option) =>
      option.name.trim().toLowerCase().includes(normalizedQuery),
    );
  }, [normalizedQuery, safeOptions, showAllWhenEmpty]);

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
                  <View className="flex-1">
                    <Text className="text-base text-slate-900">
                      {option.name}
                    </Text>
                    {renderSubtitle?.(option)}
                  </View>

                  {isSelected && (
                    <Ionicons name="checkmark" size={20} color="#2563EB" />
                  )}
                </Pressable>
              );
            })}

            {filteredOptions.length === 0 &&
              (onCreateNew && normalizedQuery ? (
                <Pressable
                  className="flex-row items-center px-4 py-4 active:bg-slate-50"
                  onPress={() => {
                    setOpen(false);
                    onCreateNew(query.trim());
                  }}
                >
                  <Ionicons name="add-circle-outline" size={20} color="#2563EB" />
                  <Text className="ml-2 text-base font-semibold text-blue-600">
                    Create &quot;{query.trim()}&quot;
                  </Text>
                </Pressable>
              ) : (
                <View className="px-4 py-5">
                  <Text className="text-center text-sm text-slate-500">
                    No matching options
                  </Text>
                </View>
              ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

export default SearchableObjectDropdown;
