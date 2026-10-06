import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { MapPin, Search, Loader2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'

interface Place { name: string; lat: number; lon: number }

/**
 * The shop's town, for the weather in the Shop TV's header
 * (leagues.tv_location). Found with Open-Meteo's place search; the TV
 * asks Open-Meteo for the weather there itself.
 */
export function TvLocationSetting({ leagueId }: { leagueId: string }) {
  const qc = useQueryClient()
  const { activeLeague, myMembership, setActiveLeague } = useAppStore()
  const current = activeLeague?.id === leagueId ? activeLeague.tv_location ?? null : null
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[] | null>(null)
  const [busy, setBusy] = useState(false)

  const search = async (e: FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    setBusy(true)
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=6&language=en&format=json`)
      const d = await r.json()
      setResults((d.results ?? []).map((p: any) => ({
        name: [p.name, p.admin1, p.country_code !== 'US' ? p.country : null].filter(Boolean).join(', '),
        lat: p.latitude,
        lon: p.longitude,
      })))
    } catch {
      toast.error("Couldn't search for that town")
    }
    setBusy(false)
  }

  const save = async (place: Place | null) => {
    setBusy(true)
    const { error } = await supabase.from('leagues').update({ tv_location: place }).eq('id', leagueId)
    setBusy(false)
    if (error) { toast.error(`Couldn't save: ${error.message}`); return }
    if (activeLeague?.id === leagueId) setActiveLeague({ ...activeLeague, tv_location: place }, myMembership)
    qc.invalidateQueries({ queryKey: ['my-leagues'] })
    setResults(null)
    setQuery('')
    toast.success(place ? `The TV shows the weather in ${place.name}` : 'Weather removed from the TV')
  }

  return (
    <div className="pt-3 border-t border-field-700">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="flex items-center gap-1.5 font-cond font-bold text-sm uppercase tracking-wider text-white">
          <MapPin className="w-3.5 h-3.5 text-gold" /> Shop weather
        </span>
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-field-400" />}
      </div>
      <p className="text-field-400 text-xs mb-3">The TV’s header shows the weather outside the shop, next to the clock.</p>
      {current && !results && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-field-700 bg-field-800/60 px-3 py-2 mb-2">
          <span className="text-sm text-field-200 truncate">📍 {current.name}</span>
          <button onClick={() => save(null)} disabled={busy} className="text-xs font-bold text-field-400 hover:text-white shrink-0">Remove</button>
        </div>
      )}
      <form onSubmit={search} className="flex items-center gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={current ? 'Change the town' : 'Town or city'}
          aria-label="The shop's town"
          className="input flex-1 min-w-0 !py-2 !text-sm"
        />
        <button type="submit" disabled={!query.trim() || busy} aria-label="Search" className="shrink-0 w-9 h-9 rounded-lg bg-gold text-field-950 flex items-center justify-center disabled:opacity-40">
          <Search className="w-4 h-4" />
        </button>
      </form>
      {results && (
        <div className="mt-2 rounded-xl border border-field-700 bg-field-900/60 p-1">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-field-500">{results.length ? 'Pick the right one' : 'No towns found'}</span>
            <button onClick={() => setResults(null)} aria-label="Close" className="p-1 text-field-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
          </div>
          {results.map(p => (
            <button key={`${p.lat},${p.lon}`} onClick={() => save(p)} disabled={busy} className="w-full text-left rounded-lg px-2 py-1.5 text-sm text-field-200 hover:bg-field-800">
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
