import { useRef, useState } from 'react'
import { ImageIcon, Upload, X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import { makeLogoPng, type CutoutResult } from '@/lib/logoCutout'

/**
 * The league's logo: the league switcher, Pick'Em, chat and the Shop TV
 * show it. Every upload becomes a transparent PNG (logoCutout) and is
 * saved right away. (Accent colors are each person's own now: Account →
 * Appearance.)
 */
export function BrandingSetting({ leagueId }: { leagueId: string }) {
  const qc = useQueryClient()
  const { activeLeague, myMembership, setActiveLeague } = useAppStore()
  const league = activeLeague?.id === leagueId ? activeLeague : null
  const [logo, setLogo] = useState<string | null>(league?.brand_logo_url ?? null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const original = useRef<File | null>(null)
  const [outcome, setOutcome] = useState<CutoutResult['outcome'] | 'original' | null>(null)

  async function saveLogo(url: string | null) {
    const { error } = await supabase.from('leagues').update({ brand_logo_url: url }).eq('id', leagueId)
    if (error) throw error
    setLogo(url)
    if (activeLeague?.id === leagueId) setActiveLeague({ ...activeLeague, brand_logo_url: url }, myMembership)
    qc.invalidateQueries({ queryKey: ['my-leagues'] })
  }

  async function process(file: File, removeBackground: boolean) {
    setBusy(true)
    try {
      const res = await makeLogoPng(file, removeBackground)
      const path = `${leagueId}/logo-${Date.now()}.png`
      const { error } = await supabase.storage.from('league-logos').upload(path, res.blob, { contentType: 'image/png' })
      if (error) throw error
      await saveLogo(supabase.storage.from('league-logos').getPublicUrl(path).data.publicUrl)
      setOutcome(removeBackground ? res.outcome : 'original')
    } catch (err) {
      toast.error(`Couldn't save the logo: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Choose an image file'); return }
    if (file.size > 10 * 1024 * 1024) { toast.error('Keep the logo under 10MB'); return }
    original.current = file
    await process(file, true)
  }

  async function remove() {
    setBusy(true)
    try {
      await saveLogo(null)
      setOutcome(null)
      original.current = null
    } catch (err) {
      toast.error(`Couldn't remove it: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-field-700 bg-field-900/50 p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-gold/10 border border-gold/30 flex items-center justify-center shrink-0">
          <ImageIcon className="w-4 h-4 text-gold" />
        </div>
        <div className="min-w-0">
          <h3 className="font-cond font-bold text-white tracking-wide text-base">League logo</h3>
          <p className="text-field-400 text-sm">
            Shows in the league switcher, Pick&apos;Em, chat and on the Shop TV. Everyone picks their own
            accent color on their Account page.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* On a checkerboard, so you can see what's transparent */}
        <div
          className="w-20 h-20 rounded-xl border border-field-700 flex items-center justify-center overflow-hidden shrink-0"
          style={{ background: 'repeating-conic-gradient(#2a2a2a 0% 25%, #1a1a1a 0% 50%) 50% / 14px 14px' }}
        >
          {busy
            ? <Loader2 className="w-5 h-5 animate-spin text-field-400" />
            : logo
            ? <img src={logo} alt="League logo" className="w-full h-full object-contain" />
            : <span className="text-field-500 text-xs text-center px-2">No logo</span>}
        </div>
        <div className="flex flex-wrap gap-2 min-w-0">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={upload} />
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="btn-ghost !py-1.5 !px-3 !text-xs">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {busy ? 'Working on it…' : logo ? 'Change logo' : 'Upload a logo'}
          </button>
          {logo && !busy && (
            <button onClick={remove} className="btn-ghost !py-1.5 !px-3 !text-xs">
              <X className="w-3.5 h-3.5" /> Remove
            </button>
          )}
          <p className="w-full text-[11px] text-field-500 leading-snug">
            {outcome === 'removed' ? (
              <>
                Background removed and saved as a transparent PNG.{' '}
                {original.current && (
                  <button onClick={() => process(original.current!, false)} className="font-bold text-gold hover:underline">Use the original instead</button>
                )}
              </>
            ) : outcome === 'already' ? 'Already transparent, saved as a PNG.'
              : outcome === 'kept' ? "No plain background to remove, so it's kept as is (saved as a PNG)."
              : outcome === 'original' ? 'Using your original, background and all.'
              : 'Any image works: the background is taken out automatically and it becomes a transparent PNG. Saved as soon as it uploads.'}
          </p>
        </div>
      </div>
    </div>
  )
}
