import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { roster, scoringType, totalProj } = await req.json()

    const starters = roster.filter((r: any) => !r.slot.startsWith('BN') && !r.slot.startsWith('IR'))
    const bench = roster.filter((r: any) => r.slot.startsWith('BN'))

    const userMessage = `Analyze my fantasy football roster and give me concise, actionable advice in 3-4 short paragraphs. Be specific about player names.

Starters:
${starters.map((r: any) => `${r.slot}: ${r.player.name} (${r.player.pos}, ${r.player.team}, ${r.player.league ?? ''}) — Proj: ${r.player.proj_pts?.toFixed(1) ?? 'N/A'} pts, Avg: ${r.player.avg_pts?.toFixed(1) ?? 'N/A'} pts${r.player.status !== 'active' ? ', Status: ' + r.player.status : ''}`).join('\n')}

Bench:
${bench.map((r: any) => `${r.slot}: ${r.player.name} (${r.player.pos}, ${r.player.team}) — Avg: ${r.player.avg_pts?.toFixed(1) ?? 'N/A'} pts`).join('\n')}

League scoring: ${scoringType ?? 'PPR'}
Total projected: ${totalProj?.toFixed(1) ?? 'N/A'} pts`

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: 'You are an expert fantasy football analyst for Gridiron United, a platform that combines NFL and College Football players. Give concise, actionable roster analysis. Focus on start/sit decisions, injury concerns, and waiver targets.',
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.message ?? 'Anthropic API error')

    const text = data.content?.map((b: any) => b.text).join('') ?? ''

    return new Response(JSON.stringify({ analysis: text }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
