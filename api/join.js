// /join/:code (rewritten here by vercel.json) — the normal app page, but
// with the link-preview tags filled in for that league, so an invite
// texted or posted anywhere shows "Join Watts Upfitting on Gridiron
// United" with a picture of the invite (api/og) instead of the generic
// site card. The app itself loads exactly as before.
import { invitePreview, inviteSummary } from './_invite.js'

export const config = { runtime: 'edge' }

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

/** Replaces a <meta property|name="key" content="…"> value, if present. */
function setMeta(html, key, value) {
  const re = new RegExp(`(<meta\\s+(?:property|name)="${key}"\\s+content=")[^"]*(")`)
  return html.replace(re, `$1${esc(value)}$2`)
}

export default async function handler(req) {
  const url = new URL(req.url)
  const code = (url.searchParams.get('code') ?? '').toUpperCase()
  const origin = url.origin

  const [page, league] = await Promise.all([
    fetch(`${origin}/index.html`).then((r) => (r.ok ? r.text() : null)).catch(() => null),
    invitePreview(code),
  ])
  if (!page) {
    return new Response('Gridiron United is having trouble loading — try the link again in a moment.', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '5' },
    })
  }

  let html = page
  if (league) {
    const title = `Join ${league.name} on Gridiron United`
    const description = `${inviteSummary(league)}. ${
      league.league_type === 'pickem'
        ? 'Pick every NFL game each week — tap to join.'
        : 'Tap to join the league.'
    }`
    const image = `${origin}/api/og?code=${encodeURIComponent(code)}`
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    for (const [k, v] of [
      ['description', description],
      ['og:title', title], ['og:description', description],
      ['og:image', image], ['og:url', `${origin}/join/${code}`],
      ['twitter:title', title], ['twitter:description', description], ['twitter:image', image],
    ]) html = setMeta(html, k, v)
  }

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600',
    },
  })
}
