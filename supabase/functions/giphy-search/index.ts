// supabase/functions/giphy-search/index.ts
//
// Proxies GIPHY searches so the API key stays server-side — same
// reasoning as every other external API in this app (sportsdata,
// sync-odds): never ship a third-party key in the client bundle.
//
// Query params:
//   ?q=<query>     search term. Omit (or leave empty) for trending.
//   ?limit=N       default 24, max 50.
//
// Requires the GIPHY_API_KEY secret:
//   npx supabase secrets set GIPHY_API_KEY=your_key --project-ref sxktvztljzxcmhezphsq
// Free key: https://developers.giphy.com/dashboard/ (instant, no
// approval wait, generous free tier).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// CORS: this was missing Access-Control-Allow-Headers entirely,
// which only breaks in a REAL browser — the client sends custom
// Authorization/apikey headers, which triggers a preflight OPTIONS
// check, and without explicitly allowing those header names the
// browser blocks the real request even with Origin: *. Every
// PowerShell test of this endpoint passed regardless, since CORS
// preflight is a browser-only mechanism — curl/Invoke-WebRequest
// never enforce it, so this class of bug is invisible to that kind
// of testing no matter how many times it's run. Matched to
// sportsdata's exact working header set instead of guessing.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const apiKey = Deno.env.get('GIPHY_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GIPHY_API_KEY not set' }), { status: 500, headers: CORS })
  }

  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim() ?? ''
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 24), 50)

  const endpoint = q
    ? `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(q)}&limit=${limit}&rating=pg-13`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=${limit}&rating=pg-13`

  try {
    const res = await fetch(endpoint)
    if (!res.ok) {
      const body = await res.text()
      return new Response(JSON.stringify({ error: `GIPHY ${res.status}: ${body}` }), { status: 502, headers: CORS })
    }
    const data = await res.json()

    // Trim GIPHY's fairly large payload down to just what the picker
    // needs — a preview-sized image for the grid and the same size
    // for what actually gets sent (fixed_height is plenty for a
    // chat bubble; no need to ship "original" full-res GIFs).
    const gifs = (data.data ?? []).map((g: any) => ({
      id: g.id,
      title: g.title ?? '',
      url: g.images?.fixed_height?.url ?? g.images?.original?.url,
      width: Number(g.images?.fixed_height?.width ?? 0),
      height: Number(g.images?.fixed_height?.height ?? 0),
    })).filter((g: any) => g.url)

    return new Response(JSON.stringify({ ok: true, gifs }), { headers: CORS })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS })
  }
})
