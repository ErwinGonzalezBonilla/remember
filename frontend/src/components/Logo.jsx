// Corazón de dos trazos entrelazados: azul petróleo + coral (la conexión entre dos personas).
export function LogoMark({ size = 48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 54 11 33a12 12 0 0 1 17-17l4 4" fill="none" stroke="var(--petrol)" strokeWidth="8"
        strokeLinecap="round" strokeLinejoin="round" />
      <path d="m32 20 4-4a12 12 0 0 1 17 17L32 54" fill="none" stroke="var(--coral)" strokeWidth="8"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function Logo({ size = 48, tagline = true }) {
  return (
    <div className="logo">
      <LogoMark size={size} />
      <div>
        <div className="logo-word" style={{ fontSize: size * 0.72 }}>Remember</div>
        {tagline && <div className="logo-tag">Conecta · Guarda · Siempre</div>}
      </div>
    </div>
  )
}
