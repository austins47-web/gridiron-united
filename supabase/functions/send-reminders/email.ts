// ══════════════════════════════════════════════════════════════
// Reminder emails — the template
//
// Every email shares one branded shell: app icon + wordmark, a card
// with a gold kicker line, a big headline, the message, an optional
// content block built for that kind of email, a big button, and a
// footer. Built the way email has to be — nested tables and inline
// styles (no flex/grid, no SVG), 560px wide and fluid below that —
// so it holds up in Gmail, Apple Mail and Outlook alike. Web fonts
// (Barlow Condensed) show where the client supports them, with
// condensed system fonts behind them everywhere else.
//
// Each email also gets inbox preview text (preheader) and a plain-text
// version, which read better and help deliverability.
// ══════════════════════════════════════════════════════════════

import type { WeekStatLine } from '../_shared/pickemCore.ts'

export interface PickRow {
  away: string
  home: string
  /** Kickoff, already formatted for the league's zone ("Sun 4:25 PM"). */
  when: string
  tiebreaker?: boolean
}

export type RichEmail =
  | {
      kind: 'picks'
      /** Open games the reader hasn't picked (first several). */
      games: PickRow[]
      /** How many more beyond `games`. */
      more: number
      /** "Locks in 2h", "First kickoff in 24h" … */
      lockLabel: string
      /** Their tiebreaker guess is missing (and the game it's for). */
      tbMissing: boolean
      tbGame?: string
    }
  | {
      kind: 'recap'
      weekLabel: string
      winners: string[]
      /** "13/16 · 81%" */
      winnerLine: string
      decidedByTiebreak: boolean
      you?: { correct: number; played: number; place: number; of: number; won: boolean }
      top: { place: number; name: string; score: string; you: boolean }[]
      stats: WeekStatLine[]
      season?: { place: number; of: number; record: string; leader: string; leaderRecord: string; youLead: boolean }
    }

export interface EmailParts {
  leagueName: string
  subject: string
  /** Inbox preview text. */
  preheader: string
  /** Small gold line above the headline ("LOCKS IN 2H"). */
  kicker: string
  heading: string
  body: string
  ctaLabel: string
  ctaUrl: string
  manageUrl: string
  iconUrl: string
  rich?: RichEmail
  urgent?: boolean
}

const GOLD = '#CE7B45'
const DISPLAY = `'Barlow Condensed','Arial Narrow','Helvetica Neue Condensed','Helvetica Neue',Arial,sans-serif`
const SANS = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`

export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
const e = escapeHtml

/** A small team logo through ESPN's resizer (2× for sharp screens). */
export function logoUrl(abbr: string, px = 56): string {
  const img = `/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`
  return `https://a.espncdn.com/combiner/i?img=${encodeURIComponent(img)}&w=${px}&h=${px}`
}

const logo = (abbr: string, size: number) =>
  `<img src="${logoUrl(abbr, size * 2)}" width="${size}" height="${size}" alt="${e(abbr)}" style="display:block;width:${size}px;height:${size}px;border:0;outline:none">`

// ── Content blocks ────────────────────────────────────────────

function picksBlock(r: Extract<RichEmail, { kind: 'picks' }>): string {
  const open = r.games.length + r.more
  const rows = r.games.map(g => `
      <tr><td style="padding:0 0 8px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1C1C1C;border:1px solid ${g.tiebreaker ? 'rgba(206,123,69,0.55)' : '#2A2A2A'};border-radius:12px">
          <tr>
            <td style="padding:12px 0 12px 14px;width:28px">${logo(g.away, 28)}</td>
            <td style="padding:12px 8px;width:1%;font-family:${DISPLAY};font-weight:800;font-size:18px;letter-spacing:0.02em;color:#FFFFFF;white-space:nowrap">
              ${e(g.away)} <span style="color:#5A5A5A;font-weight:600">@</span> ${e(g.home)}
              ${g.tiebreaker ? `<span style="display:inline-block;margin-left:6px;padding:2px 7px;border-radius:6px;background:rgba(206,123,69,0.15);color:${GOLD};font-family:${SANS};font-size:10px;font-weight:700;letter-spacing:0.12em;vertical-align:middle">TIEBREAKER</span>` : ''}
            </td>
            <td style="padding:12px 0;width:28px">${logo(g.home, 28)}</td>
            <td align="right" style="padding:12px 14px 12px 8px;font-family:${SANS};font-size:13px;color:#A3A3A3;white-space:nowrap">${e(g.when)}</td>
          </tr>
        </table>
      </td></tr>`).join('')

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:0 0 14px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#101010;border:1px solid #262626;border-radius:14px">
          <tr>
            <td style="padding:16px 18px">
              <div style="font-family:${DISPLAY};font-weight:900;font-size:44px;line-height:1;color:${GOLD}">${open}</div>
              <div style="font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#8A8A8A;padding-top:4px">${open === 1 ? 'game' : 'games'} still open</div>
            </td>
            <td align="right" style="padding:16px 18px">
              <span style="display:inline-block;padding:8px 14px;border-radius:999px;background:${GOLD};color:#0A0A0A;font-family:${DISPLAY};font-weight:800;font-size:15px;letter-spacing:0.06em;text-transform:uppercase;white-space:nowrap">${e(r.lockLabel)}</span>
            </td>
          </tr>
        </table>
      </td></tr>
      ${rows}
      ${r.more > 0 ? `<tr><td style="padding:2px 4px 8px;font-family:${SANS};font-size:13px;color:#8A8A8A">+ ${r.more} more game${r.more === 1 ? '' : 's'}</td></tr>` : ''}
      ${r.tbMissing ? `
      <tr><td style="padding:6px 0 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(206,123,69,0.10);border:1px solid rgba(206,123,69,0.45);border-radius:12px">
          <tr><td style="padding:12px 14px;font-family:${SANS};font-size:14px;line-height:1.5;color:#EDEDED">
            <strong style="color:${GOLD}">Tiebreaker guess missing.</strong>
            ${r.tbGame ? `Guess the combined score of ${e(r.tbGame)} — ` : ''}without one you lose every tie.
          </td></tr>
        </table>
      </td></tr>` : ''}
    </table>`
}

function recapBlock(r: Extract<RichEmail, { kind: 'recap' }>): string {
  const you = r.you
  const statCell = (s: WeekStatLine | undefined) => s ? `
        <td valign="top" width="50%" style="padding:0 4px 8px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1C1C1C;border:1px solid #2A2A2A;border-radius:12px">
            <tr><td style="padding:12px 14px">
              <div style="font-family:${SANS};font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${GOLD}">${e(s.label)}</div>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:6px"><tr>
                ${s.team ? `<td style="padding-right:6px">${logo(s.team, 20)}</td>` : ''}
                <td style="font-family:${DISPLAY};font-weight:800;font-size:18px;letter-spacing:0.02em;color:#FFFFFF">${e(s.headline)}</td>
              </tr></table>
              <div style="font-family:${SANS};font-size:12px;line-height:1.45;color:#9A9A9A;padding-top:4px">${e(s.detail)}</div>
            </td></tr>
          </table>
        </td>` : `<td width="50%" style="padding:0 4px 8px"></td>`
  const statRows: string[] = []
  for (let i = 0; i < r.stats.length; i += 2) statRows.push(`<tr>${statCell(r.stats[i])}${statCell(r.stats[i + 1])}</tr>`)

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <!-- Winner -->
      <tr><td style="padding:0 0 12px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1A1410;border:1px solid rgba(206,123,69,0.55);border-radius:16px">
          <tr><td align="center" style="padding:22px 18px">
            <div style="font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${GOLD}">${e(r.weekLabel)} ${r.winners.length > 1 ? `· ${r.winners.length}-way tie` : 'champion'}</div>
            <div style="font-family:${DISPLAY};font-weight:900;font-size:36px;line-height:1.05;letter-spacing:0.01em;text-transform:uppercase;color:#FFFFFF;padding-top:8px">${e(r.winners.join(' & '))}</div>
            <div style="font-family:${DISPLAY};font-weight:700;font-size:18px;color:${GOLD};padding-top:6px">${e(r.winnerLine)}${r.decidedByTiebreak ? ' <span style="color:#8A8A8A;font-weight:600">· won on the tiebreaker</span>' : ''}</div>
          </td></tr>
        </table>
      </td></tr>
      ${you ? `
      <!-- You -->
      <tr><td style="padding:0 0 12px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#101010;border:1px solid #262626;border-radius:14px">
          <tr>
            <td style="padding:14px 18px;font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#8A8A8A">Your week</td>
            <td align="right" style="padding:14px 18px;font-family:${DISPLAY};font-weight:800;font-size:22px;color:#FFFFFF">
              ${you.correct}<span style="color:#5A5A5A">/${you.played}</span>
              <span style="display:inline-block;margin-left:8px;padding:4px 10px;border-radius:999px;background:${you.won ? GOLD : '#262626'};color:${you.won ? '#0A0A0A' : '#EDEDED'};font-size:14px;letter-spacing:0.04em;vertical-align:middle">${you.won ? 'WINNER' : `${ordinal(you.place)} of ${you.of}`}</span>
            </td>
          </tr>
        </table>
      </td></tr>` : ''}
      <!-- Top of the table -->
      <tr><td style="padding:4px 0 6px;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#8A8A8A">This week</td></tr>
      <tr><td style="padding:0 0 14px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#101010;border:1px solid #262626;border-radius:14px">
          ${r.top.map((t, i) => `
          <tr>
            <td style="padding:10px 0 10px 16px;width:28px;${i ? 'border-top:1px solid #1F1F1F;' : ''}font-family:${DISPLAY};font-weight:800;font-size:16px;color:${t.place === 1 ? GOLD : '#6B6B6B'}">${t.place}</td>
            <td style="padding:10px 8px;${i ? 'border-top:1px solid #1F1F1F;' : ''}font-family:${SANS};font-size:15px;font-weight:${t.you ? 700 : 500};color:${t.you ? GOLD : '#EDEDED'}">${e(t.name)}${t.you ? ' <span style="font-size:11px;letter-spacing:0.1em;color:#8A8A8A">YOU</span>' : ''}</td>
            <td align="right" style="padding:10px 16px 10px 8px;${i ? 'border-top:1px solid #1F1F1F;' : ''}font-family:${DISPLAY};font-weight:800;font-size:16px;color:#FFFFFF">${e(t.score)}</td>
          </tr>`).join('')}
        </table>
      </td></tr>
      ${r.stats.length ? `
      <!-- Week Stats -->
      <tr><td style="padding:4px 0 6px;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#8A8A8A">Week stats</td></tr>
      <tr><td style="padding:0 0 6px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 -4px">${statRows.join('')}</table>
      </td></tr>` : ''}
      ${r.season ? `
      <!-- Season -->
      <tr><td style="padding:6px 0 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#101010;border:1px solid #262626;border-radius:14px">
          <tr><td style="padding:14px 18px;font-family:${SANS};font-size:14px;line-height:1.5;color:#CFCFCF">
            <strong style="color:#FFFFFF">Season:</strong>
            ${r.season.youLead
              ? `you lead the league at <strong style="color:${GOLD}">${e(r.season.record)}</strong>.`
              : `you're <strong style="color:${GOLD}">${ordinal(r.season.place)} of ${r.season.of}</strong> at ${e(r.season.record)} · ${e(r.season.leader)} leads at ${e(r.season.leaderRecord)}.`}
          </td></tr>
        </table>
      </td></tr>` : ''}
    </table>`
}

// ── Plain-text versions ───────────────────────────────────────

function richText(r: RichEmail | undefined): string {
  if (!r) return ''
  if (r.kind === 'picks') {
    const lines = r.games.map(g => `  ${g.away} @ ${g.home} · ${g.when}${g.tiebreaker ? ' (tiebreaker)' : ''}`)
    if (r.more > 0) lines.push(`  + ${r.more} more`)
    if (r.tbMissing) lines.push('', `Tiebreaker guess missing${r.tbGame ? ` (${r.tbGame})` : ''} — without one you lose every tie.`)
    return `${r.lockLabel}\n\nStill open:\n${lines.join('\n')}`
  }
  const out = [
    `${r.weekLabel} ${r.winners.length > 1 ? 'co-winners' : 'winner'}: ${r.winners.join(' & ')} (${r.winnerLine})`,
    r.you ? `You: ${r.you.correct}/${r.you.played}, ${r.you.won ? 'winner' : `${ordinal(r.you.place)} of ${r.you.of}`}` : '',
    '', 'This week:', ...r.top.map(t => `  ${t.place}. ${t.name} ${t.score}${t.you ? ' (you)' : ''}`),
  ]
  if (r.stats.length) out.push('', 'Week stats:', ...r.stats.map(s => `  ${s.label}: ${s.headline} — ${s.detail}`))
  if (r.season) out.push('', r.season.youLead ? `Season: you lead at ${r.season.record}.` : `Season: ${ordinal(r.season.place)} of ${r.season.of} at ${r.season.record}; ${r.season.leader} leads at ${r.season.leaderRecord}.`)
  return out.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n')
}

export function ordinal(n: number): string {
  const v = n % 100
  return n + (v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
}

// ── The shell ─────────────────────────────────────────────────

export function renderEmail(p: EmailParts): { html: string; text: string } {
  const rich = p.rich?.kind === 'picks' ? picksBlock(p.rich) : p.rich?.kind === 'recap' ? recapBlock(p.rich) : ''
  // Preheader padding keeps clients from pulling body text into the preview
  const pad = '&nbsp;&zwnj;'.repeat(80)

  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${e(p.subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800;900&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:0; background:#0A0A0A; -webkit-text-size-adjust:100%; }
  a { color:${GOLD}; }
  @media (max-width: 600px) {
    .px { padding-left:20px !important; padding-right:20px !important; }
    .h1 { font-size:30px !important; }
  }
</style>
<!--[if mso]><style>td,div,span,a{font-family:Arial,sans-serif !important;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:#0A0A0A">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#0A0A0A">${e(p.preheader)}${pad}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0A0A0A" style="background:#0A0A0A">
  <tr><td align="center" style="padding:28px 12px 36px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">

      <!-- Brand -->
      <tr><td style="padding:0 4px 18px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="width:40px"><img src="${p.iconUrl}" width="36" height="36" alt="Gridiron United" style="display:block;width:36px;height:36px;border:0;border-radius:9px"></td>
          <td style="padding-left:10px;font-family:${DISPLAY};font-weight:900;font-size:19px;letter-spacing:0.08em;text-transform:uppercase;color:${GOLD}">Gridiron <span style="color:#FFFFFF">United</span></td>
          <td align="right" style="font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#7A7A7A">${e(p.leagueName)}</td>
        </tr></table>
      </td></tr>

      <!-- Card -->
      <tr><td style="background:#141414;border:1px solid #262626;border-radius:20px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="height:4px;line-height:4px;font-size:0;background:${GOLD};border-radius:20px 20px 0 0">&nbsp;</td></tr>
          <tr><td class="px" style="padding:30px 36px 6px">
            <div style="font-family:${SANS};font-size:12px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:${p.urgent ? GOLD : '#9A9A9A'}">${e(p.kicker)}</div>
            <div class="h1" style="font-family:${DISPLAY};font-weight:900;font-size:36px;line-height:1.02;letter-spacing:0.005em;text-transform:uppercase;color:#FFFFFF;padding-top:10px">${e(p.heading)}</div>
            <div style="font-family:${SANS};font-size:16px;line-height:1.55;color:#B5B5B5;padding-top:12px">${e(p.body)}</div>
          </td></tr>
          ${rich ? `<tr><td class="px" style="padding:18px 36px 4px">${rich}</td></tr>` : ''}
          <tr><td class="px" style="padding:20px 36px 34px">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="border-radius:12px;background:${GOLD}">
                <a href="${p.ctaUrl}" style="display:inline-block;padding:15px 28px;font-family:${DISPLAY};font-weight:800;font-size:17px;letter-spacing:0.08em;text-transform:uppercase;color:#0A0A0A;text-decoration:none;border-radius:12px">${e(p.ctaLabel)} &rarr;</a>
              </td>
            </tr></table>
          </td></tr>
        </table>
      </td></tr>

      <!-- Footer -->
      <tr><td align="center" style="padding:22px 16px 0;font-family:${SANS};font-size:12px;line-height:1.7;color:#6B6B6B">
        You're getting this because reminders are on for <span style="color:#9A9A9A">${e(p.leagueName)}</span>.<br>
        <a href="${p.manageUrl}" style="color:${GOLD};text-decoration:none">Manage or turn off reminders</a>
        &nbsp;·&nbsp; Gridiron United
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`

  const text = [
    `${p.leagueName.toUpperCase()} · ${p.kicker}`,
    '',
    p.heading,
    '',
    p.body,
    richText(p.rich) ? `\n${richText(p.rich)}` : '',
    '',
    `${p.ctaLabel}: ${p.ctaUrl}`,
    '',
    `Manage or turn off reminders: ${p.manageUrl}`,
  ].join('\n').replace(/\n{3,}/g, '\n\n')

  return { html, text }
}
