import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

interface CreatableStringDropdownProps {
  options?: string[];
  selectedValue?: string;
  placeholder: string;
  disabled?: boolean;
  onSelect: (value: string) => void;
  // Shrinks just the closed-state trigger to match a tight host layout —
  // the opened dropdown/search modal stays full-size either way, since it
  // floats above the layout rather than needing to match it.
  compact?: boolean;
}

interface DropdownPosition {
  top: number;
  left: number;
  width: number;
}

export function CreatableStringDropdown({
  options,
  selectedValue = "",
  placeholder,
  disabled = false,
  onSelect,
  compact = false,
}: CreatableStringDropdownProps) {
  const safeOptions = useMemo(
    () => (Array.isArray(options) ? options : []),
    [options],
  );

  const safeSelectedValue =
    typeof selectedValue === "string" ? selectedValue : "";

  const anchorRef = useRef<View>(null);
  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState(safeSelectedValue);
  const [open, setOpen] = useState(false);

  const [dropdownPosition, setDropdownPosition] =
    useState<DropdownPosition>({
      top: 0,
      left: 0,
      width: 0,
    });

  useEffect(() => {
    if (!open) {
      setQuery(safeSelectedValue);
    }
  }, [open, safeSelectedValue]);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredOptions = useMemo(() => {
    const normalizedSelectedValue = safeSelectedValue
      .trim()
      .toLowerCase();

    if (
      !normalizedQuery ||
      normalizedQuery === normalizedSelectedValue
    ) {
      return safeOptions;
    }

    return safeOptions.filter((option) =>
      option.trim().toLowerCase().includes(normalizedQuery),
    );
  }, [normalizedQuery, safeOptions, safeSelectedValue]);

  function openDropdown() {
    if (disabled) {
      return;
    }

    anchorRef.current?.measureInWindow(
      (x, y, width, height) => {
        setDropdownPosition({
          left: x,
          top: y + height + 8,
          width,
        });

        setQuery(safeSelectedValue);
        setOpen(true);

        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);
      },
    );
  }

  // Typing commits the value immediately — there's no separate "create" step
  // for a plain string like a unit; whatever's typed just becomes the value.
  function handleTextChange(value: string) {
    setQuery(value);
    onSelect(value);
  }

  function closeDropdown() {
    setOpen(false);
    setQuery(safeSelectedValue);
  }

  function handleSelect(value: string) {
    setQuery(value);
    setOpen(false);
    onSelect(value);
  }

  return (
    <View ref={anchorRef} collapsable={false}>
      <Pressable
        disabled={disabled}
        className={`flex-row items-center border bg-white ${
          compact ? "h-10 rounded-xl px-2" : "h-[52px] rounded-2xl px-4"
        } ${
          disabled
            ? "border-slate-100 opacity-60"
            : open
              ? "border-blue-500"
              : "border-slate-200"
        }`}
        onPress={openDropdown}
      >
        <Text
          numberOfLines={1}
          className={`flex-1 ${compact ? "text-sm" : "text-base"} ${
            safeSelectedValue
              ? "text-slate-950"
              : "text-slate-400"
          }`}
        >
          {safeSelectedValue || placeholder}
        </Text>

        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={compact ? 14 : 18}
          color="#64748B"
        />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={closeDropdown}
      >
        <View className="flex-1">
          <Pressable
            className="absolute inset-0"
            onPress={closeDropdown}
          />

          <View
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"
            style={{
              position: "absolute",
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
              maxHeight: 280,
              zIndex: 1001,
              elevation: 20,
            }}
          >
            <View className="flex-row items-center border-b border-slate-200 px-4">
              <Ionicons
                name="search-outline"
                size={19}
                color="#64748B"
              />

              <TextInput
                ref={inputRef}
                value={query}
                placeholder={placeholder}
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                autoCorrect={false}
                className="h-[52px] flex-1 px-3 text-base text-slate-950"
                onChangeText={handleTextChange}
                onSubmitEditing={closeDropdown}
              />

              {query.length > 0 && (
                <Pressable
                  hitSlop={10}
                  onPress={() => {
                    setQuery("");
                    onSelect("");
                    inputRef.current?.focus();
                  }}
                >
                  <Ionicons
                    name="close-circle"
                    size={20}
                    color="#94A3B8"
                  />
                </Pressable>
              )}
            </View>

            <ScrollView
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {filteredOptions.map((option) => {
                const isSelected =
                  option.trim().toLowerCase() ===
                  safeSelectedValue.trim().toLowerCase();

                return (
                  <Pressable
                    key={option}
                    className="flex-row items-center border-b border-slate-100 px-4 py-4 active:bg-slate-50"
                    onPress={() => handleSelect(option)}
                  >
                    <Text className="flex-1 text-base text-slate-900">
                      {option}
                    </Text>

                    {isSelected && (
                      <Ionicons
                        name="checkmark"
                        size={19}
                        color="#2563EB"
                      />
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
        </View>
      </Modal>
    </View>
  );
}

export default CreatableStringDropdown;
