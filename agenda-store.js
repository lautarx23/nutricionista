// Fuente de datos COMPARTIDA entre la web pública (/index.html) y el panel (/panel-admin/index.html).
// Es el único archivo que conoce cómo se guarda la agenda y cuáles son los datos iniciales.
//
// Hoy guarda en localStorage, que es propio de cada navegador y de cada dominio: la web
// pública y el panel solo comparten datos si se sirven desde el mismo dominio y se abren en el
// MISMO navegador. Para que un paciente vea lo que carga la nutricionista hace falta un
// backend (o un agenda.json publicado). Para migrar alcanza con reemplazar cargar() y guardar()
// de este archivo; ninguna de las dos apps sabe dónde viven los datos.
//
// Estructura guardada (clave STORAGE_KEY):
//   { version: 1, turnos: [{ id, fecha: 'AAAA-MM-DD', hora: 'HH:MM',
//                            estado: 'disponible'|'reservado'|'cancelado'|'atendido',
//                            paciente: string|null, telefono: string|null }] }
//
// Script clásico (no módulo) para que funcione también con file://
;(function () {
  const STORAGE_KEY = 'nutriAgenda'
  const VERSION = 1
  const ESTADOS = ['disponible', 'reservado', 'cancelado', 'atendido']

  const pad = (n) => String(n).padStart(2, '0')
  const aIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  // "2026-10-07" -> Date local (evita el desfase de zona horaria de new Date('2026-10-07'))
  function desdeIso(iso) {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d)
  }

  const nuevoId = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

  function crearTurno(fecha, hora, estado = 'disponible', paciente = null, telefono = null) {
    return { id: nuevoId(), fecha, hora, estado, paciente, telefono }
  }

  // ---- Datos iniciales ------------------------------------------------------
  // Las fechas se calculan desde hoy para que nunca arranquen vencidas.
  function datosIniciales(ahora = new Date()) {
    const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())
    const turnos = [
      crearTurno(aIso(hoy), '09:00'),
      crearTurno(aIso(hoy), '10:30', 'reservado', 'María Gómez', '11 5555-0101'),
      crearTurno(aIso(hoy), '12:00', 'cancelado', 'Carlos Ruiz', '11 5555-0102'),
      crearTurno(aIso(hoy), '14:30', 'atendido', 'Ana Torres', '11 5555-0103'),
      crearTurno(aIso(hoy), '16:00', 'reservado', 'Juan Pérez', '11 5555-0104'),
      crearTurno(aIso(hoy), '17:30'),
    ]

    // Próximos 4 días hábiles
    const plantillas = [
      [['09:30'], ['11:00', 'reservado', 'Lucía Fernández', '11 5555-0105'], ['16:00'], ['17:30']],
      [['10:00'], ['15:30'], ['18:00']],
      [['09:00'], ['10:30'], ['12:00'], ['16:30'], ['18:00']],
      [['11:00'], ['16:30']],
    ]
    const cursor = new Date(hoy)
    let i = 0
    while (i < plantillas.length) {
      cursor.setDate(cursor.getDate() + 1)
      if (cursor.getDay() === 0 || cursor.getDay() === 6) continue
      plantillas[i].forEach(([hora, estado, paciente, telefono]) => {
        turnos.push(crearTurno(aIso(cursor), hora, estado, paciente, telefono))
      })
      i++
    }

    return { version: VERSION, turnos }
  }

  // ---- Validación de lo que viene de localStorage -------------------------
  const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
  const HORA_RE = /^\d{2}:\d{2}$/
  const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)

  // Devuelve un turno limpio o null si el dato no sirve
  function normalizarTurno(t) {
    if (!t || typeof t !== 'object') return null
    if (t.id === undefined || t.id === null || t.id === '') return null
    if (!FECHA_RE.test(t.fecha) || !HORA_RE.test(t.hora) || !ESTADOS.includes(t.estado)) return null
    const libre = t.estado === 'disponible' // un horario libre nunca tiene paciente
    return {
      id: t.id,
      fecha: t.fecha,
      hora: t.hora,
      estado: t.estado,
      paciente: libre ? null : texto(t.paciente),
      telefono: libre ? null : texto(t.telefono),
    }
  }

  function normalizar(datos) {
    if (!datos || datos.version !== VERSION || !Array.isArray(datos.turnos)) return null
    return { version: VERSION, turnos: datos.turnos.map(normalizarTurno).filter(Boolean) }
  }

  // ---- API pública ----------------------------------------------------------

  // Devuelve { agenda, origen }. `origen` dice de dónde salieron los datos:
  //   'guardada'   → leída de localStorage
  //   'inicial'    → no había nada guardado todavía
  //   'corrupta'   → había algo ilegible; se usan los datos iniciales (y se conserva copia)
  //   'sin-storage'→ el navegador no permite leer localStorage
  // Nunca lanza: la app siempre recibe una agenda utilizable. No escribe nada.
  function cargar() {
    let crudo
    try {
      crudo = localStorage.getItem(STORAGE_KEY)
    } catch (e) {
      return { agenda: datosIniciales(), origen: 'sin-storage' }
    }
    if (crudo === null) return { agenda: datosIniciales(), origen: 'inicial' }

    try {
      const agenda = normalizar(JSON.parse(crudo))
      if (agenda) return { agenda, origen: 'guardada' }
    } catch (e) {
      /* JSON roto: cae abajo */
    }

    try {
      localStorage.setItem(STORAGE_KEY + '_corrupta', crudo) // por si hace falta recuperarlo a mano
    } catch (e) {
      /* sin espacio o sin permiso: no pasa nada */
    }
    return { agenda: datosIniciales(), origen: 'corrupta' }
  }

  // Guarda solo los datos de la agenda (nunca estado de pantalla). Devuelve true si pudo.
  function guardar(agenda) {
    try {
      const limpia = {
        version: VERSION,
        turnos: agenda.turnos.map((t) => ({
          id: t.id,
          fecha: t.fecha,
          hora: t.hora,
          estado: t.estado,
          paciente: t.paciente,
          telefono: t.telefono,
        })),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(limpia))
      return true
    } catch (e) {
      return false
    }
  }

  window.AgendaStore = { STORAGE_KEY, cargar, guardar, crearTurno, aIso, desdeIso }
})()
