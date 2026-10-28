-- =====================================================================
-- V1__esquema.sql  -  Esquema relacional del Sistema "El Apuntado"
-- Fuente: Entregable 2, Sección 2 (Figuras 2.2.1 y 2.2.2, Tabla 2.2.2)
--         y Sección 2.4 (índice parcial, triggers y vistas).
-- Motor: PostgreSQL >= 13 (ADR-04). Migración versionada (Flyway).
-- =====================================================================

CREATE TABLE modalidad (
    codigo_modalidad    VARCHAR(20)  PRIMARY KEY,
    nombre              VARCHAR(60)  NOT NULL,
    acumulativa         BOOLEAN      NOT NULL,
    umbral_eliminacion  INTEGER      NULL,
    parametros          JSONB        NOT NULL DEFAULT '{}'::jsonb,
    -- umbral nulo o > 0, y solo si la modalidad es acumulativa (Tabla 2.2.2)
    CONSTRAINT ck_modalidad_umbral CHECK (
        (umbral_eliminacion IS NULL OR umbral_eliminacion > 0)
        AND (umbral_eliminacion IS NULL OR acumulativa)
    )
);

CREATE TABLE jugador (
    id_jugador  UUID         PRIMARY KEY,
    alias       VARCHAR(40)  NOT NULL,
    creado_en   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_jugador_alias UNIQUE (alias)
);

CREATE TABLE partida (
    id_partida         UUID         PRIMARY KEY,
    codigo_invitacion  CHAR(6)      NOT NULL,
    codigo_modalidad   VARCHAR(20)  NOT NULL REFERENCES modalidad (codigo_modalidad),
    id_host            UUID         NOT NULL REFERENCES jugador (id_jugador),
    estado             VARCHAR(12)  NOT NULL,
    creada_en          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    iniciada_en        TIMESTAMPTZ  NULL,
    finalizada_en      TIMESTAMPTZ  NULL,
    version            INTEGER      NOT NULL DEFAULT 0,
    CONSTRAINT uq_partida_codigo UNIQUE (codigo_invitacion),
    CONSTRAINT ck_partida_estado CHECK (estado IN ('EN_ESPERA', 'EN_CURSO', 'FINALIZADA'))
);

CREATE TABLE partida_jugador (
    id_participacion  UUID         PRIMARY KEY,
    id_partida        UUID         NOT NULL REFERENCES partida (id_partida),
    id_jugador        UUID         NOT NULL REFERENCES jugador (id_jugador),
    orden_turno       SMALLINT     NOT NULL,
    estado            VARCHAR(12)  NOT NULL DEFAULT 'ACTIVO',
    posicion_final    SMALLINT     NULL,
    unido_en          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_pj_partida_jugador UNIQUE (id_partida, id_jugador),
    CONSTRAINT uq_pj_partida_orden   UNIQUE (id_partida, orden_turno),
    CONSTRAINT ck_pj_orden  CHECK (orden_turno BETWEEN 1 AND 6),
    CONSTRAINT ck_pj_estado CHECK (estado IN ('ACTIVO', 'ELIMINADO', 'DESCONECTADO'))
);

CREATE TABLE ronda (
    id_ronda          UUID         PRIMARY KEY,
    id_partida        UUID         NOT NULL REFERENCES partida (id_partida),
    numero_ronda      SMALLINT     NOT NULL,
    estado            VARCHAR(10)  NOT NULL DEFAULT 'EN_CURSO',
    semilla_barajado  BIGINT       NOT NULL,
    iniciada_en       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    cerrada_en        TIMESTAMPTZ  NULL,
    version           INTEGER      NOT NULL DEFAULT 0,
    CONSTRAINT uq_ronda_numero UNIQUE (id_partida, numero_ronda),
    CONSTRAINT ck_ronda_estado CHECK (estado IN ('EN_CURSO', 'CERRADA'))
);

CREATE TABLE mano_jugador (
    id_mano           UUID     PRIMARY KEY,
    id_ronda          UUID     NOT NULL REFERENCES ronda (id_ronda),
    id_participacion  UUID     NOT NULL REFERENCES partida_jugador (id_participacion),
    version           INTEGER  NOT NULL DEFAULT 0,
    CONSTRAINT uq_mano_ronda_participacion UNIQUE (id_ronda, id_participacion)
);

CREATE TABLE carta (
    codigo_carta  VARCHAR(3)  PRIMARY KEY,
    palo          VARCHAR(8)  NOT NULL,
    rango         SMALLINT    NOT NULL,
    CONSTRAINT ck_carta_palo  CHECK (palo IN ('PICA', 'CORAZON', 'DIAMANTE', 'TREBOL')),
    CONSTRAINT ck_carta_rango CHECK (rango BETWEEN 1 AND 13)
);

CREATE TABLE ronda_carta (
    id_ronda      UUID        NOT NULL REFERENCES ronda (id_ronda),
    codigo_carta  VARCHAR(3)  NOT NULL REFERENCES carta (codigo_carta),
    zona          VARCHAR(5)  NOT NULL,
    id_mano       UUID        NULL REFERENCES mano_jugador (id_mano),
    posicion      SMALLINT    NOT NULL,
    CONSTRAINT pk_ronda_carta PRIMARY KEY (id_ronda, codigo_carta),
    CONSTRAINT ck_rc_zona CHECK (zona IN ('MAZO', 'POZO', 'MANO')),
    CONSTRAINT ck_rc_zona_mano CHECK ((zona = 'MANO') = (id_mano IS NOT NULL))
);

CREATE TABLE turno_jugada (
    id_jugada             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_ronda              UUID         NOT NULL REFERENCES ronda (id_ronda),
    numero_turno          SMALLINT     NOT NULL,
    secuencia             SMALLINT     NOT NULL,
    id_participacion      UUID         NOT NULL REFERENCES partida_jugador (id_participacion),
    tipo_accion           VARCHAR(16)  NOT NULL,
    codigo_carta          VARCHAR(3)   NULL REFERENCES carta (codigo_carta),
    resultado_validacion  VARCHAR(24)  NULL,
    ocurrida_en           TIMESTAMPTZ  NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_tj_turno UNIQUE (id_ronda, numero_turno, secuencia),
    CONSTRAINT ck_tj_tipo CHECK (tipo_accion IN ('ROBO_MAZO', 'ROBO_POZO', 'DESCARTE', 'DESCARTE_AUTO', 'CIERRE')),
    CONSTRAINT ck_tj_resultado CHECK (resultado_validacion IN ('VALIDO', 'COMBINACION_INVALIDA', 'SOBRANTE_EXCEDIDO')),
    -- resultado_validacion solo si la jugada es un cierre (Tabla 2.2.2)
    CONSTRAINT ck_tj_resultado_solo_cierre CHECK ((tipo_accion = 'CIERRE') = (resultado_validacion IS NOT NULL))
);

CREATE TABLE puntaje_acumulado (
    id_ronda              UUID     NOT NULL REFERENCES ronda (id_ronda),
    id_participacion      UUID     NOT NULL REFERENCES partida_jugador (id_participacion),
    penalizacion_ronda    INTEGER  NOT NULL,
    acumulado_tras_ronda  INTEGER  NOT NULL,
    CONSTRAINT pk_puntaje_acumulado PRIMARY KEY (id_ronda, id_participacion),
    CONSTRAINT ck_pa_penalizacion CHECK (penalizacion_ronda >= 0),
    CONSTRAINT ck_pa_acumulado    CHECK (acumulado_tras_ronda >= 0)
);

-- ---------------------------------------------------------------------
-- Sección 2.4: un solo cierre válido por ronda
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX ux_cierre_valido ON turno_jugada (id_ronda)
    WHERE tipo_accion = 'CIERRE' AND resultado_validacion = 'VALIDO';

-- ---------------------------------------------------------------------
-- Sección 2.4: no admitir jugadas en una ronda que no esté EN_CURSO
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_ronda_abierta() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e text;
BEGIN
    SELECT estado INTO e FROM ronda WHERE id_ronda = NEW.id_ronda FOR SHARE;
    IF e IS DISTINCT FROM 'EN_CURSO' THEN
        RAISE EXCEPTION 'ronda % no esta EN_CURSO (estado=%)', NEW.id_ronda, e USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_turno_ronda_abierta BEFORE INSERT ON turno_jugada
    FOR EACH ROW EXECUTE FUNCTION fn_ronda_abierta();

-- ---------------------------------------------------------------------
-- Sección 2.2.2 / 2.4: la participación pertenece a la partida de la ronda
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_misma_partida() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF (SELECT id_partida FROM ronda WHERE id_ronda = NEW.id_ronda)
       IS DISTINCT FROM
       (SELECT id_partida FROM partida_jugador WHERE id_participacion = NEW.id_participacion) THEN
        RAISE EXCEPTION 'participacion % ajena a la ronda %', NEW.id_participacion, NEW.id_ronda
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_turno_misma_partida BEFORE INSERT OR UPDATE ON turno_jugada
    FOR EACH ROW EXECUTE FUNCTION fn_misma_partida();
CREATE TRIGGER trg_mano_misma_partida BEFORE INSERT OR UPDATE ON mano_jugador
    FOR EACH ROW EXECUTE FUNCTION fn_misma_partida();
CREATE TRIGGER trg_puntaje_misma_partida BEFORE INSERT OR UPDATE ON puntaje_acumulado
    FOR EACH ROW EXECUTE FUNCTION fn_misma_partida();

-- ---------------------------------------------------------------------
-- Sección 2.2.3: ganadores derivados (no almacenados)
-- ---------------------------------------------------------------------
CREATE VIEW v_ronda_ganador AS
SELECT r.id_partida, r.id_ronda, r.numero_ronda, tj.id_participacion AS id_participacion_ganadora
FROM ronda r
JOIN turno_jugada tj ON tj.id_ronda = r.id_ronda
WHERE tj.tipo_accion = 'CIERRE' AND tj.resultado_validacion = 'VALIDO';

CREATE VIEW v_marcador AS
SELECT pj.id_partida,
       pj.id_participacion,
       j.alias,
       pj.estado,
       pj.posicion_final,
       COALESCE((SELECT pa.acumulado_tras_ronda
                   FROM puntaje_acumulado pa
                   JOIN ronda r ON r.id_ronda = pa.id_ronda
                  WHERE pa.id_participacion = pj.id_participacion
                  ORDER BY r.numero_ronda DESC
                  LIMIT 1), 0) AS acumulado
FROM partida_jugador pj
JOIN jugador j ON j.id_jugador = pj.id_jugador;
