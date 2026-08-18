import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { X, Download, QrCode } from 'lucide-react'

interface Props {
  leagueName: string
  inviteCode: string
  onClose: () => void
}

export function QRModal({ leagueName, inviteCode, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [url] = useState(() => `https://gridiron-united.vercel.app/join/${inviteCode}`)

  useEffect(() => {
    if (!canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, url, {
      width: 280,
      margin: 2,
      color: { dark: '#ffffff', light: '#161b27' },
    })
  }, [url])

  function download() {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `${leagueName.replace(/\s+/g, '-')}-invite.png`
    link.href = canvas.toDataURL()
    link.click()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-sm text-center" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-gold" />
            <h2 className="font-cond font-black text-lg text-white uppercase tracking-wider">
              Invite QR Code
            </h2>
          </div>
          <button onClick={onClose} className="text-field-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-field-400 text-sm mb-4">
          Scan to join <span className="text-white font-bold">{leagueName}</span>
        </p>

        {/* QR code canvas — dark bg matches app */}
        <div className="flex justify-center mb-4">
          <div className="rounded-xl overflow-hidden border-2 border-field-600 inline-block bg-field-800">
            <canvas ref={canvasRef} />
          </div>
        </div>

        {/* Invite code + URL */}
        <div className="bg-field-900 border border-field-700 rounded-xl px-4 py-3 mb-4 space-y-1">
          <p className="text-xs text-field-400 uppercase tracking-wider font-bold">Invite Code</p>
          <p className="text-gold font-mono font-black text-2xl tracking-widest">{inviteCode}</p>
          <p className="text-field-600 text-xs break-all">{url}</p>
        </div>

        <button onClick={download} className="btn-gold w-full">
          <Download className="w-4 h-4" /> Download QR Code
        </button>
      </div>
    </div>
  )
}
