import { useEffect, useState } from 'react'
import { installPlatform, onInstallChange, type InstallPlatform } from '@/lib/install'

/** This device's install situation, kept current (see lib/install.ts). */
export function useInstallPlatform(): InstallPlatform {
  const [platform, setPlatform] = useState<InstallPlatform>(() => installPlatform())
  useEffect(() => onInstallChange(() => setPlatform(installPlatform())), [])
  return platform
}
