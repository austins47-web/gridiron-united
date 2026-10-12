// "Reduce effects": every animation, transition and blur off (index.css's
// .gu-calm), for a screen that can't keep up with them. Some big Android
// screens (a folding phone opened up) flash black and white under the
// app's moving layers. Kept on this device; a link with ?calm=1 turns it
// on (and ?calm=0 off), for someone who can't get to the switch.

const KEY = 'gu-calm'

export function calmOn(): boolean {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

export function setCalm(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch { /* just for now, then */ }
  document.documentElement.classList.toggle('gu-calm', on)
}

/** At startup: a ?calm= in the link switches it (and remembers it); then it's applied. */
export function applyCalm() {
  const asked = new URLSearchParams(location.search).get('calm')
  if (asked === '1' || asked === '0') setCalm(asked === '1')
  else document.documentElement.classList.toggle('gu-calm', calmOn())
}
