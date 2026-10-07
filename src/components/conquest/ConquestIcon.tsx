import { ICON, type IconName } from './icons'

/** One of Conquest's symbols, inline with text (sized and colored by className). */
export function ConquestIcon({ name, className, title }: { name: IconName; className?: string; title?: string }) {
  const icon = ICON[name]
  return (
    <svg viewBox="0 0 24 24" className={className} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      {'fill' in icon && <path d={icon.fill} fill="currentColor" />}
      {'stroke' in icon && <path d={icon.stroke} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />}
      {'dot' in icon && <circle cx={12} cy={12} r={1.8} fill="currentColor" />}
    </svg>
  )
}
