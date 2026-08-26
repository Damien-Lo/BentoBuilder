const IS_DEV = process.env.APP_VARIANT === "development";

module.exports = {
  expo: {
    name: IS_DEV ? "BentoBuilder Beta" : "BentoBuilder",
    slug: "mobile",
    version: "1.0.0",
    orientation: "portrait",
    icon: IS_DEV
      ? "./assets/images/BentoBox_Beta_App_Icon.png"
      : "./assets/images/BentoBox_App_Icon.png",
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
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: {
            backgroundColor: "#000000",
          },
        },
      ],
      "@react-native-community/datetimepicker",
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
