import { useNFLNews } from '@/hooks/useLiveStats'
import { Newspaper, ExternalLink, Clock } from 'lucide-react'

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr)
  const mins = Math.floor((Date.now() - d.getTime()) / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function NewsView() {
  const { data: news, isLoading, error } = useNFLNews(30)

  if (isLoading) return (
    <div className="flex justify-center py-16">
      <div className="flex gap-1"><div className="ai-dot"/><div className="ai-dot"/><div className="ai-dot"/></div>
    </div>
  )

  if (error || !news?.length) return (
    <div className="text-center py-12 text-field-400">
      <Newspaper className="w-10 h-10 mx-auto mb-3 opacity-40"/>
      <p>No news available right now.</p>
      {!import.meta.env.VITE_SPORTSDATAIO_KEY && (
        <p className="text-xs mt-2 text-field-500">Add VITE_SPORTSDATAIO_KEY to Vercel env vars to enable live news.</p>
      )}
    </div>
  )

  return (
    <div className="space-y-3 max-w-3xl mx-auto">
      {news.map(item => (
        <article key={item.NewsID}
          className="panel hover:border-field-500 transition-colors">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {item.PlayerName && (
                  <span className="text-xs font-bold text-gold bg-gold/10 border border-gold/20 px-2 py-0.5 rounded-full">
                    {item.PlayerName}
                  </span>
                )}
                {item.Team && (
                  <span className="text-xs text-field-400 font-bold">{item.Team}</span>
                )}
                <div className="flex items-center gap-1 text-field-500 text-xs ml-auto">
                  <Clock className="w-3 h-3"/>
                  <span>{timeAgo(item.Updated)}</span>
                </div>
              </div>
              <h3 className="font-bold text-white text-sm leading-snug mb-1">
                {item.Title}
              </h3>
              <p className="text-field-300 text-xs leading-relaxed line-clamp-3">
                {item.Content}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-field-500">{item.Source || item.OriginalSource}</span>
                {item.Url && (
                  <a href={item.Url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-gold/70 hover:text-gold transition-colors ml-auto">
                    Read more <ExternalLink className="w-3 h-3"/>
                  </a>
                )}
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}
