// Logo oficial de Rehomi: la R con el corazón + el nombre. En modo oscuro el nombre pasa a claro.
export default function Logo({ size = 48, tagline = true, className = '', onDark = false }) {
  return (
    <div className={`logo ${className}`}>
      <span className="logo-img" style={{ height: size }}>
        {onDark ? <img src="/logo-white.png" alt="Rehomi" height={size} /> : <>
          <img src="/logo.png" alt="Rehomi" className="logo-on-light" height={size} />
          <img src="/logo-dark.png" alt="Rehomi" className="logo-on-dark" height={size} />
        </>}
      </span>
      {tagline && <div className="logo-tag">Conecta · Guarda · Siempre</div>}
    </div>
  )
}

// Pantalla de carga al abrir la app.
export function Splash() {
  return (
    <div className="center-screen splash" role="status">
      <img src="/brand/splash.png" alt="" width="96" height="96" />
      <span className="sr-only">Cargando…</span>
    </div>
  )
}
