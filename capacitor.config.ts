import type { CapacitorConfig } from "@capacitor/cli";


const config: CapacitorConfig = {
  appId: "com.uniqops.allout",
  appName: "Allout Timer",
  webDir: "dist",
  android: { allowMixedContent: false },
  ios: { includePlugins: ["@capacitor-firebase/crashlytics", "@capacitor/app", "@revenuecat/purchases-capacitor", "allout-interval"] },
};

export default config;
