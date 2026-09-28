import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Tv, Copy, ExternalLink, RotateCcw, Loader2, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'

/**
 * Shop TV: the league's live board on a TV, at /tv/<code>. The code is
 * the key (a TV can't sign in); resetting it turns the old one off.
 */
export function ShopTvSetting({ leagueId }: { leagueId: string }) {
  const [code, setCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [qr, setQr] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [help, setHelp] = useState(false)

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
              <li>Turn off the TV&apos;s sleep timer or screensaver, and leave it on the board. It refreshes itself every 15 seconds during games.</li>
            </ol>
          )}
        </div>
      )}
    </div>
  )
}
