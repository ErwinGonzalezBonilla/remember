# Rehomi · Registro de cambios

## 25 de noviembre de 2026

### Abrir y sellar cápsulas, con magia
- **Abrir**: la primera vez que ves abierta una cápsula que te dejaron, el sello de lacre tiembla, se agrieta y se parte, la solapa se abre, sube la carta y caen pétalos con "Esta cápsula te esperaba desde el {fecha}". El móvil vibra al romperse el sello. Solo pasa una vez, también si la abres después en otro móvil.
- **Sellar**: la carta se dobla y entra en el sobre, cae el sello con un pequeño rebote y vibración, y aparece "Sellada hasta el {fecha} a las {hora}" con un candado que se cierra.
- Las dos se pueden saltar y, si el móvil tiene activado "Reducir movimiento", son un fundido sin movimiento. El lector de pantalla anuncia los textos.
- "Lista para abrir" en Cápsulas significa ahora "abierta y aún sin ver" (antes, abierta en los últimos 14 días).

### El cofre, un espacio privado entre los dos
- Cabecera nueva: foto grande con corazón, "El cofre de {nombre}", "{relación} · Desde {año}" y "Espacio privado compartido".
- **Desde**: el año en que os conocisteis, que se anota al editar la persona. Si no se anota, el año en que os conectasteis (o en que la añadiste).
- Accesos en una fila que se desliza: **Foto**, **Video**, **Canciones**, **Cápsula**, **Chat**, **Calendario** y **Mapa**.
  - Foto y Video: todas las fotos o videos de los recuerdos que compartís, también los de los álbumes.
  - Cápsula: solo las cápsulas entre los dos (enviadas y recibidas), con la lista de siempre.
  - Calendario: solo sus fechas, las cápsulas entre los dos y vuestros recuerdos, con el mismo panel del día.
- **Nuestros recuerdos**: el último en grande (con ▶ si es un video) y miniaturas, con "Ver todo".
- **Momentos destacados**: los hitos y los recuerdos que marques con ⭐ ("Destacar en el cofre" en el menú del recuerdo; solo quien lo guardó).
- **Recomendaciones**, calculadas sin IA: su próximo cumpleaños o fecha especial (→ crear una cápsula para ese día), "un día como hoy" y "hace X días que no guardáis un recuerdo" (→ nuevo recuerdo).
- Dentro del cofre solo se ve lo compartido entre los dos, con la regla de siempre; Cápsulas, Calendario y el resto de la app siguen mostrando todo.

### Notas de voz grabadas en la app
- El botón **Audio** de Nueva cápsula ofrece **Grabar ahora** o **Elegir archivo**.
- La grabadora deja grabar, pausar y seguir, escuchar, repetir y añadir. En el iPhone graba en M4A; en el resto de navegadores, en WebM u Ogg. También se usa en Nuevo recuerdo y en el chat.

### Chat privado
- Conversación solo entre los dos, si estáis conectados: texto, fotos y notas de voz, con la hora, "Visto" y la opción de borrar tus mensajes.
- Los mensajes nuevos llegan mientras el chat está abierto (cada pocos segundos), con aviso en el móvil y un punto rojo con los no leídos en el botón Chat.
- Si la persona aún no tiene cuenta: "Podréis chatear cuando {nombre} se conecte".

### Canciones
- Vuestras canciones con título, artista, enlace de Spotify, YouTube o Apple Music y una nota ("la de nuestra boda"). Se escuchan con el reproductor oficial de cada servicio, que se carga al tocar "Escuchar".
- Cada uno puede añadir canciones y borrar las suyas.

### Mapa
- Mapa de OpenStreetMap con los recuerdos que compartís y tienen lugar; cada punto lleva su foto y al tocarlo se abre el recuerdo. Debajo, la misma lista de lugares.
- Al guardar un recuerdo con lugar, la app busca sus coordenadas en OpenStreetMap (Nominatim). Si no lo encuentra, el recuerdo se guarda igual, sin punto en el mapa.

### Rendimiento
- El mapa, el chat, las canciones y Conectar (con el lector de QR) se descargan solo al abrirlos: la app arranca con menos peso.

## 22 de noviembre de 2026

### Calendario: cápsulas y recuerdos
- El calendario se ve siempre, aunque aún no tengas ninguna fecha: puedes tocar un día y anotar la primera. "Sin fechas todavía" aparece debajo.
- Las cápsulas (enviadas y recibidas) salen el día en que se abren, con su estado; los recuerdos, el día en que ocurrieron. Al tocarlos en el panel del día se abren.
- Cada día lleva un punto por tipo: cumpleaños, fecha especial, cápsula y recuerdo.
- El filtro tiene "Solo cápsulas" y "Solo recuerdos". En "Próximos eventos" también salen las cápsulas que están por abrirse.
- De una cápsula recibida que aún no se ha abierto solo se ve el título, quién la envió y cuándo se abre.

### Calendario: panel de cada día
- Se puede tocar cualquier día del calendario: se abre un panel con la fecha escrita ("Jueves 5 de noviembre de 2026") y lo anotado ese día, o "Nada anotado este día".
- **Crear una cápsula que se abra este día** (hoy o días futuros): abre Nueva cápsula con esa fecha ya puesta.
- **Guardar un recuerdo de este día** (hoy o días pasados): abre Nuevo recuerdo con esa fecha.
- **Anotar una fecha especial**: eliges la persona, si es su cumpleaños o una fecha con nombre (p. ej. "Aniversario") y el año. Se repite cada año en el calendario. Si ya tenía una fecha de ese tipo, avisa antes de reemplazarla.
- El panel se cierra tocando fuera, con la ✕, con Escape o deslizando hacia abajo, y se puede usar con teclado y lector de pantalla.

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
