import { useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { X, Download, Loader2 } from 'lucide-react'
import { ModalPortal } from './ModalPortal'
import { useMyRoster } from '@/hooks/useRoster'
import { useAppStore } from '@/store/appStore'
import toast from 'react-hot-toast'

/**
 * A shareable, downloadable poster for a team — built to be
 * screenshotted and posted outside the app entirely. Real roster
 * mix (this app's actual differentiator: NFL + CFB on one roster),
 * not placeholder numbers.
 */
export function FranchiseCard({ league, membership, onClose }: {
  league: { id: string; name: string }
  membership: { team_name?: string | null; wins?: number; losses?: number } | null
  onClose: () => void
}) {
  const { profile } = useAppStore()
  const { data: roster = [] } = useMyRoster(league.id)
  const cardRef = useRef<HTMLDivElement>(null)
  const [downloading, setDownloading] = useState(false)

  const nflCount = roster.filter(r => r.player?.league === 'NFL').length
  const cfbCount = roster.filter(r => r.player?.league === 'CFB').length
  const teamName = membership?.team_name || 'My Team'
  const record = (membership?.wins != null && membership?.losses != null)
    ? `${membership.wins}-${membership.losses}` : null

  async function download() {
    if (!cardRef.current) return
    setDownloading(true)
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#0A0A0A',
        scale: 2, // sharper output for sharing/screenshots
        useCORS: true, // player headshots + avatars are cross-origin
      })
      const link = document.createElement('a')
      link.download = `${teamName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-franchise-card.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (e: any) {
      toast.error('Could not generate the image: ' + e.message)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <ModalPortal onClose={onClose}>
      <div className="modal-box w-full max-w-md !p-0" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-field-700">
          <span className="font-cond font-black text-sm uppercase tracking-wider text-white">Franchise Card</span>
          <button onClick={onClose} className="text-field-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          {/* ── The actual card being captured ── */}
          <div ref={cardRef} style={{
            position: 'relative', overflow: 'hidden', borderRadius: 16,
            background: 'linear-gradient(180deg,#1C1C1C 0%,#0A0A0A 100%)',
            border: '1px solid #262626', padding: '28px 24px',
          }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 3,
              background: 'linear-gradient(90deg, transparent 0%, #CE7B45 15%, #DE9163 50%, #CE7B45 85%, transparent 100%)',
            }} />
            <div style={{
              fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 10,
              letterSpacing: '.3em', textTransform: 'uppercase', color: '#CE7B45', marginBottom: 6,
            }}>
              {league.name}
            </div>
            <div style={{
              fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, fontSize: 30,
              textTransform: 'uppercase', color: '#fff', lineHeight: 1.05, marginBottom: 4,
            }}>
              {teamName}
            </div>
            <div style={{
              fontFamily: "'Barlow', sans-serif", fontSize: 13, color: '#666666', marginBottom: 20,
            }}>
              {profile?.display_name || profile?.username}{record ? ` · ${record}` : ''}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{
                flex: 1, background: 'rgba(90,169,255,.08)', border: '1px solid rgba(90,169,255,.3)',
                borderRadius: 12, padding: '14px 12px', textAlign: 'center',
              }}>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, fontSize: 28, color: '#5AA9FF' }}>{nflCount}</div>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: '#666666', marginTop: 2 }}>NFL</div>
              </div>
              <div style={{
                flex: 1, background: 'rgba(240,200,70,.08)', border: '1px solid rgba(240,200,70,.3)',
                borderRadius: 12, padding: '14px 12px', textAlign: 'center',
              }}>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, fontSize: 28, color: '#F0C846' }}>{cfbCount}</div>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: '#666666', marginTop: 2 }}>CFB</div>
              </div>
            </div>

            <div style={{
              marginTop: 18, paddingTop: 14, borderTop: '1px solid #262626',
              fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 10,
              letterSpacing: '.2em', textTransform: 'uppercase', color: '#4A4A4A', textAlign: 'center',
            }}>
              Gridiron United · NFL + College. One Roster.
            </div>
          </div>

          <button
            onClick={download}
            disabled={downloading}
            className="btn-gold w-full mt-4"
          >
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {downloading ? 'Generating…' : 'Download Image'}
          </button>
        </div>
      </div>
    </ModalPortal>
  )
}
