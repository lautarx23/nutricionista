# Nutricionista

**Integrante:** Lautaro Cejas

Sitio web para un consultorio de nutrición. Tiene una web pública para los pacientes y un panel de administración (NutriPanel) para que la nutricionista gestione su agenda de turnos.

## Qué incluye

- **Web pública** (`index.html`): los pacientes ven los horarios disponibles y piden su turno por WhatsApp.
- **Panel de administración** (`panel-admin/`): la nutricionista ve la agenda por día, un resumen del día y los próximos días. Puede agregar horarios, reservar, editar y cancelar turnos, marcarlos como atendidos y buscar pacientes por nombre.
- **Agenda compartida** (`agenda-store.js`): guarda los turnos y los comparte entre la web pública y el panel.
- **Base de datos** (`nutricionista_db.sql`): modelo en MySQL con datos de ejemplo.

## Tecnologías

- HTML, CSS y JavaScript
- Vue 3 (cargado desde CDN)
- MySQL
- localStorage del navegador

## Cómo probarlo

1. Descargar el proyecto con el botón verde **Code → Download ZIP** y descomprimirlo.
2. Abrir `index.html` en el navegador para ver la web pública.
3. Abrir `panel-admin/index.html` para entrar al panel.

Los cambios hechos en el panel se ven en la web pública si las dos páginas se abren en el mismo navegador.

## Base de datos

Para crearla, abrir `nutricionista_db.sql` en MySQL Workbench y ejecutar el script completo. Se crea la base `nutricionista_db` con cuatro tablas:

| Tabla | Qué guarda |
|---|---|
| `pacientes` | Nombre, apellido, teléfono y email de cada paciente |
| `usuarios` | Usuarios del panel (la nutricionista), con contraseña encriptada |
| `horarios` | Fechas y horas que la nutricionista habilita para atender |
| `turnos` | Qué paciente reservó cada horario y su estado: reservado, cancelado o atendido |

Relaciones:

- Cada horario pertenece a un usuario (la nutricionista).
- Cada turno une a un paciente con un horario.
- Un horario no puede tener más de un turno, y no puede haber dos horarios con la misma fecha y hora.

## Próximos pasos

Por ahora la agenda se guarda en el navegador (localStorage). La base de datos MySQL ya está diseñada; el siguiente paso es conectarla a la web con un backend para que los turnos se vean desde cualquier dispositivo.
