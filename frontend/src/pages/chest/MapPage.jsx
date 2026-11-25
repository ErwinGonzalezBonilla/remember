import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { mediaUrl } from '../../api/client'
import Icon from '../../components/Icon'
import { AppShell, EmptyState, ErrorBox, Spinner, TopBar, formatDate } from '../../components/ui'
import { useApi } from '../../hooks'
import { useChestPerson } from './ChestPages'

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/** Pin propio (coral, con la foto si la hay): sin imágenes externas de Leaflet. */
function pin(p) {
  const img = p.thumb_url ? `<img src="${escape(mediaUrl(p.thumb_url))}" alt="" />` : '<span class="map-pin-dot"></span>'
  return L.divIcon({ className: 'map-pin', html: `<span class="map-pin-body">${img}</span>`, iconSize: [44, 52], iconAnchor: [22, 50] })
}

function LeafletMap({ points, onOpen }) {
  const box = useRef(null)
  useEffect(() => {
    const map = L.map(box.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false })
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map)
    map.attributionControl.setPrefix(false)
    const markers = points.map((p) => {
      const m = L.marker([p.lat, p.lng], { icon: pin(p), title: `${p.title} · ${p.location}`, alt: p.title, keyboard: true })
      m.on('click', () => onOpen(p.memory_id))
      m.on('keypress', (e) => { if (e.originalEvent.key === 'Enter') onOpen(p.memory_id) })
      return m.addTo(map)
    })
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], 12)
    else map.fitBounds(L.featureGroup(markers).getBounds().pad(0.2), { maxZoom: 13 })
    // El contenedor puede cambiar de tamaño al cargar fuentes o al girar el móvil
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(box.current)
    return () => { ro.disconnect(); map.remove() }
  }, [points, onOpen])
  return <div ref={box} className="map-box" role="region" aria-label="Mapa de vuestros recuerdos" />
}

/** Mapa del cofre: dónde ocurrieron los recuerdos compartidos. */
export default function MapPage() {
  const { id, name, gate } = useChestPerson()
  const navigate = useNavigate()
  const { data: points, error } = useApi(`/api/memories/map?person_id=${id}`)
  const openRef = useRef((mid) => navigate(`/recuerdo/${mid}`))
  if (gate) return gate

  const places = new Set(points?.map((p) => p.location.toLowerCase())).size
  return (
    <AppShell>
      <TopBar title={`Mapa con ${name}`} />
      <ErrorBox error={error} />
      {!points && !error && <Spinner />}
      {points && !points.length && (
        <EmptyState icon="map" title="Aún no hay lugares"
          text={`Cuando guardes un recuerdo con ${name} y escribas dónde fue, aparecerá aquí como un punto en el mapa.`}
          action={<Link to={`/recuerdos/nuevo?persona=${id}`} className="btn btn-primary">Guardar un recuerdo</Link>} />
      )}
      {points?.length > 0 && (
        <>
          <p className="muted small">{points.length} {points.length === 1 ? 'recuerdo' : 'recuerdos'} en {places} {places === 1 ? 'lugar' : 'lugares'}. Toca un punto para abrirlo.</p>
          <LeafletMap points={points} onOpen={openRef.current} />
          {/* La misma información en lista: para el lector de pantalla y para quien prefiera no usar el mapa */}
          <section aria-labelledby="map-list-title">
            <h2 id="map-list-title" className="chest-h2">Lugares</h2>
            <ul className="map-list">
              {points.map((p) => (
                <li key={p.memory_id}>
                  <Link to={`/recuerdo/${p.memory_id}`} className="map-item">
                    <span className="map-item-icon"><Icon name="pin" size={18} /></span>
                    <span className="map-item-text">
                      <strong>{p.title}</strong>
                      <small>{p.location} · {formatDate(p.happened_on)}</small>
                    </span>
                    <Icon name="chevron" size={16} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </AppShell>
  )
}
