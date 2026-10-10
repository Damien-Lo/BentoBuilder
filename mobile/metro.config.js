const path = require("path");

const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Dark mode in the browser (src/components/web/theme/engine.ts): on web,
// react-native-web's colour normaliser is replaced by a wrapper round it.
// The phone's bundles are resolved exactly as before.
const themedNormalizer = path.resolve(__dirname, "src/components/web/theme/normalizeValueWithProperty.ts");
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === "web" &&
    moduleName.endsWith("/normalizeValueWithProperty") &&
    moduleName.startsWith(".") &&
    /react-native-web[\\/]dist[\\/]/.test(context.originModulePath)
  ) {
    return { type: "sourceFile", filePath: themedNormalizer };
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = withNativeWind(config, {
  input: "./global.css",
});
