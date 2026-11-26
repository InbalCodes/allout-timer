import type { CapacitorConfig } from "@capacitor/cli";


const config: CapacitorConfig = {
  appId: "com.uniqops.allout",
  appName: "Allout Timer",
  webDir: "dist",
  android: { allowMixedContent: false },
  // iOS has no Firebase app yet (no GoogleService-Info.plist), so Crashlytics stays out of the iOS build.
  ios: { includePlugins: ["@capacitor/app", "@revenuecat/purchases-capacitor", "allout-interval"] },
};

export default config;
