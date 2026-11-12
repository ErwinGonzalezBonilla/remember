import { useEffect, useRef, useState } from 'react'
import QrScanner from 'qr-scanner'
import Icon from '../../components/Icon'

/** Saca el @usuario de lo que lee la cámara: un enlace .../c/<usuario> o el texto "@usuario". */
export function handleFromCode(text = '') {
  const t = text.trim()
  const link = t.match(/\/c\/([A-Za-z0-9_.]{3,30})\/?(?:[?#].*)?$/)
  if (link) return link[1].toLowerCase()
  const at = t.match(/^@([A-Za-z0-9_.]{3,30})$/)
  return at ? at[1].toLowerCase() : null
}

/** Cámara trasera dentro de un recuadro con esquinas coral. Se apaga al desmontarse
 *  (cambiar de pestaña o salir de la pantalla) y en cuanto lee un código válido. */
export default function QrScan({ runKey, onHandle, onSearch }) {
  const videoRef = useRef(null)
  const onHandleRef = useRef(onHandle)
  onHandleRef.current = onHandle
  const [status, setStatus] = useState('starting') // starting | scanning | done | invalid | nocamera | denied

  useEffect(() => {
    let scanner
    let cancelled = false
    setStatus('starting')

    async function start() {
      if (!(await QrScanner.hasCamera())) {
        if (!cancelled) setStatus('nocamera')
        return
      }
      if (cancelled) return
      scanner = new QrScanner(videoRef.current, (result) => {
        const handle = handleFromCode(result.data)
        if (!handle) return setStatus('invalid') // sigue leyendo hasta encontrar uno de REHOMI
        scanner.stop()
        setStatus('done')
        onHandleRef.current(handle)
      }, { preferredCamera: 'environment', returnDetailedScanResult: true, maxScansPerSecond: 8 })
      try {
        await scanner.start()
        if (!cancelled) setStatus('scanning')
      } catch {
        // qr-scanner cambia el error del navegador por "Camera not found.": si hay cámara
        // pero no se pudo abrir, casi siempre es porque no se dio permiso.
        if (!cancelled) setStatus('denied')
      }
    }
    start()

    return () => {
      cancelled = true
      scanner?.stop()
      scanner?.destroy()
    }
  }, [runKey])

  const blocked = status === 'denied' || status === 'nocamera'

  return (
    <div className="stack">
      <div className={`scan-box ${blocked ? 'blocked' : ''}`}>
        <video ref={videoRef} muted playsInline />
        <span className="scan-corner tl" /><span className="scan-corner tr" />
        <span className="scan-corner bl" /><span className="scan-corner br" />
        {blocked && (
          <div className="scan-msg">
            <Icon name="camera" size={28} />
            <strong>{status === 'denied' ? 'No tenemos permiso para usar la cámara' : 'No encontramos ninguna cámara'}</strong>
            <small>
              {status === 'denied'
                ? 'Permite el acceso a la cámara en los ajustes del navegador y vuelve a intentarlo, o busca a la persona por su @usuario.'
                : 'Puedes buscar a la persona por su @usuario o su correo.'}
            </small>
            <button type="button" className="btn btn-ghost small" onClick={onSearch}>Buscar por @usuario</button>
          </div>
        )}
      </div>
      <p className="scan-hint muted" aria-live="polite">
        {status === 'starting' && 'Abriendo la cámara…'}
        {status === 'scanning' && 'Apunta al código QR de tu persona especial'}
        {status === 'invalid' && 'Ese código no es de REHOMI. Prueba con el de “Mi código QR”.'}
        {status === 'done' && 'Código leído'}
      </p>
    </div>
  )
}
