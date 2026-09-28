import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import clsx from 'clsx'
import { BRAND_PRESETS, DEFAULT_GOLD } from '@/lib/brand'

/**
 * Preset swatches, any color, and back to the copper. Used for your own
 * accent (Account) and the Shop TV's (Commish panel). `onPick` saves.
 */
export function ColorPicker({ value, onPick, disabled = false, idPrefix }: {
  /** The current color, "#RRGGBB"; null means the copper. */
  value: string | null
  onPick: (hex: string) => void
  disabled?: boolean
  /** Keeps the inputs' ids unique when two pickers are on one page. */
  idPrefix: string
}) {
  const current = (value ?? DEFAULT_GOLD).toUpperCase()
  const [custom, setCustom] = useState(current)
  useEffect(() => { setCustom(current) }, [current])
  const customValid = /^#[0-9a-f]{6}$/i.test(custom)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {BRAND_PRESETS.map(p => (
          <button
            key={p.hex}
            onClick={() => onPick(p.hex)}
            disabled={disabled}
            title={p.name}
            aria-label={`${p.name}${current === p.hex ? ' (current)' : ''}`}
            aria-pressed={current === p.hex}
            className={clsx(
              'w-9 h-9 rounded-full border-2 flex items-center justify-center transition-transform hover:scale-110 disabled:opacity-60',
              current === p.hex ? 'border-white' : 'border-transparent',
            )}
            style={{ background: p.hex }}
          >
            {current === p.hex && <Check className="w-4 h-4 text-white drop-shadow" />}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <input
          id={`${idPrefix}-picker`}
          type="color"
          value={customValid ? custom : DEFAULT_GOLD}
          onChange={e => setCustom(e.target.value.toUpperCase())}
          className="w-9 h-9 rounded cursor-pointer bg-transparent border-0 p-0"
          aria-label="Pick any color"
        />
        <input
          id={`${idPrefix}-hex`}
          value={custom}
          onChange={e => setCustom(e.target.value.trim().slice(0, 7))}
          className="input !w-28 !py-1.5 font-mono text-sm uppercase"
          aria-label="Color hex code"
        />
        <button
          onClick={() => onPick(custom.toUpperCase())}
          disabled={disabled || !customValid || custom.toUpperCase() === current}
          className="btn-ghost !py-1.5 !px-3 !text-xs disabled:opacity-40"
        >
          Use this color
        </button>
        {current !== DEFAULT_GOLD && (
          <button onClick={() => onPick(DEFAULT_GOLD)} disabled={disabled} className="text-xs font-bold text-field-400 hover:text-white ml-1">
            Back to copper
          </button>
        )}
      </div>
      <p className="text-[11px] text-field-500 mt-2">Very dark or very light colors are adjusted a little so text stays readable.</p>
    </div>
  )
}
