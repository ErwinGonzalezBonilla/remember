# Rehomi · Registro de cambios

## 22 de noviembre de 2026

### Cápsulas: lista por persona y nueva cápsula en una pantalla
- **Recibidas** y **Enviadas** se agrupan por persona: cara, nombre y "N cápsulas · la próxima se abre en X días". Al tocar el grupo se despliega.
- Los grupos con una cápsula que ya se puede abrir van primero y desplegados; el resto, plegados y por la próxima fecha de apertura.
- Botón de filtro junto a las pestañas: por estado (todas, selladas, abiertas, borradores) y buscar persona por nombre.
- **Nueva cápsula** en una sola pantalla: "Un mensaje para el futuro", las caras en fila para elegir a quién, la carta en papel con renglones que crece al escribir, tres botones grandes (**Fotos**, **Videos** y **Audio**) y la fecha escrita como frase ("Se abrirá el 17 de noviembre de 2027 a las 9:00"), que al tocarla deja cambiar el día y la hora.
- La API de cápsulas devuelve `author_id`, para no mezclar a dos personas que se llamen igual.

### Audios desde el iPhone
- En el iPhone ya se pueden elegir audios desde **Archivos** (iCloud Drive y "En mi iPhone"): M4A, MP3, WAV, AAC y las notas de voz de WhatsApp (.opus).
- En las cápsulas hay dos botones: **Fotos y videos** y **Audio**. El de audio abre directamente Archivos.
- Si el iPhone entrega el archivo sin tipo o con un nombre de tipo distinto (audio/x-m4a, audio/mp3, audio/vnd.wave, audio/opus…), la app lo deduce de la extensión y el servidor lo acepta.
- Se guarda el archivo original, sin convertirlo, y se escucha con el reproductor de la app.

## 5 de noviembre de 2026

### Nuevo estilo visual
- Paleta de la guía de marca: petróleo `#064F5B`, arena `#E9DCC6`, crema `#F8F7F1`, coral `#E98F7D` y gris `#6B7F86`.
- Tipografías Manrope (textos) y Allura (frases).
- Cabeceras en petróleo con ondas y la línea con el corazón; "Tus personas" en una tarjeta sobre la cabecera del inicio.
- Fotos y avatares en rectángulo redondeado; "Tus personas" en cuadrícula de fotos.
- Logo blanco para fondos oscuros y barra inferior con indicador de pestaña activa.

### Avisos en el móvil (Web Push)
- Aviso en el móvil cuando te etiquetan en un recuerdo (foto, video, audio, carta), cuando comentan, con las solicitudes de conexión y con las cápsulas del tiempo.
- Al tocar el aviso se abre la pantalla correspondiente.
- Se activa una vez en cada móvil desde el inicio, Avisos o Ajustes. En iPhone hace falta tener la app añadida a la pantalla de inicio (iOS 16.4 o posterior).
- Las claves de los avisos se crean solas y se guardan en la base de datos.

## 4 de noviembre de 2026

- Dominio propio: **rehomi.app** (www redirige a rehomi.app).
- Botón **+** en el centro de la barra inferior para guardar foto, video, audio o carta.
- Logo oficial de Rehomi en el acceso, el inicio, la pantalla de carga, Ajustes, los correos y el icono de la app.
- Relación personalizada al elegir **Otro** (primo, mejor amigo…).
- **Apodo cariñoso** con emoji sugerido; la otra persona ve "Erwin dice que eres su primo y te apoda «el Orejón» 😂".
- **Tu familia** en el perfil (pareja, padres, hermanos, hijos), enlazada a los cofres de tus personas.
- **Perfil de las personas conectadas**: foto, @usuario, frase, cumpleaños y familia.
- **Avisos en la app y por correo** cuando te etiquetan en un recuerdo o comentan, con campanita en el inicio.
