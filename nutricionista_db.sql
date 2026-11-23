CREATE DATABASE IF NOT EXISTS nutricionista_db;

USE nutricionista_db;

CREATE TABLE pacientes (
    id_paciente INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    telefono VARCHAR(20),
    email VARCHAR(100)
);

ALTER TABLE pacientes
MODIFY COLUMN telefono VARCHAR(20) NOT NULL;

DESCRIBE pacientes;

CREATE TABLE usuarios (
    id_usuario INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL
);

SHOW TABLES;

CREATE TABLE horarios (
    id_horario INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    fecha DATE NOT NULL,
    hora TIME NOT NULL,

    CONSTRAINT fk_horarios_usuarios
        FOREIGN KEY (id_usuario)
        REFERENCES usuarios(id_usuario),

    CONSTRAINT uq_horario_fecha_hora
        UNIQUE (fecha, hora)
);

CREATE TABLE turnos (
    id_turno INT AUTO_INCREMENT PRIMARY KEY,
    id_paciente INT NOT NULL,
    id_horario INT NOT NULL,
    estado ENUM('reservado', 'cancelado', 'atendido')
        NOT NULL DEFAULT 'reservado',
    fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_turnos_pacientes
        FOREIGN KEY (id_paciente)
        REFERENCES pacientes(id_paciente),

    CONSTRAINT fk_turnos_horarios
        FOREIGN KEY (id_horario)
        REFERENCES horarios(id_horario),

    CONSTRAINT uq_turnos_horario
        UNIQUE (id_horario)
);

SELECT
    TABLE_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'nutricionista_db'
  AND REFERENCED_TABLE_NAME IS NOT NULL;
  
  USE nutricionista_db;

INSERT INTO pacientes (nombre, apellido, telefono, email)
VALUES (
    'Lucia',
    'Fernandez',
    '3815551234',
    'lucia@example.com'
);

SELECT * FROM pacientes;

INSERT INTO usuarios (nombre, email, password_hash)
VALUES (
    'Nutricionista Demo',
    'nutricionista@example.com',
    'HASH_FICTICIO_NO_UTILIZAR_EN_PRODUCCION'
);

SELECT id_usuario, nombre, email
FROM usuarios;

INSERT INTO horarios (id_usuario, fecha, hora)
VALUES (
    1,
    '2026-10-19',
    '09:00:00'
);

SELECT * FROM horarios;

INSERT INTO turnos (id_paciente, id_horario, estado)
VALUES (1, 1, 'reservado');

SELECT * FROM turnos;

SELECT
    t.id_turno,
    CONCAT(p.nombre, ' ', p.apellido) AS paciente,
    p.telefono,
    h.fecha,
    h.hora,
    t.estado,
    u.nombre AS nutricionista
FROM turnos t
INNER JOIN pacientes p
    ON t.id_paciente = p.id_paciente
INNER JOIN horarios h
    ON t.id_horario = h.id_horario
INNER JOIN usuarios u
    ON h.id_usuario = u.id_usuario;