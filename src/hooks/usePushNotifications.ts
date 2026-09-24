import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import {
  pushSupported, isIos, isStandalone, currentSubscription, saveSubscription,
  enablePush, disablePush, sendTestPush,
} from '@/lib/push'

/**
 * - unsupported:  this browser can't do web push
 * - ios-install:  iPhone/iPad in a Safari tab — push only works once
 *                 the app's been added to the home screen
 * - denied:       the user blocked notifications for this site
 * - off / on:     this device's state
 */
export type PushStatus = 'loading' | 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on'

export function usePushNotifications() {
  const { user } = useAppStore()
  const [status, setStatus] = useState<PushStatus>('loading')
  const [deviceCount, setDeviceCount] = useState(0)
  const [busy, setBusy] = useState(false)

  const countDevices = useCallback(async () => {
    if (!user) return
    const { count } = await supabase
      .from('push_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
    setDeviceCount(count ?? 0)
  }, [user])

  const refresh = useCallback(async () => {
    if (!pushSupported()) {
      setStatus(isIos() && !isStandalone() ? 'ios-install' : 'unsupported')
      return
    }
    if (Notification.permission === 'denied') { setStatus('denied'); return }
    const sub = Notification.permission === 'granted' ? await currentSubscription() : null
    setStatus(sub ? 'on' : 'off')
    // Re-save an active device so the server copy can't silently go
    // missing (e.g. cleaned up after a failed delivery)
    if (sub && user) await saveSubscription(sub).catch(() => {})
    await countDevices()
  }, [user, countDevices])

  useEffect(() => { refresh() }, [refresh])

  const enable = async () => {
    setBusy(true)
    try {
      const permission = await enablePush()
      if (permission === 'granted') {
        setStatus('on')
        toast.success('Notifications are on for this device')
      } else {
        setStatus(permission === 'denied' ? 'denied' : 'off')
      }
      await countDevices()
    } catch (e: any) {
      toast.error(`Couldn't turn on notifications: ${e?.message ?? e}`)
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    setBusy(true)
    try {
      await disablePush()
      setStatus('off')
      await countDevices()
    } catch (e: any) {
      toast.error(`Couldn't turn off notifications: ${e?.message ?? e}`)
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setBusy(true)
    try {
      const r = await sendTestPush()
      if (r.sent > 0) toast.success(`Test sent to ${r.sent} device${r.sent === 1 ? '' : 's'}`)
      else toast.error('No device accepted the test — try turning notifications off and on again')
      await countDevices()
    } catch (e: any) {
      toast.error(`Couldn't send a test: ${e?.message ?? e}`)
    } finally {
      setBusy(false)
    }
  }

  return { status, deviceCount, busy, enable, disable, test }
}
