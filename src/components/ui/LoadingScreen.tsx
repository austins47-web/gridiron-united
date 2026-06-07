export function LoadingScreen() {
  return (
    <div className="min-h-screen bg-field-900 flex flex-col items-center justify-center gap-4"
      style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent 0, transparent calc(10% - 1px), rgba(245,197,24,.025) calc(10% - 1px), rgba(245,197,24,.025) 10%)' }}>
      <div className="font-cond font-black text-3xl uppercase tracking-wider text-gold">
        Gridiron <span className="text-gray-100 font-normal">United</span>
      </div>
      <div className="flex gap-1.5">
        <div className="ai-dot" />
        <div className="ai-dot" />
        <div className="ai-dot" />
      </div>
    </div>
  )
}
