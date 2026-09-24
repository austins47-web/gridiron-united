// /api/og?code=XXXX — the picture shown when an invite link is shared
// (iMessage, WhatsApp, Discord, Slack…): the league's name big and
// bold on the app's dark field with its format, member count and
// commissioner. 1200×630, cached at the edge.
import { ImageResponse } from '@vercel/og'
import { invitePreview } from './_invite.js'

export const config = { runtime: 'edge' }

const GOLD = '#CE7B45'

// Barlow Condensed, the app's display face — shipped with the function
// (api/fonts, SIL Open Font License) rather than fetched from Google
// Fonts, whose response depends on the requester.
let fontsPromise
function loadFonts() {
  fontsPromise ??= Promise.all([600, 800, 900].map(async (weight) => ({
    name: 'Barlow Condensed',
    data: await fetch(new URL(`./fonts/BarlowCondensed-${weight}.ttf`, import.meta.url)).then((r) => r.arrayBuffer()),
    weight,
    style: 'normal',
  }))).catch(() => (fontsPromise = undefined, []))
  return fontsPromise
}

/** Tiny element builder (no JSX build step for these functions). */
const h = (type, style, ...children) => ({
  type,
  props: { style, children: children.length <= 1 ? children[0] : children },
})
const img = (src, style) => ({ type: 'img', props: { src, style } })

export default async function handler(req) {
  const url = new URL(req.url)
  const code = (url.searchParams.get('code') ?? '').toUpperCase()
  const [league, fonts] = await Promise.all([invitePreview(code), loadFonts()])
  const icon = `${url.origin}/icons/icon-192.png`

  const name = league?.name ?? 'Gridiron United'
  const nameSize = name.length > 26 ? 84 : name.length > 18 ? 104 : 128
  const pickem = league?.league_type === 'pickem'
  const pills = league
    ? [
        [pickem ? "PICK'EM LEAGUE" : 'FANTASY LEAGUE', true],
        [`${league.member_count} MEMBER${league.member_count === 1 ? '' : 'S'}`, false],
        ...(league.commissioner ? [[`COMMISSIONER ${String(league.commissioner).toUpperCase()}`, false]] : []),
      ]
    : [["PICK'EM + FANTASY FOOTBALL", true]]

  const pill = ([text, filled]) => h('div', {
    display: 'flex', fontSize: 28, fontWeight: 800, letterSpacing: 2,
    padding: '10px 22px', borderRadius: 999, marginRight: 16,
    background: filled ? GOLD : 'rgba(255,255,255,0.06)',
    color: filled ? '#0A0A0A' : '#E5E7EB',
    border: filled ? `2px solid ${GOLD}` : '2px solid rgba(255,255,255,0.18)',
  }, text)

  const tree = h('div', {
    width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
    background: '#0A0A0A', color: '#fff', fontFamily: 'Barlow Condensed', position: 'relative',
    backgroundImage: 'radial-gradient(circle at 85% 110%, rgba(206,123,69,0.35) 0%, rgba(206,123,69,0) 55%), repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 2px, transparent 2px, transparent 120px)',
  },
    // Gold bar across the top
    h('div', { display: 'flex', height: 10, width: '100%', background: `linear-gradient(90deg, ${GOLD}, #F0C846, ${GOLD})` }),
    h('div', { display: 'flex', flexDirection: 'column', flex: 1, padding: '48px 72px 56px' },
      // Brand
      h('div', { display: 'flex', alignItems: 'center' },
        img(icon, { width: 72, height: 72, borderRadius: 16, marginRight: 22 }),
        h('div', { display: 'flex', fontSize: 40, fontWeight: 900, letterSpacing: 6 },
          h('span', { color: GOLD }, 'GRIDIRON'),
          h('span', { color: '#fff', marginLeft: 14 }, 'UNITED'),
        ),
      ),
      // The invite
      h('div', { display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' },
        h('div', { display: 'flex', fontSize: 34, fontWeight: 800, letterSpacing: 8, color: GOLD }, league ? "YOU'RE INVITED TO JOIN" : 'THE LEAGUE IS WAITING'),
        h('div', {
          display: 'flex', fontSize: nameSize, fontWeight: 900, lineHeight: 0.95, marginTop: 10,
          textTransform: 'uppercase', letterSpacing: -1, maxWidth: 1056,
        }, name),
        h('div', { display: 'flex', marginTop: 30 }, ...pills.map(pill)),
      ),
      // Footer
      h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
        h('div', { display: 'flex', fontSize: 30, fontWeight: 600, color: '#9CA3AF' },
          pickem ? 'Pick every NFL game. Beat your friends.' : 'Football with your friends, all season long.'),
        h('div', {
          display: 'flex', fontSize: 30, fontWeight: 900, letterSpacing: 3, color: '#0A0A0A',
          background: GOLD, padding: '12px 28px', borderRadius: 14,
        }, 'TAP TO JOIN →'),
      ),
    ),
  )

  // Rendered up front (not streamed) so a failure falls back to a
  // plainer card instead of an empty image; x-og-render says which ran
  const attempts = [
    ['full', tree, fonts],
    ['default-font', tree, []],
  ]
  for (const [label, t, f] of attempts) {
    try {
      const res = new ImageResponse(t, { width: 1200, height: 630, fonts: f.length ? f : undefined })
      const png = await res.arrayBuffer()
      if (png.byteLength > 0) {
        return new Response(png, {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
            'x-og-render': label,
          },
        })
      }
    } catch (e) {
      console.error('og render failed', label, e)
    }
  }
  return Response.redirect(new URL('/og-image.png', url.origin), 302)
}
