import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.bytesimplified.medtrack',
  appName: 'MedTrack',
  webDir: 'dist',
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_medtrack',
      iconColor: '#0f766e',
    },
  },
}

export default config
