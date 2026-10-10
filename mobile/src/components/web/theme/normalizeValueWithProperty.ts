// On web, Metro gives react-native-web this file in place of its own
// `StyleSheet/compiler/normalizeValueWithProperty` (see metro.config.js).
// It does what the original does, then hands colours to the theme.
import original from "react-native-web/dist/exports/StyleSheet/compiler/normalizeValueWithProperty";

import { themedStyleValue } from "./engine";

export default function normalizeValueWithProperty(value: unknown, property?: string | null): unknown {
  return themedStyleValue(property, original(value, property));
}
