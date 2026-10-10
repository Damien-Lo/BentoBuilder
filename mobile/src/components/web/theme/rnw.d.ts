// react-native-web's own colour normaliser, wrapped in ./normalizeValueWithProperty.
declare module "react-native-web/dist/exports/StyleSheet/compiler/normalizeValueWithProperty" {
  export default function normalizeValueWithProperty(value: unknown, property?: string | null): unknown;
}
