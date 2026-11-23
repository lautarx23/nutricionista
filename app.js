// Script clásico (no módulo) para que funcione abriendo index.html con file://
const { createApp } = Vue

// ⚠️ COMPLETAR: número de WhatsApp de la profesional en formato internacional,
// solo dígitos, sin "+" ni espacios (ej: '5491112345678').
// Mientras esté vacío, WhatsApp abre el selector de contactos con el mensaje ya escrito.
const WHATSAPP_NUMBER = ''

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

const { aIso, desdeIso } = AgendaStore

// Los datos NO se definen acá: vienen de agenda-store.js, la misma fuente que usa el panel.
//
// Sincronización con el panel: cuando el panel guarda (por ejemplo, reserva un turno), esta página
// se entera por el evento `storage` y vuelve a leer la agenda sin recargar. Eso funciona SOLO entre
// pestañas del mismo navegador y mismo origen (localStorage no viaja entre dispositivos). Si la
// nutricionista y el paciente usan equipos distintos no hay sincronización real: para eso hay que
// conectar un backend (Firebase, Supabase o una API) reemplazando cargar()/guardar() en agenda-store.js.
//
// WhatsApp: el botón solo ENVÍA una solicitud. No marca el turno como reservado, porque WhatsApp no
// le devuelve nada a esta aplicación. La reserva la confirma la nutricionista desde el panel.
createApp({
  data() {
    return {
      turnos: AgendaStore.cargar().agenda.turnos,
      ahora: new Date(),
      seleccion: null, // { fecha: '2026-10-07', hora: '17:00' }
      aviso: '', // mensaje breve cuando el horario elegido deja de estar disponible
    }
  },

  computed: {
    // Solo horarios realmente disponibles: estado "disponible", de hoy en adelante y,
    // si es hoy, que todavía no haya pasado. Reservados, cancelados y atendidos no se ofrecen.
    // Forma: [{ fecha: 'AAAA-MM-DD', horarios: ['10:00', '11:30'] }]
    dias() {
      const hoy = aIso(this.ahora)
      const minutosAhora = this.ahora.getHours() * 60 + this.ahora.getMinutes()
      const yaPaso = (hora) => {
        const [h, m] = hora.split(':').map(Number)
        return h * 60 + m <= minutosAhora
      }

      const porFecha = {}
      this.turnos
        .filter((t) => t.estado === 'disponible' && t.fecha >= hoy && !(t.fecha === hoy && yaPaso(t.hora)))
        .forEach((t) => {
          ;(porFecha[t.fecha] = porFecha[t.fecha] || []).push(t.hora)
        })

      return Object.keys(porFecha)
        .sort()
        .map((fecha) => ({ fecha, horarios: porFecha[fecha].sort() }))
    },

    // "Miércoles 7 de octubre · 17:00"
    resumen() {
      if (!this.seleccion) return ''
      return `${this.etiquetaDia(this.seleccion.fecha)} · ${this.seleccion.hora}`
    },

    // https://wa.me/<numero>?text=<mensaje codificado>
    // wa.me abre la app de WhatsApp en el celular y WhatsApp Web / Desktop en la compu.
    enlaceWhatsApp() {
      if (!this.seleccion) return ''
      const { fecha, hora } = this.seleccion
      const dia = this.etiquetaDia(fecha).toLowerCase()
      const mensaje =
        `Hola, quisiera solicitar un turno para el ${dia} de ${desdeIso(fecha).getFullYear()} a las ${hora}. ` +
        'Entiendo que el turno queda sujeto a su confirmación.\n\nMi nombre es: '
      const numero = WHATSAPP_NUMBER.replace(/\D/g, '')
      return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`
    },
  },

  watch: {
    // Si el horario elegido deja de estar disponible (ej: el panel lo reservó), se deselecciona y se avisa
    dias() {
      const s = this.seleccion
      if (s && !this.estaDisponible(s.fecha, s.hora)) {
        this.seleccion = null
        this.mostrarAviso('Este horario ya no está disponible. Elegí otro.')
      }
    },
  },

  mounted() {
    // Si el panel cambia la agenda en otra pestaña del mismo navegador, se refleja acá
    window.addEventListener('storage', (e) => {
      if (e.key === null || e.key === AgendaStore.STORAGE_KEY) this.recargar()
    })
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.recargar()
    })
  },

  methods: {
    // Reemplaza la lista en memoria por la guardada (nunca se duplica la agenda)
    recargar() {
      this.turnos = AgendaStore.cargar().agenda.turnos
      this.ahora = new Date()
    },

    mostrarAviso(texto) {
      this.aviso = texto
      clearTimeout(this.temporizadorAviso)
      this.temporizadorAviso = setTimeout(() => {
        this.aviso = ''
      }, 6000)
    },

    etiquetaDia(fecha) {
      const d = desdeIso(fecha)
      return `${DIAS_SEMANA[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`
    },

    etiquetaRelativa(fecha) {
      const hoy = new Date(this.ahora.getFullYear(), this.ahora.getMonth(), this.ahora.getDate())
      const diferencia = Math.round((desdeIso(fecha) - hoy) / 86400000)
      if (diferencia === 0) return 'Hoy'
      if (diferencia === 1) return 'Mañana'
      return ''
    },

    estaDisponible(fecha, hora) {
      return this.dias.some((d) => d.fecha === fecha && d.horarios.includes(hora))
    },

    estaSeleccionado(fecha, hora) {
      return !!this.seleccion && this.seleccion.fecha === fecha && this.seleccion.hora === hora
    },

    seleccionar(fecha, hora) {
      this.seleccion = { fecha, hora }
      this.aviso = ''
    },

    solicitarTurno() {
      if (!this.enlaceWhatsApp) return
      window.open(this.enlaceWhatsApp, '_blank', 'noopener,noreferrer')
    },
  },
}).mount('#app')
