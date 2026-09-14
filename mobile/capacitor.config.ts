import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.louay.voicebox',
  appName: 'Voicebox',
  webDir: '../web/dist',
  bundledWebRuntime: false,
  server: {
    cleartext: true,
  },
};

export default config;
