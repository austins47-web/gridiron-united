import { useState, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import {
  X, Share, PlusSquare, Bell, Zap, Radio, Download, MoreHorizontal, MoreVertical,
  Check, Copy, Smartphone, ChevronRight,
} from 'lucide-react'
import clsx from 'clsx'
import { ModalPortal } from '@/components/ui/ModalPortal'
import { promptInstall, isMobileDevice } from '@/lib/install'
import { useInstallPlatform } from '@/hooks/useInstallPlatform'

// ══════════════════════════════════════════════════════════════
// Getting Gridiron onto the home screen
//
// The home-screen app opens full-screen and — on iPhone — is the only
// way to get notifications at all. InstallCard nudges phone users from
// Home; InstallGuide is the step-by-step, written for whichever browser
// they're in (lib/install.ts works that out).
// ══════════════════════════════════════════════════════════════

const DISMISS_KEY = 'gu-install-card-dismissed'
const DISMISS_DAYS = 21

/** Home's "Get the app" strip — phones only, until installed or dismissed. */
export function InstallCard() {
  const platform = useInstallPlatform()
  const [open, setOpen] = useState(false)
  const [hidden, setHidden] = useState(() => {
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY))
      return !!at && Date.now() - at < DISMISS_DAYS * 86_400_000
    } catch { return false }
  })
  if (hidden || platform === 'installed' || !isMobileDevice()) return null

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* private mode */ }
    setHidden(true)
  }
  const install = async () => {
    if (platform === 'prompt') {
      if (await promptInstall()) toast.success('Installed — open Gridiron from your home screen')
    } else {
      setOpen(true)
    }
  }

  return (
    <>
      <div className="rise-in relative flex items-center gap-3 rounded-xl border border-gold/30 bg-gradient-to-r from-gold/[0.12] via-field-800 to-field-800 p-3 pr-2">
        <img src="/icons/icon-192.png" alt="" className="w-11 h-11 rounded-[11px] shadow-lg shadow-black/40 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-cond font-black uppercase tracking-wide text-white text-[15px] leading-tight">
            Get the Gridiron app
          </div>
          <div className="text-[12px] text-field-300 leading-snug">
            Pick reminders, your results and live alerts on your phone
          </div>
        </div>
        <button onClick={install} className="btn-gold !px-3 !py-1.5 !text-xs shrink-0">
          {platform === 'prompt' ? <><Download className="w-3.5 h-3.5" /> Install</> : 'Show me'}
        </button>
        <button onClick={dismiss} aria-label="Not now" className="p-1.5 text-field-500 hover:text-white shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
      {open && <InstallGuide onClose={() => setOpen(false)} />}
    </>
  )
}

// ── The guide ─────────────────────────────────────────────────

export function InstallGuide({ onClose }: { onClose: () => void }) {
  const platform = useInstallPlatform()

  return (
    <ModalPortal onClose={onClose}>
      <div className="modal-box modal-sm !p-0" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="relative px-5 pt-5 pb-4 border-b border-field-700 bg-gradient-to-b from-gold/[0.10] to-transparent">
          <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 p-1.5 text-field-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <img src="/icons/icon-192.png" alt="" className="w-12 h-12 rounded-xl shadow-lg shadow-black/40" />
            <div>
              <div className="font-cond font-bold text-[11px] uppercase tracking-[0.2em] text-gold">Home screen app</div>
              <h2 className="font-cond font-black uppercase text-white text-2xl leading-none mt-0.5">Get Gridiron</h2>
            </div>
          </div>
          <ul className="mt-4 space-y-1.5 text-[13px] text-field-200">
            <Perk icon={<Bell className="w-3.5 h-3.5" />}>Reminders before picks lock, and your result the moment a week ends</Perk>
            <Perk icon={<Radio className="w-3.5 h-3.5" />}>Live alerts when you take the lead or clinch</Perk>
            <Perk icon={<Zap className="w-3.5 h-3.5" />}>Opens full screen in one tap, like any other app</Perk>
          </ul>
        </div>

        <div className="px-5 py-4">
          {platform === 'installed' && (
            <div className="flex items-center gap-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3">
              <Check className="w-5 h-5 text-emerald-400 shrink-0" />
              <p className="text-sm text-field-100">You&apos;re all set — Gridiron is on this device. Turn on notifications in your league&apos;s Settings.</p>
            </div>
          )}

          {platform === 'prompt' && (
            <div className="space-y-3">
              <p className="text-sm text-field-300">Your browser can add it in one tap.</p>
              <button
                onClick={async () => { if (await promptInstall()) { toast.success('Installed — open Gridiron from your home screen'); onClose() } }}
                className="btn-gold w-full justify-center !py-3"
              >
                <Download className="w-4 h-4" /> Install Gridiron
              </button>
            </div>
          )}

          {platform === 'ios-safari' && (
            <Steps>
              <Step n={1} title={<>Tap <b>Share</b></>} note="At the bottom of Safari. On iOS 26, tap ••• first, then Share.">
                <MockToolbar />
              </Step>
              <Step n={2} title={<>Tap <b>Add to Home Screen</b></>} note="Scroll down the list — or tap View More — if you don't see it.">
                <MockMenuRow icon={<PlusSquare className="w-4 h-4" />} label="Add to Home Screen" />
              </Step>
              <Step n={3} title={<>Tap <b>Add</b></>} note="Leave “Open as Web App” switched on.">
                <MockAddBar />
              </Step>
              <Step n={4} title={<>Open <b>Gridiron</b> from your home screen</>} last>
                <MockHomeIcon />
              </Step>
            </Steps>
          )}

          {platform === 'ios-other' && (
            <Steps>
              <Step n={1} title={<>Tap <b>Share</b></>} note="In the address bar at the top (Chrome, Edge) or the ≡ menu (Firefox).">
                <div className="inline-flex items-center gap-2 rounded-lg bg-field-900 border border-field-700 px-3 py-2 text-xs text-field-300">
                  gridironunited.app <Share className="w-4 h-4 text-gold" />
                </div>
              </Step>
              <Step n={2} title={<>Tap <b>Add to Home Screen</b></>} note="Scroll down the list if you don't see it.">
                <MockMenuRow icon={<PlusSquare className="w-4 h-4" />} label="Add to Home Screen" />
              </Step>
              <Step n={3} title={<>Tap <b>Add</b>, then open Gridiron from your home screen</>} last>
                <MockHomeIcon />
              </Step>
            </Steps>
          )}

          {platform === 'android-manual' && (
            <Steps>
              <Step n={1} title={<>Tap the <b>menu</b></>} note="The ⋮ in the top-right corner of the browser.">
                <div className="inline-flex items-center gap-2 rounded-lg bg-field-900 border border-field-700 px-3 py-2 text-xs text-field-300">
                  gridironunited.app <MoreVertical className="w-4 h-4 text-gold" />
                </div>
              </Step>
              <Step n={2} title={<>Tap <b>Install app</b> or <b>Add to Home screen</b></>}>
                <MockMenuRow icon={<Smartphone className="w-4 h-4" />} label="Install app" />
              </Step>
              <Step n={3} title={<>Tap <b>Install</b>, then open Gridiron from your home screen</>} last>
                <MockHomeIcon />
              </Step>
            </Steps>
          )}

          {platform === 'in-app' && <InAppBrowser />}

          {platform === 'desktop' && (
            <div className="space-y-3 text-sm text-field-300">
              <p>
                Gridiron works best as an app on your <b className="text-white">phone</b>: open{' '}
                <b className="text-gold">gridironunited.app</b> there and this guide will show you how.
              </p>
              <p className="text-field-400 text-[13px]">
                On this computer: in Chrome or Edge, click the install icon at the right end of the
                address bar. In Safari on a Mac, choose File → Add to Dock.
              </p>
            </div>
          )}
        </div>
      </div>
    </ModalPortal>
  )
}

function Perk({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 w-5 h-5 rounded-md bg-gold/15 text-gold flex items-center justify-center shrink-0">{icon}</span>
      <span className="leading-snug">{children}</span>
    </li>
  )
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="space-y-0">{children}</ol>
}

function Step({ n, title, note, children, last = false }: {
  n: number; title: ReactNode; note?: string; children?: ReactNode; last?: boolean
}) {
  return (
    <li className="relative flex gap-3 pb-4">
      {/* The rail between numbers */}
      {!last && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-field-700" />}
      <span className="w-7 h-7 rounded-full bg-gold text-field-950 font-cond font-black text-sm flex items-center justify-center shrink-0 relative">
        {n}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="text-sm text-white [&_b]:text-gold [&_b]:font-bold">{title}</div>
        {note && <div className="text-[12px] text-field-400 mt-0.5 leading-snug">{note}</div>}
        {children && <div className="mt-2">{children}</div>}
      </div>
    </li>
  )
}

// ── Little pictures of what they'll see ───────────────────────

function MockToolbar() {
  return (
    <div className="inline-flex items-center gap-4 rounded-full bg-field-900 border border-field-700 px-4 py-2 text-field-400">
      <ChevronRight className="w-4 h-4 rotate-180" />
      <span className="text-[11px] truncate max-w-[110px]">gridironunited.app</span>
      <span className="relative text-gold">
        <Share className="w-4 h-4" />
        <span className="absolute -inset-1.5 rounded-full ring-2 ring-gold/60 animate-pulse" />
      </span>
      <MoreHorizontal className="w-4 h-4" />
    </div>
  )
}

function MockMenuRow({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-field-900 border border-gold/40 px-3 py-2 text-[13px] text-white max-w-[240px]">
      {label} <span className="text-gold">{icon}</span>
    </div>
  )
}

function MockAddBar() {
  return (
    <div className="rounded-lg bg-field-900 border border-field-700 max-w-[240px] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 text-[12px] border-b border-field-700">
        <span className="text-field-400">Cancel</span>
        <span className="text-white font-semibold">Add to Home Screen</span>
        <span className="text-gold font-bold rounded px-1 ring-2 ring-gold/60">Add</span>
      </div>
      <div className="flex items-center justify-between px-3 py-2 text-[12px] text-field-300">
        Open as Web App
        <span className="w-8 h-[18px] rounded-full bg-emerald-500 relative">
          <span className="absolute right-0.5 top-0.5 w-[14px] h-[14px] rounded-full bg-white" />
        </span>
      </div>
    </div>
  )
}

function MockHomeIcon() {
  return (
    <div className="inline-flex flex-col items-center gap-1">
      <img src="/icons/icon-192.png" alt="" className="w-12 h-12 rounded-[12px] shadow-lg shadow-black/40" />
      <span className="text-[10px] text-field-300">Gridiron</span>
    </div>
  )
}

function InAppBrowser() {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin + '/app')
      setCopied(true)
    } catch { toast.error("Couldn't copy — open the menu and choose Open in browser") }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-field-300">
        This in-app browser can&apos;t add apps to your home screen. Open Gridiron in{' '}
        <b className="text-white">Safari</b> (iPhone) or <b className="text-white">Chrome</b> (Android) first:
        tap the <MoreHorizontal className="w-4 h-4 inline -mt-0.5 text-gold" /> menu and choose{' '}
        <b className="text-gold">Open in browser</b>.
      </p>
      <button onClick={copy} className={clsx('btn-ghost w-full justify-center !py-2.5', copied && '!border-emerald-500/50 !text-emerald-400')}>
        {copied ? <><Check className="w-3.5 h-3.5" /> Link copied — paste it in Safari</> : <><Copy className="w-3.5 h-3.5" /> Copy the link instead</>}
      </button>
    </div>
  )
}
