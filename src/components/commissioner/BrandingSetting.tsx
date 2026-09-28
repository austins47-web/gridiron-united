import { useRef, useState } from 'react'
import { Palette, Upload, X, Loader2, Check } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import { BRAND_PRESETS, DEFAULT_GOLD, brandVars } from '@/lib/brand'

/**
 * League branding: a logo and an accent color. The color replaces the
 * copper across the app while this league is active, and on the Shop
 * TV; the logo shows in the league switcher, Pick'Em, chat and the TV.
 */
export function BrandingSetting({ leagueId }: { leagueId: string }) {
  const qc = useQueryClient()
  const { activeLeague, myMembership, setActiveLeague } = useAppStore()
  const league = activeLeague?.id === leagueId ? activeLeague : null
  const [logo, setLogo] = useState<string | null>(league?.brand_logo_url ?? null)
  const [color, setColor] = useState<string>(league?.brand_color ?? DEFAULT_GOLD)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const savedLogo = league?.brand_logo_url ?? null
  const savedColor = league?.brand_color ?? DEFAULT_GOLD
  const dirty = logo !== savedLogo || color.toUpperCase() !== savedColor.toUpperCase()
  const valid = /^#[0-9a-f]{6}$/i.test(color)
  const preview = brandVars(valid ? color : DEFAULT_GOLD)

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Choose an image file'); return }
    if (file.size > 3 * 1024 * 1024) { toast.error('Keep the logo under 3MB'); return }
    setUploading(true)
    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const path = `${leagueId}/logo-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('league-logos').upload(path, file, { contentType: file.type, upsert: true })
    setUploading(false)
    if (error) { toast.error(`Couldn't upload: ${error.message}`); return }
    setLogo(supabase.storage.from('league-logos').getPublicUrl(path).data.publicUrl)
  }

  async function save() {
    if (!valid) { toast.error('Colors look like #CE7B45'); return }
    setSaving(true)
    const patch = {
      brand_logo_url: logo,
      // The default copper is stored as "no color", so a later default change reaches it
      brand_color: color.toUpperCase() === DEFAULT_GOLD ? null : color.toUpperCase(),
    }
    const { error } = await supabase.from('leagues').update(patch).eq('id', leagueId)
    setSaving(false)
    if (error) { toast.error(`Couldn't save: ${error.message}`); return }
    if (activeLeague?.id === leagueId) setActiveLeague({ ...activeLeague, ...patch }, myMembership)
    qc.invalidateQueries({ queryKey: ['my-leagues'] })
    toast.success('Branding saved')
  }

  return (
    <div className="rounded-xl border border-field-700 bg-field-900/50 p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-gold/10 border border-gold/30 flex items-center justify-center shrink-0">
          <Palette className="w-4 h-4 text-gold" />
        </div>
        <div className="min-w-0">
          <h3 className="font-cond font-bold text-white tracking-wide text-base">League branding</h3>
          <p className="text-field-400 text-sm">
            Your logo and color, across the app while this league is open and on the Shop TV.
          </p>
        </div>
      </div>

      {/* Logo */}
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-xl border border-field-700 bg-field-950 flex items-center justify-center overflow-hidden shrink-0">
          {logo
            ? <img src={logo} alt="League logo" className="w-full h-full object-contain" />
            : <span className="text-field-600 text-xs text-center px-2">No logo</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={upload} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-ghost !py-1.5 !px-3 !text-xs">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {logo ? 'Change logo' : 'Upload a logo'}
          </button>
          {logo && (
            <button onClick={() => setLogo(null)} className="btn-ghost !py-1.5 !px-3 !text-xs">
              <X className="w-3.5 h-3.5" /> Remove
            </button>
          )}
          <p className="w-full text-[11px] text-field-500">PNG with a transparent background looks best. Under 3MB.</p>
        </div>
      </div>

      {/* Color */}
      <div>
        <p className="label">Accent color</p>
        <div className="flex flex-wrap items-center gap-2">
          {BRAND_PRESETS.map(p => (
            <button
              key={p.hex}
              onClick={() => setColor(p.hex)}
              title={p.name}
              aria-label={p.name}
              className={clsx(
                'w-8 h-8 rounded-full border-2 flex items-center justify-center transition-transform hover:scale-110',
                color.toUpperCase() === p.hex ? 'border-white' : 'border-transparent',
              )}
              style={{ background: p.hex }}
            >
              {color.toUpperCase() === p.hex && <Check className="w-4 h-4 text-white drop-shadow" />}
            </button>
          ))}
          <label className="flex items-center gap-2 ml-1">
            <input
              id="brand-color-picker"
              type="color"
              value={valid ? color : DEFAULT_GOLD}
              onChange={e => setColor(e.target.value.toUpperCase())}
              className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 p-0"
              aria-label="Any color"
            />
            <input
              id="brand-color-hex"
              value={color}
              onChange={e => setColor(e.target.value.trim().slice(0, 7))}
              className="input !w-28 !py-1.5 font-mono text-sm uppercase"
              aria-label="Color hex code"
            />
          </label>
        </div>
      </div>

      {/* Preview, with the color adjusted the way the app will use it */}
      <div
        className="rounded-lg border border-field-700 bg-field-950 p-3 flex items-center gap-3"
        style={preview as React.CSSProperties | undefined}
      >
        {logo && <img src={logo} alt="" className="w-8 h-8 object-contain" />}
        <span className="font-cond font-black uppercase text-white">{league?.name ?? 'Your league'}</span>
        <span className="ml-auto text-xs font-bold uppercase tracking-wider text-gold bg-gold/15 border border-gold/40 rounded px-2 py-0.5">Preview</span>
        <span className="btn-gold !py-1 !px-2.5 !text-xs">Button</span>
      </div>

      <button onClick={save} disabled={!dirty || saving || !valid} className="btn-gold w-full justify-center disabled:opacity-40">
        {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save branding
      </button>
    </div>
  )
}
