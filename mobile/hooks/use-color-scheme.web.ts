/**
 * In a browser the app is always drawn with its light colours; the dark
 * theme is a translation of them made in src/components/web/theme. So the
 * navigation theme stays light here, whatever the system is set to.
 */
export function useColorScheme() {
  return 'light' as const;
}
