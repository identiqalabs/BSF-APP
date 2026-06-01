export default {
  expo: {
    name: "Visitor Register",
    slug: "visitor-register",
    scheme: "visitor-register",
    version: "1.0.1",
    orientation: "default",
    userInterfaceStyle: "automatic",
    newArchEnabled: false,
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#FFFFFF"
    },
    icon: "./assets/mainlogo1.jpg",
    assetBundlePatterns: ["**/*"],
    android: {
      package: "com.visitorregister.app",
      versionCode: 1,
      adaptiveIcon: {
        foregroundImage: "./assets/mainlogo1.jpg",
        backgroundColor: "#FFFFFF"
      },
      permissions: ["CAMERA", "READ_MEDIA_IMAGES"]
    },
    ios: {
      bundleIdentifier: "com.visitorregister.app"
    },
    web: {
      bundler: "metro"
    },
    plugins: [
      "@react-native-community/datetimepicker",
      "expo-sharing",
      "expo-sqlite"
    ],
    extra: {
      LICENSE_API_BASE_URL: "https://f3tigq2rmb74psnp6nafqqg54i0kysrw.lambda-url.ap-south-1.on.aws/backend_api",
      eas: {
        projectId: "97e0bbc1-1cf2-4107-8b5e-a02c7b955a44"
      }
    },
    owner: "vrishab1122"
  }
};