import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "dev.supform.app",
  appName: "Supform",

  // Points at the compiled web build — not the source.
  // Run `npm run build:web` (in this directory) before `cap sync`.
  webDir: "../frontend/dist",

  server: {
    // Capacitor's built-in local server rewrites unmatched paths to index.html,
    // so React Router's BrowserRouter works without any code change.
    iosScheme: "capacitor",
    androidScheme: "https",
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#f8fafc",
      showSpinner: false,
      androidSpinnerStyle: "small",
      iosSpinnerStyle: "small",
      spinnerColor: "#2563eb",
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "Default",
      backgroundColor: "#ffffff",
    },
  },
};

export default config;
