// Shared by api/join.js and api/og.js: what an invite link may show
// about its league, from the league_invite_preview database function
// (name, format, member count, commissioner — nothing private).

export async function invitePreview(code) {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key || !code || !/^[A-Za-z0-9]{4,32}$/.test(code)) return null
  try {
    const res = await fetch(`${url}/rest/v1/rpc/league_invite_preview`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_code: code }),
    })
    if (!res.ok) return null
    const rows = await res.json()
    return Array.isArray(rows) && rows[0] ? rows[0] : null
  } catch {
    return null
  }
}

/** "Pick'Em league · 20 members · run by Austin" */
export function inviteSummary(l) {
  const kind = l.league_type === 'pickem' ? "Pick'Em league" : 'Fantasy league'
  const members = `${l.member_count} member${l.member_count === 1 ? '' : 's'}`
  return [kind, members, l.commissioner ? `run by ${l.commissioner}` : null].filter(Boolean).join(' · ')
}
