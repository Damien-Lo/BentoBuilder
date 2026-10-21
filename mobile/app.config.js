const IS_DEV = process.env.APP_VARIANT === "development";

module.exports = {
  expo: {
    // The app is Orbit (renamed from BentoBuilder, Oct 2026). Only what people
    // see changed: the bundle IDs, slug and EAS project below stay, so it's
    // still the same app on phones that have it.
    name: IS_DEV ? "Orbit Beta" : "Orbit",
    slug: "mobile",
    version: "1.0.0",
    orientation: "portrait",
    // The tilted orbit (design/Orbit app icons.pdf).
    icon: IS_DEV ? "./assets/images/orbit-icon-beta.png" : "./assets/images/orbit-icon-light.png",
    scheme: "mobile",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      // Distinct bundle ID so the dev-client build and the deployed
      // WorkingSave build can be installed side by side instead of one
      // overwriting the other.
      bundleIdentifier: IS_DEV
        ? "com.damienlo.bentobuilder.dev"
        : "com.damienlo.bentobuilder",
      // On a light home screen the light icon, on a dark one the dark (the
      // beta build has the one, marked BETA).
      icon: IS_DEV
        ? "./assets/images/orbit-icon-beta.png"
        : { light: "./assets/images/orbit-icon-light.png", dark: "./assets/images/orbit-icon-dark.png" },
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: IS_DEV
        ? "com.damienlo.bentobuilder.dev"
        : "com.damienlo.bentobuilder",
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    web: {
      // Metro, like the phone builds; one page app (no server rendering).
      bundler: "metro",
      output: "single",
      favicon: "./assets/images/favicon-orbit.png",
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          // The icon, on Orbit's page colour (light or dark).
          image: "./assets/images/orbit-splash-light.png",
          imageWidth: 160,
          resizeMode: "contain",
          backgroundColor: "#F4F3F0",
          dark: {
            image: "./assets/images/orbit-splash-dark.png",
            backgroundColor: "#0D0F14",
          },
        },
      ],
      "@react-native-community/datetimepicker",
      [
        "expo-image-picker",
        {
          photosPermission: "Orbit uses your photos to add pictures to your recipes.",
          cameraPermission: "Orbit uses the camera to take pictures of your recipes and scan labels and receipts.",
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: false,
    },
    extra: {
      router: {},
      eas: {
        projectId: "a6abb1d1-934b-4dfb-a967-9d1859b97ac6",
      },
    },
    owner: "damien-lo",
  },
};
