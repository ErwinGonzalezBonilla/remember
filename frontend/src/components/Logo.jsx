// Logo oficial de Rehomi: la R con el corazón + el nombre. En modo oscuro el nombre pasa a claro.
export default function Logo({ size = 48, tagline = true }) {
  return (
    <div className="logo">
      <span className="logo-img" style={{ height: size }}>
        <img src="/logo.png" alt="Rehomi" className="logo-on-light" height={size} />
        <img src="/logo-dark.png" alt="Rehomi" className="logo-on-dark" height={size} />
      </span>
      {tagline && <div className="logo-tag">Conecta · Guarda · Siempre</div>}
    </div>
  )
}
