import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import { DEFAULT_GOLD } from '@/lib/brand'
import { ColorPicker } from './ColorPicker'

/**
 * Your accent color: buttons, highlights and badges across the app, for
 * you only (profiles.accent_color, applied in AppShell). The copper is
 * the default and is stored as no color.
 */
export function AccentColorSetting() {
  const { user, profile, setProfile } = useAppStore()
  const [saving, setSaving] = useState(false)

  async function choose(hex: string) {
    if (!user || !profile) return
    const value = hex.toUpperCase() === DEFAULT_GOLD ? null : hex.toUpperCase()
    if ((profile.accent_color ?? null) === value) return
    const before = profile
    // Applied right away (AppShell watches the profile); undone if it won't save
    setProfile({ ...profile, accent_color: value })
    setSaving(true)
    const { error } = await supabase.from('profiles').update({ accent_color: value }).eq('id', user.id)
    setSaving(false)
    if (error) {
      setProfile(before)
      toast.error(`Couldn't save your color: ${error.message}`)
    }
  }

  return (
    <div className="mt-5 pt-4 border-t border-field-700">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="font-cond font-bold text-sm uppercase tracking-wider text-white">Accent color</span>
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-field-400" />}
      </div>
      <p className="text-field-400 text-xs mb-3">Buttons, highlights and badges everywhere in the app. Only you see your color.</p>
      <ColorPicker value={profile?.accent_color ?? null} onPick={choose} disabled={saving} idPrefix="accent-color" />
    </div>
  )
}
