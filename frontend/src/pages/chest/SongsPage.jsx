import { useState } from 'react'
import { api } from '../../api/client'
import BottomSheet from '../../components/BottomSheet'
import Icon from '../../components/Icon'
import { AppShell, EmptyState, ErrorBox, Field, Spinner, TopBar } from '../../components/ui'
import { useApi } from '../../hooks'
import { useChestPerson } from './ChestPages'
import { firstName } from './chestUtils'

const SERVICE = { spotify: 'Spotify', youtube: 'YouTube', apple: 'Apple Music' }
const EMPTY = { title: '', artist: '', url: '', note: '' }

/** El reproductor oficial solo se carga al pedirlo: la lista va ligera y no se avisa a nadie hasta que escuchas. */
function Player({ song }) {
  const [on, setOn] = useState(false)
  if (!on) {
    return (
      <button type="button" className={`song-play is-${song.service}`} onClick={() => setOn(true)}>
        <Icon name="play" size={18} filled /> Escuchar en {SERVICE[song.service]}
      </button>
    )
  }
  const album = /\/(album|playlist|show)\//.test(song.embed_url) && song.service !== 'youtube'
  return (
    <iframe className={`song-frame is-${song.service} ${album ? 'tall' : ''}`} src={song.embed_url} loading="lazy"
      title={`${song.title}${song.artist ? ` de ${song.artist}` : ''} en ${SERVICE[song.service]}`}
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      referrerPolicy="strict-origin-when-cross-origin" />
  )
}

function AddSong({ id, onAdded, onClose }) {
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  async function save(e) {
    e.preventDefault()
    if (!form.title.trim()) return setError('Escribe el título de la canción.')
    if (!form.url.trim()) return setError('Pega el enlace de la canción.')
    setBusy(true); setError('')
    try {
      onAdded(await api(`/api/people/${id}/songs`, {
        method: 'POST', body: { title: form.title, artist: form.artist || null, url: form.url, note: form.note || null },
      }))
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <BottomSheet title="Añadir una canción" onClose={onClose}>
      <form className="song-form" onSubmit={save}>
        <Field label="Enlace" htmlFor="song-url" hint="Cópialo desde «Compartir» en Spotify, YouTube o Apple Music.">
          <input id="song-url" type="url" inputMode="url" value={form.url} onChange={set('url')} required
            placeholder="https://open.spotify.com/track/…" autoComplete="off" />
        </Field>
        <Field label="Título" htmlFor="song-title">
          <input id="song-title" value={form.title} onChange={set('title')} maxLength={120} required placeholder="Perfect" />
        </Field>
        <Field label="Artista (opcional)" htmlFor="song-artist">
          <input id="song-artist" value={form.artist} onChange={set('artist')} maxLength={120} placeholder="Ed Sheeran" />
        </Field>
        <Field label="Una nota (opcional)" htmlFor="song-note">
          <input id="song-note" value={form.note} onChange={set('note')} maxLength={200} placeholder="La de nuestra boda" />
        </Field>
        <ErrorBox error={error} />
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Guardando…' : 'Añadir canción'}</button>
      </form>
    </BottomSheet>
  )
}

/** Canciones compartidas entre los dos, con el reproductor oficial de cada servicio. */
export default function SongsPage() {
  const { id, name, gate } = useChestPerson()
  const { data: songs, setData, error } = useApi(`/api/people/${id}/songs`)
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState('')
  if (gate) return gate

  async function remove(s) {
    if (!confirm(`¿Quitar «${s.title}» de vuestras canciones?`)) return
    try {
      await api(`/api/songs/${s.id}`, { method: 'DELETE' })
      setData((list) => list.filter((x) => x.id !== s.id))
    } catch (e) { setErr(e.message) }
  }

  return (
    <AppShell>
      <TopBar title={`Canciones con ${name}`}
        right={<button type="button" className="icon-btn" onClick={() => setAdding(true)} aria-label="Añadir una canción"><Icon name="plus" /></button>} />
      <ErrorBox error={error || err} />
      {!songs && !error && <Spinner />}
      {songs && !songs.length && (
        <EmptyState icon="music" title="Vuestra banda sonora"
          text={`Guarda las canciones que os unen a ${name}: la de vuestra boda, la que cantabais en el coche…`}
          action={<button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>Añadir la primera</button>} />
      )}
      {songs?.length > 0 && (
        <ul className="songs">
          {songs.map((s) => (
            <li key={s.id} className="song">
              <div className="song-head">
                <span className={`song-icon is-${s.service}`} aria-hidden="true"><Icon name="music" size={20} /></span>
                <span className="song-text">
                  <strong>{s.title}</strong>
                  <small>{[s.artist, SERVICE[s.service]].filter(Boolean).join(' · ')}{!s.mine && ` · la añadió ${firstName(s.author_name)}`}</small>
                </span>
                {s.mine && (
                  <button type="button" className="icon-btn song-del" onClick={() => remove(s)} aria-label={`Quitar «${s.title}»`}>
                    <Icon name="trash" size={18} />
                  </button>
                )}
              </div>
              {s.note && <p className="song-note">“{s.note}”</p>}
              <Player song={s} />
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <AddSong id={id} onClose={() => setAdding(false)}
          onAdded={(s) => { setData((list) => [s, ...(list || [])]); setAdding(false) }} />
      )}
    </AppShell>
  )
}
