import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Tv, Copy, ExternalLink, RotateCcw, Loader2, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '@/store/appStore'
import { DEFAULT_GOLD } from '@/lib/brand'
import { ColorPicker } from '@/components/settings/ColorPicker'
import { HOLIDAY_CHOICES } from '@/lib/holiday'
import clsx from 'clsx'

/**
 * Shop TV: the league's live board on a TV, at /tv/<code>. The code is
 * the key (a TV can't sign in); resetting it turns the old one off. The
 * TV has its own accent color (leagues.brand_color), separate from the one
 * each person picks for themselves.
 */
export function ShopTvSetting({ leagueId }: { leagueId: string }) {
  const [code, setCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [qr, setQr] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [help, setHelp] = useState(false)

  // The TV's color: saved on the league, picked up on the TV's next refresh
  const qc = useQueryClient()
  const { activeLeague, myMembership, setActiveLeague } = useAppStore()
  const tvColor = activeLeague?.id === leagueId ? activeLeague.brand_color ?? null : null
  const [savingColor, setSavingColor] = useState(false)
  async function pickTvColor(hex: string) {
    const value = hex.toUpperCase() === DEFAULT_GOLD ? null : hex.toUpperCase()
    if (value === tvColor) return
    setSavingColor(true)
    const { error } = await supabase.from('leagues').update({ brand_color: value }).eq('id', leagueId)
    setSavingColor(false)
    if (error) { toast.error(`Couldn't save the TV color: ${error.message}`); return }
    if (activeLeague?.id === leagueId) setActiveLeague({ ...activeLeague, brand_color: value }, myMembership)
    qc.invalidateQueries({ queryKey: ['my-leagues'] })
    toast.success('TV color saved. The TV picks it up within a few minutes.')
  }

  // The holiday theme: null follows the calendar, 'off' never shows one,
  // a theme's key keeps it on (leagues.tv_theme)
  const tvTheme = activeLeague?.id === leagueId ? activeLeague.tv_theme ?? null : null
  const [savingTheme, setSavingTheme] = useState(false)
  async function pickTheme(value: string | null) {
    if (value === tvTheme) return
    setSavingTheme(true)
    const { error } = await supabase.from('leagues').update({ tv_theme: value }).eq('id', leagueId)
    setSavingTheme(false)
    if (error) { toast.error(`Couldn't save the theme: ${error.message}`); return }
    if (activeLeague?.id === leagueId) setActiveLeague({ ...activeLeague, tv_theme: value }, myMembership)
    qc.invalidateQueries({ queryKey: ['my-leagues'] })
    const label = value === null ? 'Themes follow the calendar' : value === 'off' ? 'Holiday themes off' : `${HOLIDAY_CHOICES.find(c => c.key === value)?.label} is on`
    toast.success(`${label}. The TV picks it up within a few minutes.`)
  }

  const origin = window.location.origin
  const link = code ? `${origin}/tv/${code}` : null
  const host = origin.replace(/^https?:\/\//, '')

  async function get(reset = false) {
    setBusy(true)
    const { data, error } = await supabase.rpc('league_tv_token', { p_league: leagueId, p_reset: reset })
    setBusy(false)
    setConfirmReset(false)
    if (error) { toast.error(error.message); return }
    setCode(data)
    if (reset) toast.success('New code. The old one stopped working.')
  }

  useEffect(() => {
    if (!link) { setQr(null); return }
    QRCode.toDataURL(link, { margin: 1, width: 240, color: { dark: '#0A0A0A', light: '#FFFFFF' } })
      .then(setQr).catch(() => setQr(null))
  }, [link])

  const copy = async () => {
    try { await navigator.clipboard.writeText(link!); toast.success('Link copied') }
    catch { toast.error("Couldn't copy") }
  }

  return (
    <div className="rounded-xl border border-field-700 bg-field-900/50 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-gold/10 border border-gold/30 flex items-center justify-center shrink-0">
          <Tv className="w-4 h-4 text-gold" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-cond font-bold text-white tracking-wide text-base">Shop TV</h3>
          <p className="text-field-400 text-sm">
            A full-screen live board for a TV: every game, who&apos;s riding on each one, live chances to win
            the week and the standings. No login on the TV, just this league&apos;s code.
          </p>
        </div>
      </div>

      {!code ? (
        <button onClick={() => get()} disabled={busy} className="btn-gold w-full justify-center">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Tv className="w-4 h-4" />} Get the TV code
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <p className="text-xs text-field-400 uppercase tracking-wider font-bold">On the TV, go to</p>
              <p className="font-cond font-black text-2xl text-white break-all">{host}/tv</p>
              <p className="text-xs text-field-400 uppercase tracking-wider font-bold mt-2">and enter the code</p>
              <p className="font-cond font-black text-4xl text-gold tracking-[0.2em]">{code}</p>
            </div>
            {qr && (
              <img src={qr} alt="QR code for the TV link" className="w-32 h-32 rounded-lg bg-white p-1 shrink-0" />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={copy} className="btn-ghost !py-1.5 !px-3 !text-xs"><Copy className="w-3.5 h-3.5" /> Copy link</button>
            <a href={link!} target="_blank" rel="noreferrer" className="btn-ghost !py-1.5 !px-3 !text-xs"><ExternalLink className="w-3.5 h-3.5" /> Open the board</a>
            {confirmReset ? (
              <span className="flex items-center gap-2 text-xs">
                <span className="text-field-300">Turn off the current code?</span>
                <button onClick={() => get(true)} disabled={busy} className="font-bold text-red-400 hover:text-red-300">Reset</button>
                <button onClick={() => setConfirmReset(false)} className="text-field-400 hover:text-white">Cancel</button>
              </span>
            ) : (
              <button onClick={() => setConfirmReset(true)} className="btn-ghost !py-1.5 !px-3 !text-xs"><RotateCcw className="w-3.5 h-3.5" /> Reset code</button>
            )}
          </div>
          <p className="text-[11px] text-field-500">
            Anyone with the code can see the board (names, picks after they lock, standings), not change anything.
            Reset it if it gets passed around.
          </p>

          <button onClick={() => setHelp(h => !h)} className="flex items-center gap-1 text-xs font-bold text-gold hover:text-gold-light">
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${help ? 'rotate-180' : ''}`} /> How to put it on a TV
          </button>
          {help && (
            <ol className="text-sm text-field-300 space-y-1.5 list-decimal pl-5">
              <li><span className="font-bold text-white">Smart TV or Fire TV Stick:</span> open the TV&apos;s web browser (Fire TV: the Silk browser), go to <span className="text-gold">{host}/tv</span> and type the code. It remembers it after that.</li>
              <li><span className="font-bold text-white">Chromecast or Google TV:</span> open the link in Chrome on a computer, then Chrome&apos;s menu → Cast → the TV.</li>
              <li><span className="font-bold text-white">Any TV with HDMI:</span> plug in a laptop or mini PC, open the link in a browser, and click the board once to go full screen.</li>
              <li>Turn off the TV&apos;s sleep timer or screensaver, and leave it on the board. It refreshes itself every 30 seconds during games.</li>
            </ol>
          )}
        </div>
      )}

      {/* The TV's own accent color */}
      <div className="pt-3 border-t border-field-700">
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <span className="font-cond font-bold text-sm uppercase tracking-wider text-white">TV color</span>
          {savingColor && <Loader2 className="w-3.5 h-3.5 animate-spin text-field-400" />}
        </div>
        <p className="text-field-400 text-xs mb-3">The accent on the Shop TV only. It doesn't change anyone's own color in the app.</p>
        <ColorPicker value={tvColor} onPick={pickTvColor} disabled={savingColor} idPrefix="tv-color" />
      </div>

      {/* The holiday theme */}
      <div className="pt-3 border-t border-field-700">
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <span className="font-cond font-bold text-sm uppercase tracking-wider text-white">Holiday theme</span>
          {savingTheme && <Loader2 className="w-3.5 h-3.5 animate-spin text-field-400" />}
        </div>
        <p className="text-field-400 text-xs mb-3">
          Automatic puts one up for each holiday on its own. Pick a theme to keep it on as long as you like (a whole month of
          Halloween), or turn them off. Shows on the TV and the league&apos;s banner in the app.
        </p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Holiday theme">
          {[{ key: null as string | null, label: 'Automatic', emoji: '📅' }, { key: 'off', label: 'Off', emoji: '🚫' }, ...HOLIDAY_CHOICES].map(c => {
            const on = tvTheme === c.key
            return (
              <button
                key={c.key ?? 'auto'}
                role="radio"
                aria-checked={on}
                disabled={savingTheme}
                onClick={() => pickTheme(c.key)}
                className={clsx(
                  'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors disabled:opacity-50',
                  on ? 'bg-gold text-field-950 border-gold' : 'bg-field-800 border-field-700 text-field-300 hover:border-gold/50 hover:text-gold',
                )}
              >
                <span aria-hidden>{c.emoji}</span> {c.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
