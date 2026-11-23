// Script clásico (no módulo) para que funcione abriendo index.html con file://
const { createApp } = Vue

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

const ESTADOS = {
  disponible: 'Disponible',
  reservado: 'Reservado',
  cancelado: 'Cancelado',
  atendido: 'Atendido',
}

const { aIso, desdeIso, crearTurno } = AgendaStore

const pad = (n) => String(n).padStart(2, '0')

// Opciones base del selector de hora (si un turno tiene otra, se agrega para no perderla)
const HORAS_BASE = Array.from({ length: 15 }, (_, i) => pad(i + 7)) // 07 … 21
const MINUTOS_BASE = ['00', '15', '30', '45']

// "2026-10" + 1 -> "2026-11"
function sumarMes(mes, delta) {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

// "2026-10-31" + 1 -> "2026-11-01"
function sumarDias(iso, delta) {
  const d = desdeIso(iso)
  d.setDate(d.getDate() + delta)
  return aIso(d)
}

const porFechaYHora = (a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora)

// "María Gómez" -> "maria gomez" (búsqueda sin mayúsculas ni tildes)
const normalizar = (texto) =>
  (texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

// { total, disponible, reservado, cancelado, atendido }
function contarEstados(lista) {
  const cuenta = { total: lista.length, disponible: 0, reservado: 0, cancelado: 0, atendido: 0 }
  lista.forEach((t) => cuenta[t.estado]++)
  return cuenta
}

const modalVacio = (modo) => ({
  modo, // 'nuevo' (alta de horario) | 'reservar' (horario libre) | 'editar'
  id: null,
  fecha: '',
  hora: '',
  estado: 'disponible',
  paciente: '',
  telefono: '',
})

// Los datos viven en agenda-store.js (compartido con la web pública).
// Acá solo se guardan en memoria de Vue y se persisten con persistir().
//
// Sincronización: cada cambio se guarda al instante en localStorage ('nutriAgenda'). Otras pestañas
// del MISMO navegador y MISMO origen (la web pública u otro panel) se enteran con el evento `storage`.
// Un paciente en otro dispositivo no ve estos cambios: para eso hace falta un backend (Firebase,
// Supabase o una API propia) que reemplace cargar()/guardar() de agenda-store.js.
// Las solicitudes por WhatsApp tampoco cambian el estado: el turno se marca Reservado desde este panel.
createApp({
  data() {
    const { agenda, origen } = AgendaStore.cargar()
    // Primera vez (o datos dañados): se escribe la agenda inicial para que la web pública vea lo mismo
    if (origen === 'inicial' || origen === 'corrupta') AgendaStore.guardar(agenda)

    let aviso = ''
    if (origen === 'corrupta') aviso = 'Los datos guardados estaban dañados: se cargó la agenda inicial.'
    if (origen === 'sin-storage') aviso = 'Este navegador no permite guardar datos: los cambios se perderán al recargar.'

    const hoy = aIso(new Date())
    return {
      turnos: agenda.turnos, // [{ id, fecha, hora, estado, paciente, telefono }]
      hoyFecha: hoy,
      estados: ESTADOS,

      // --- Estado temporal de pantalla: NO se guarda ---
      diaSeleccionado: hoy, // día que muestra la agenda (AAAA-MM-DD)
      filtroEstado: 'todos', // 'todos' | 'disponible' | 'reservado' | 'cancelado' | 'atendido'
      busqueda: '', // nombre de paciente a buscar en todas las fechas
      toast: '', // confirmación breve después de guardar
      modal: null, // null = cerrado; si no, copia de trabajo del turno (alta o edición)
      errores: {}, // { fecha?, hora?, paciente? }
      confirmandoEliminar: false,
      // Selector de fecha/hora (encima del formulario o, con destino 'dia', para navegar la agenda):
      // { tipo: 'fecha', destino: 'modal'|'dia', valor: 'AAAA-MM-DD'|'', mes: 'AAAA-MM', permitePasado }
      // | { tipo: 'hora', h: 'HH'|'', m: 'MM'|'' }
      picker: null,
      aviso,
    }
  },

  computed: {
    // ---- Agenda del día ----

    turnosDelDia() {
      return this.turnos.filter((t) => t.fecha === this.diaSeleccionado).sort(porFechaYHora)
    },

    resumenDia() {
      return contarEstados(this.turnosDelDia)
    },

    // Lo que se ve en la lista según el filtro elegido
    turnosVisibles() {
      if (this.filtroEstado === 'todos') return this.turnosDelDia
      return this.turnosDelDia.filter((t) => t.estado === this.filtroEstado)
    },

    // Pastillas de resumen que también funcionan como filtro
    opcionesFiltro() {
      const r = this.resumenDia
      return [
        { clave: 'todos', texto: 'Todos', cantidad: r.total },
        { clave: 'disponible', texto: 'Disponibles', cantidad: r.disponible },
        { clave: 'reservado', texto: 'Reservados', cantidad: r.reservado },
        { clave: 'atendido', texto: 'Atendidos', cantidad: r.atendido },
        { clave: 'cancelado', texto: 'Cancelados', cantidad: r.cancelado },
      ].map((op) => (op.cantidad === 1 && op.clave !== 'todos' ? { ...op, texto: op.texto.slice(0, -1) } : op))
    },

    diaEsPasado() {
      return this.diaSeleccionado < this.hoyFecha
    },

    // ---- Búsqueda por paciente (todas las fechas) ----

    buscando() {
      return normalizar(this.busqueda) !== ''
    },

    resultadosBusqueda() {
      if (!this.buscando) return []
      const q = normalizar(this.busqueda)
      return this.turnos
        .filter((t) => t.paciente && normalizar(t.paciente).includes(q))
        .filter((t) => this.filtroEstado === 'todos' || t.estado === this.filtroEstado)
        .sort(porFechaYHora)
    },

    // Fechas con al menos un turno (para marcarlas en el calendario)
    fechasConTurnos() {
      return new Set(this.turnos.map((t) => t.fecha))
    },

    // Cualquier ventana abierta bloquea el desplazamiento de la página
    ventanaAbierta() {
      return this.modal !== null || this.picker !== null
    },

    tituloModal() {
      if (!this.modal) return ''
      if (this.confirmandoEliminar) return 'Eliminar turno'
      return { nuevo: 'Agregar horario', reservar: 'Reservar turno', editar: 'Editar turno' }[this.modal.modo]
    },

    // [{ fecha, turnos: [...], cuenta: { total, disponible, ... } }] solo de fechas posteriores a hoy
    proximosDias() {
      const porFecha = {}
      this.turnos
        .filter((t) => t.fecha > this.hoyFecha)
        .sort(porFechaYHora)
        .forEach((t) => {
          ;(porFecha[t.fecha] = porFecha[t.fecha] || []).push(t)
        })
      return Object.keys(porFecha)
        .sort()
        .map((fecha) => ({ fecha, turnos: porFecha[fecha], cuenta: contarEstados(porFecha[fecha]) }))
    },

    // ---- Selector de fecha ----

    // { titulo, celdas: [null | { iso, dia, pasado, hoy }], puedeRetroceder, enfocable }
    calendario() {
      if (!this.picker || this.picker.tipo !== 'fecha') return null
      const mes = this.picker.mes
      const [y, m] = mes.split('-').map(Number)
      const vacias = (new Date(y, m - 1, 1).getDay() + 6) % 7 // semana de lunes a domingo
      const diasDelMes = new Date(y, m, 0).getDate()

      // Navegando la agenda se pueden consultar días pasados; al cargar turnos, no
      const bloqueaPasado = !this.picker.permitePasado
      const celdas = Array(vacias).fill(null)
      for (let dia = 1; dia <= diasDelMes; dia++) {
        const iso = `${mes}-${pad(dia)}`
        celdas.push({
          iso,
          dia,
          pasado: bloqueaPasado && iso < this.hoyFecha,
          hoy: iso === this.hoyFecha,
          conTurnos: this.fechasConTurnos.has(iso),
        })
      }

      // Un solo día entra en el orden de Tab; las flechas mueven entre días
      const valor = this.picker.valor
      const primeroLibre = celdas.find((c) => c && !c.pasado)
      const enfocable = valor && valor.startsWith(mes) ? valor : primeroLibre ? primeroLibre.iso : null

      const nombreMes = MESES[m - 1]
      return {
        titulo: `${nombreMes[0].toUpperCase()}${nombreMes.slice(1)} ${y}`,
        celdas,
        puedeRetroceder: !bloqueaPasado || mes > this.hoyFecha.slice(0, 7),
        enfocable,
      }
    },

    // ---- Selector de hora ----

    opcionesHora() {
      const h = this.picker && this.picker.h
      return h && !HORAS_BASE.includes(h) ? [...HORAS_BASE, h].sort() : HORAS_BASE
    },

    opcionesMinuto() {
      const m = this.picker && this.picker.m
      return m && !MINUTOS_BASE.includes(m) ? [...MINUTOS_BASE, m].sort() : MINUTOS_BASE
    },

    // "HH:MM" o '' mientras falte la hora o los minutos
    horaPendiente() {
      if (!this.picker || this.picker.tipo !== 'hora' || !this.picker.h || !this.picker.m) return ''
      return `${this.picker.h}:${this.picker.m}`
    },

    // Horas ya usadas en la fecha del formulario (sin contar el turno que se está editando)
    horasOcupadas() {
      if (!this.modal || !this.modal.fecha) return []
      return this.turnos
        .filter((t) => t.fecha === this.modal.fecha && t.id !== this.modal.id)
        .map((t) => t.hora)
        .sort()
    },

    horaPendienteOcupada() {
      return !!this.horaPendiente && this.horasOcupadas.includes(this.horaPendiente)
    },

    mostrarPaciente() {
      if (!this.modal) return false
      return this.modal.modo === 'reservar' || (this.modal.modo === 'editar' && this.modal.estado !== 'disponible')
    },
  },

  watch: {
    // Evita que la agenda se desplace detrás de la ventana abierta
    ventanaAbierta(valor) {
      document.body.classList.toggle('sheet-open', valor)
    },
  },

  mounted() {
    // Cambios hechos en otra pestaña (por ejemplo, otro panel abierto): se toman sin recargar
    window.addEventListener('storage', (e) => {
      if (e.key === null || e.key === AgendaStore.STORAGE_KEY) this.recargarAgenda()
    })
    // Al volver a la pestaña: datos frescos y "Hoy" actualizado si cambió el día
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return
      const nuevoHoy = aIso(new Date())
      if (this.diaSeleccionado === this.hoyFecha) this.diaSeleccionado = nuevoHoy // seguía "Hoy"
      this.hoyFecha = nuevoHoy
      this.recargarAgenda()
    })
  },

  methods: {
    // ---- Formato ----

    // "Miércoles 7 de octubre"
    etiquetaDia(fecha) {
      const d = desdeIso(fecha)
      return `${DIAS_SEMANA[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`
    },

    // "Miércoles 7 de octubre de 2026"
    fechaCompleta(fecha) {
      return `${this.etiquetaDia(fecha)} de ${desdeIso(fecha).getFullYear()}`
    },

    // "4 turnos" / "1 turno"
    textoCantidad(n) {
      return `${n} ${n === 1 ? 'turno' : 'turnos'}`
    },

    // 'Hoy' / 'Mañana' / 'Ayer' / ''
    etiquetaRelativa(fecha) {
      if (fecha === this.hoyFecha) return 'Hoy'
      if (fecha === sumarDias(this.hoyFecha, 1)) return 'Mañana'
      if (fecha === sumarDias(this.hoyFecha, -1)) return 'Ayer'
      return ''
    },

    // "11 5555-0101" -> "1155550101" (para el enlace tel:)
    enlaceTelefono(telefono) {
      return 'tel:' + telefono.replace(/[^\d+]/g, '')
    },

    // Texto completo para lectores de pantalla en cada fila
    descripcionTurno(t, conFecha) {
      const partes = [conFecha ? this.etiquetaDia(t.fecha) : null, t.hora, this.etiquetaEstado(t.estado), t.paciente]
      return partes.filter(Boolean).join(', ')
    },

    etiquetaEstado(estado) {
      return ESTADOS[estado]
    },

    esSeleccionado(turno) {
      return !!this.modal && this.modal.id === turno.id
    },

    // ---- Navegación entre días ----

    irADia(fecha) {
      this.diaSeleccionado = fecha
      this.limpiarBusqueda()
      this.$nextTick(() => {
        const titulo = document.getElementById('dia-titulo')
        if (titulo) titulo.scrollIntoView({ block: 'nearest' })
      })
    },

    moverDia(delta) {
      this.irADia(sumarDias(this.diaSeleccionado, delta))
    },

    irAHoy() {
      this.irADia(this.hoyFecha)
    },

    elegirFiltro(clave) {
      this.filtroEstado = clave
    },

    limpiarBusqueda() {
      this.busqueda = ''
    },

    mostrarToast(texto) {
      this.toast = texto
      clearTimeout(this.temporizadorToast)
      this.temporizadorToast = setTimeout(() => {
        this.toast = ''
      }, 3500)
    },

    // ---- Persistencia ----

    // Guarda solo la lista de turnos (nunca modal, errores ni selección)
    // Reemplaza la lista en memoria por la guardada (nunca se duplica la agenda).
    // Si lo guardado falta o está dañado, se conserva lo que hay en pantalla.
    recargarAgenda() {
      const { agenda, origen } = AgendaStore.cargar()
      if (origen === 'guardada') this.turnos = agenda.turnos
    },

    persistir() {
      const ok = AgendaStore.guardar({ turnos: this.turnos })
      this.aviso = ok ? '' : 'No se pudo guardar: los cambios se perderán al recargar la página.'
    },

    // ---- Ventana (agregar / editar comparten la misma) ----

    abrirModal(datos) {
      this.ultimoFoco = document.activeElement
      this.errores = {}
      this.confirmandoEliminar = false
      this.modal = datos
      this.enfocarVentana()
    },

    enfocarVentana() {
      this.$nextTick(() => this.$refs.hoja && this.$refs.hoja.focus())
    },

    // Botón "+ Agregar horario": propone el día que se está viendo (si no es pasado)
    abrirFormularioHorario() {
      const datos = modalVacio('nuevo')
      if (!this.diaEsPasado) datos.fecha = this.diaSeleccionado
      this.abrirModal(datos)
    },

    // Tocar un turno: si está libre (y no pasó el día) se reserva; si no, se edita
    abrirTurno(turno) {
      if (turno.estado === 'disponible' && turno.fecha >= this.hoyFecha) this.reservarTurno(turno)
      else this.editarTurno(turno)
    },

    reservarTurno(turno) {
      this.abrirModal({
        modo: 'reservar',
        id: turno.id,
        fecha: turno.fecha,
        hora: turno.hora,
        estado: 'reservado', // al guardar, el horario queda reservado
        paciente: '',
        telefono: '',
      })
      this.$nextTick(() => {
        const campo = document.getElementById('turno-paciente')
        if (campo) campo.focus()
      })
    },

    // Desde "Reservar turno": pasar a la edición completa (cambiar hora, eliminar el horario)
    pasarAEdicion() {
      const turno = this.turnos.find((t) => t.id === this.modal.id)
      if (!turno) return this.cerrarModal()
      const foco = this.ultimoFoco
      this.editarTurno(turno)
      this.ultimoFoco = foco
    },

    editarTurno(turno) {
      this.abrirModal({
        modo: 'editar',
        id: turno.id,
        fecha: turno.fecha,
        hora: turno.hora,
        estado: turno.estado,
        paciente: turno.paciente || '',
        telefono: turno.telefono || '',
      })
    },

    cerrarModal() {
      this.picker = null
      this.modal = null
      this.errores = {}
      this.confirmandoEliminar = false

      const foco = this.ultimoFoco
      this.ultimoFoco = null
      if (foco && document.contains(foco)) foco.focus()
    },

    limpiarErrores() {
      this.errores = {}
    },

    // ---- Selectores propios de fecha y hora ----

    // Fecha del formulario: no admite días pasados
    abrirSelectorFecha() {
      const valor = this.modal.fecha >= this.hoyFecha ? this.modal.fecha : ''
      this.picker = { tipo: 'fecha', destino: 'modal', valor, mes: (valor || this.hoyFecha).slice(0, 7), permitePasado: false }
      this.enfocarEnSelector(['.cal__day[tabindex="0"]'])
    },

    // Fecha de la agenda: se puede ir a cualquier día, también pasados (solo consulta)
    abrirSelectorDia() {
      const valor = this.diaSeleccionado
      this.picker = { tipo: 'fecha', destino: 'dia', valor, mes: valor.slice(0, 7), permitePasado: true }
      this.enfocarEnSelector(['.cal__day[tabindex="0"]'])
    },

    abrirSelectorHora() {
      const [h, m] = this.modal.hora ? this.modal.hora.split(':') : ['', '']
      this.picker = { tipo: 'hora', h, m }
      this.enfocarEnSelector(['.chip--selected', '.chip'])
    },

    // Enfoca el primer elemento que exista según el orden de preferencia de `selectores`
    enfocarEnSelector(selectores) {
      this.$nextTick(() => {
        const caja = this.$refs.picker
        if (!caja) return
        const el = selectores.map((s) => caja.querySelector(s)).find(Boolean)
        ;(el || caja).focus()
      })
    },

    // Cierra sin tocar el formulario y devuelve el foco al campo que lo abrió
    cerrarSelector() {
      if (!this.picker) return
      const campo = this.picker.destino === 'dia' ? 'agenda-elegir-fecha' : this.picker.tipo === 'fecha' ? 'turno-fecha' : 'turno-hora'
      this.picker = null
      this.$nextTick(() => {
        const el = document.getElementById(campo)
        if (el) el.focus()
      })
    },

    // Único punto donde el selector escribe en el formulario
    confirmarSelector() {
      const p = this.picker
      if (p.destino === 'dia') {
        if (!p.valor) return
        this.cerrarSelector()
        this.irADia(p.valor)
        return
      }
      if (p.tipo === 'fecha') {
        if (!p.valor || p.valor < this.hoyFecha) return
        this.modal.fecha = p.valor // AAAA-MM-DD
      } else {
        if (!this.horaPendiente) return
        this.modal.hora = this.horaPendiente // HH:MM
      }
      this.limpiarErrores()
      this.cerrarSelector()
    },

    cambiarMes(delta) {
      const mes = sumarMes(this.picker.mes, delta)
      if (!this.picker.permitePasado && mes < this.hoyFecha.slice(0, 7)) return
      this.picker.mes = mes
    },

    elegirDia(iso) {
      if (!this.picker.permitePasado && iso < this.hoyFecha) return
      this.picker.valor = iso
    },

    // Flechas: ±1 día / ±1 semana; Inicio/Fin: principio/fin de semana. Cambia de mes si hace falta.
    moverConTeclado(e) {
      const pasos = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
      const actual = e.target.dataset && e.target.dataset.iso
      if (!actual) return

      let destino
      if (e.key in pasos) {
        destino = sumarDias(actual, pasos[e.key])
      } else if (e.key === 'Home' || e.key === 'End') {
        const diaSemana = (desdeIso(actual).getDay() + 6) % 7
        destino = sumarDias(actual, e.key === 'Home' ? -diaSemana : 6 - diaSemana)
      } else {
        return
      }
      e.preventDefault()
      if (!this.picker.permitePasado && destino < this.hoyFecha) destino = this.hoyFecha

      this.picker.valor = destino
      this.picker.mes = destino.slice(0, 7)
      this.$nextTick(() => {
        const el = this.$refs.picker && this.$refs.picker.querySelector(`[data-iso="${destino}"]`)
        if (el) el.focus()
      })
    },

    elegirHora(h) {
      this.picker.h = h
      if (!this.picker.m) this.picker.m = '00' // un toque alcanza para una hora en punto
    },

    elegirMinuto(m) {
      this.picker.m = m
    },

    elegirEstado(estado) {
      this.modal.estado = estado
      this.errores = {}
      // Un horario libre no tiene paciente
      if (estado === 'disponible') {
        this.modal.paciente = ''
        this.modal.telefono = ''
      }
      // Al reservar, el cursor va directo al nombre si todavía está vacío
      if (estado === 'reservado' && !this.modal.paciente.trim()) {
        this.$nextTick(() => {
          const campo = document.getElementById('turno-paciente')
          if (campo) campo.focus()
        })
      }
    },

    // Devuelve { campo: mensaje }
    validar() {
      const { modo, id, fecha, hora, estado, paciente } = this.modal
      const errores = {}
      const original = id ? this.turnos.find((t) => t.id === id) : null

      // Las fechas ISO (AAAA-MM-DD) se comparan bien como texto.
      // Un turno de un día pasado se puede seguir editando (por ejemplo, marcarlo atendido)
      // mientras no se mueva de fecha; lo que no se permite es crear o mover turnos al pasado.
      const mueveAlPasado = fecha < this.hoyFecha && (modo !== 'editar' || !original || fecha !== original.fecha)
      if (!fecha) {
        errores.fecha = 'La fecha es obligatoria.'
      } else if (modo === 'reservar' && fecha < this.hoyFecha) {
        errores.fecha = 'Este horario es de un día anterior: no se puede reservar.'
      } else if (mueveAlPasado) {
        errores.fecha = 'No se puede usar una fecha anterior a hoy.'
      }

      if (!hora) {
        errores.hora = 'La hora es obligatoria.'
      } else if (!errores.fecha && this.turnos.some((t) => t.id !== id && t.fecha === fecha && t.hora === hora)) {
        errores.hora = `Ya existe un turno el ${this.etiquetaDia(fecha)} a las ${hora}.`
      }

      if (estado === 'reservado' && !paciente.trim()) {
        errores.paciente = 'Ingresá el nombre del paciente.'
      }

      return errores
    },

    guardarModal() {
      this.errores = this.validar()
      const conError = ['fecha', 'hora', 'paciente'].find((campo) => this.errores[campo])
      if (conError) {
        // Lleva el foco al primer campo a corregir
        this.$nextTick(() => {
          const el = document.getElementById(`turno-${conError}`)
          if (el) el.focus()
        })
        return
      }

      const { modo, id, fecha, hora, estado, paciente, telefono } = this.modal
      let mensaje

      if (modo === 'nuevo') {
        // Siempre disponible, sin paciente ni teléfono, con id único
        this.turnos.push(crearTurno(fecha, hora))
        mensaje = `Horario agregado: ${this.etiquetaDia(fecha).toLowerCase()} a las ${hora}.`
      } else {
        // 'reservar' y 'editar' actualizan el mismo turno ('reservar' llega con estado 'reservado')
        const turno = this.turnos.find((t) => t.id === id)
        if (!turno) return this.cerrarModal()
        const reprogramado = turno.fecha !== fecha || turno.hora !== hora
        turno.fecha = fecha
        turno.hora = hora
        turno.estado = estado
        turno.paciente = estado === 'disponible' ? null : paciente.trim() || null
        turno.telefono = estado === 'disponible' ? null : telefono.trim() || null

        if (modo === 'reservar') mensaje = `Turno reservado: ${turno.paciente}, ${hora}.`
        else if (reprogramado) mensaje = `Turno reprogramado: ${this.etiquetaDia(fecha).toLowerCase()} a las ${hora}.`
        else mensaje = 'Cambios guardados.'
      }

      this.persistir()
      this.cerrarModal()
      // Un horario nuevo se muestra en su día para verlo enseguida
      if (modo === 'nuevo' && fecha !== this.diaSeleccionado) this.irADia(fecha)
      this.mostrarToast(mensaje)
    },

    pedirConfirmacionEliminar() {
      this.confirmandoEliminar = true
      this.enfocarVentana()
    },

    cancelarEliminar() {
      this.confirmandoEliminar = false
      this.enfocarVentana()
    },

    eliminar() {
      this.turnos = this.turnos.filter((t) => t.id !== this.modal.id)
      this.persistir()
      this.cerrarModal()
      this.mostrarToast('Turno eliminado.')
    },

    // Mantiene el foco dentro de la ventana indicada ('hoja' o 'picker') al navegar con Tab
    atraparTab(e, ref) {
      const hoja = this.$refs[ref]
      if (!hoja) return
      const foco = [...hoja.querySelectorAll('button, input')].filter(
        (el) => !el.disabled && el.tabIndex !== -1 && el.offsetParent !== null,
      )
      if (!foco.length) return
      const primero = foco[0]
      const ultimo = foco[foco.length - 1]
      const activo = document.activeElement

      if (e.shiftKey && (activo === primero || activo === hoja)) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && activo === ultimo) {
        e.preventDefault()
        primero.focus()
      }
    },
  },
}).mount('#app')
