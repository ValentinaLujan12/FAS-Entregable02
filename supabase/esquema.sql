-- El Apuntado: esquema de base de datos para Supabase.
-- Pegar completo en Supabase > SQL Editor > New query > Run. Se puede ejecutar varias veces sin romper nada.
-- Seguridad: RLS activado y SIN politicas: solo el servidor (clave secreta en Vercel) puede leer o escribir.
-- La clave publica del navegador no tiene acceso a ninguna tabla.

create table if not exists sala (
  codigo         text primary key check (codigo ~ '^[A-Z0-9]{3,8}$'),
  datos          jsonb not null,
  version        integer not null default 1,
  proximo_en     bigint,
  actualizada_en timestamptz not null default now()
);
create index if not exists ix_sala_actualizada on sala (actualizada_en);

create table if not exists presencia (
  codigo     text not null references sala (codigo) on delete cascade,
  jugador_id text not null,
  visto_en   bigint not null,
  primary key (codigo, jugador_id)
);

create table if not exists buzon (
  id         bigint generated always as identity primary key,
  codigo     text not null references sala (codigo) on delete cascade,
  jugador_id text not null,
  en         bigint not null,
  mensaje    jsonb not null
);
create index if not exists ix_buzon_destino on buzon (codigo, jugador_id, id);

-- Cuentas anonimas del navegador (creditos y skins). Solo se guarda el SHA-256 de la clave.
create table if not exists cuenta (
  clave_hash text primary key check (length(clave_hash) = 64),
  id         text not null,
  saldo      integer not null default 0 check (saldo >= 0),
  inventario jsonb not null default '[]'::jsonb,
  elegidas   jsonb not null default '{}'::jsonb,
  creada_en  timestamptz not null default now()
);

-- Limites anti-abuso (intentos de acceso, creacion de salas). La clave es un hash anonimo, nunca la IP.
create table if not exists limite (
  clave  text primary key,
  desde  timestamptz not null default now(),
  conteo integer not null default 0
);

create or replace function contar_intento(p_clave text, p_ventana_seg integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  insert into limite as l (clave, desde, conteo) values (p_clave, now(), 1)
  on conflict (clave) do update
    set conteo = case when l.desde < now() - make_interval(secs => p_ventana_seg) then 1 else l.conteo + 1 end,
        desde  = case when l.desde < now() - make_interval(secs => p_ventana_seg) then now() else l.desde end
  returning conteo into n;
  delete from limite where desde < now() - interval '1 day';
  return n;
end;
$$;

alter table sala      enable row level security;
alter table presencia enable row level security;
alter table buzon     enable row level security;
alter table cuenta    enable row level security;
alter table limite    enable row level security;

revoke all on function contar_intento(text, integer) from public, anon, authenticated;
grant execute on function contar_intento(text, integer) to service_role;

-- Registro de eventos de auditoria (ADR-09): evidencia para las pruebas con usuarios. Sin IP ni datos personales.
create table if not exists evento (
  id          bigint generated always as identity primary key,
  codigo      text not null references sala (codigo) on delete cascade,
  tipo        text not null,
  ocurrido_en timestamptz not null default now(),
  detalle     jsonb not null default '{}'::jsonb
);
create index if not exists ix_evento_sala on evento (codigo, ocurrido_en);
alter table evento enable row level security;

-- Regla de un solo cierre por ronda (ADR-07/ADR-09): no puede haber dos CIERRE_ACEPTADO de la misma ronda de una partida
-- en una sala. La partida forma parte de la clave porque la revancha (otra partida en la misma sala) reinicia las rondas.
-- (Reemplaza al indice anterior por (codigo, ronda), que rechazaba el primer cierre de cada revancha.)
drop index if exists ux_evento_cierre_ronda;
create unique index if not exists ux_evento_cierre_partida_ronda
  on evento (codigo, coalesce(detalle->>'partida', '1'), (detalle->>'ronda'))
  where tipo = 'CIERRE_ACEPTADO';

-- Escritura atomica de una sala (ADR-07): sala, mensajes de salida y eventos de auditoria (ADR-09) en UNA transaccion.
-- p_version_esperada = 0 significa CREAR la sala (version 1); cualquier otro valor exige que la version actual coincida.
-- Si la version no coincide, o si se repite el cierre de una ronda, no escribe nada y devuelve false (hay que reintentar).
-- p_mensajes: array JSON de { "jugadorId": text, "en": bigint, "m": jsonb }.
-- p_eventos: array JSON de EventoJuego { "seq", "tipo", "ronda", "ts", "datos" }.
drop function if exists guardar_sala_atomica(text, integer, jsonb, bigint, jsonb);
create or replace function guardar_sala_atomica(
  p_codigo text,
  p_version_esperada integer,
  p_datos jsonb,
  p_proximo_en bigint,
  p_mensajes jsonb,
  p_eventos jsonb default '[]'::jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_version_esperada = 0 then
    insert into sala (codigo, datos, version, proximo_en)
    values (p_codigo, p_datos, 1, p_proximo_en)
    on conflict (codigo) do nothing;
    if not found then
      return false;
    end if;
  else
    update sala
       set datos = p_datos,
           version = p_version_esperada + 1,
           proximo_en = p_proximo_en,
           actualizada_en = now()
     where codigo = p_codigo and version = p_version_esperada;
    if not found then
      return false;
    end if;
  end if;
  insert into buzon (codigo, jugador_id, en, mensaje)
  select p_codigo, m->>'jugadorId', (m->>'en')::bigint, m->'m'
    from jsonb_array_elements(coalesce(p_mensajes, '[]'::jsonb)) as m;
  insert into evento (codigo, tipo, detalle)
  select p_codigo, e->>'tipo',
         jsonb_strip_nulls(jsonb_build_object('seq', e->'seq', 'ronda', e->'ronda', 'ts', e->'ts', 'partida', e->'partida'))
           || coalesce(e->'datos', '{}'::jsonb)
    from jsonb_array_elements(coalesce(p_eventos, '[]'::jsonb)) as e;
  return true;
exception
  when unique_violation then
    -- Cierre duplicado de una ronda: se deshace todo y el llamador reintenta con el estado actual.
    return false;
end;
$$;

revoke all on function guardar_sala_atomica(text, integer, jsonb, bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function guardar_sala_atomica(text, integer, jsonb, bigint, jsonb, jsonb) to service_role;

-- ===================================================================================================================
-- Métricas de experiencia para las pruebas con usuarios (extra; src/extras/metricas). Al registrar PARTIDA_FINALIZADA,
-- un disparador resume la partida en partida_registro, que NO depende de sala: el resumen sobrevive a la limpieza de
-- salas caducadas. Se conservan las últimas 100 partidas. Los tiempos salen de los eventos de la propia partida:
--   * turno: diferencia entre TURNO_INICIADO consecutivos (campo ts, reloj del servidor); "humano" excluye a los bots.
--   * latencia del servidor: proceso de cada jugada hasta justo antes de guardar (METRICA_LATENCIA.servidorMs).
--   * latencia del cliente: ida y vuelta medida por el navegador (METRICA_LATENCIA.clienteMs).
-- partida_jugador_registro guarda lo mismo por jugador (se borra en cascada con su partida).
-- ===================================================================================================================
create table if not exists partida_registro (
  id                    bigint generated always as identity primary key,
  codigo                text not null,
  partida               integer not null,
  modalidad             text,
  jugadores             integer,
  humanos               integer,
  ganador_id            text,
  motivo                text,
  rondas                integer,
  turnos                integer,
  turno_promedio_ms     numeric,
  turno_humano_ms       numeric,
  cierres_aceptados     integer,
  cierres_rechazados    integer,
  turnos_expirados      integer,
  servidor_p50_ms       numeric,
  servidor_p95_ms       numeric,
  cliente_p50_ms        numeric,
  cliente_p95_ms        numeric,
  servidor_p99_ms       numeric,
  cliente_p99_ms        numeric,
  muestras_latencia     integer,
  inicio                timestamptz,
  fin                   timestamptz not null default now()
);
-- p99 por partida para FF-32 (tools/ff32-latencia-produccion.ts); se agrega también si la tabla ya existía.
alter table partida_registro add column if not exists servidor_p99_ms numeric;
alter table partida_registro add column if not exists cliente_p99_ms numeric;
create index if not exists ix_partida_registro_fin on partida_registro (fin desc);
alter table partida_registro enable row level security;

-- Detalle por jugador de cada partida registrada (tabla 3.3 del Entregable 03: métricas por usuario).
create table if not exists partida_jugador_registro (
  id                 bigint generated always as identity primary key,
  registro_id        bigint not null references partida_registro (id) on delete cascade,
  jugador_id         text not null,
  nombre             text,
  es_bot             boolean not null default false,
  turnos             integer,
  turno_promedio_ms  numeric,
  cierres_aceptados  integer,
  cierres_rechazados integer,
  turnos_expirados   integer,
  servidor_p50_ms    numeric,
  cliente_p50_ms     numeric,
  cliente_p95_ms     numeric,
  muestras_latencia  integer
);
create index if not exists ix_partida_jugador_registro on partida_jugador_registro (registro_id);
alter table partida_jugador_registro enable row level security;

create or replace function registrar_partida() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partida text := coalesce(new.detalle->>'partida', '1');
  v_inicio timestamptz;
  v_sala jsonb;
  v_bots text[];
  v_id bigint;
begin
  select datos->'sala' into v_sala from sala where codigo = new.codigo;
  select coalesce(array_agg(j->>'id'), '{}') into v_bots
    from jsonb_array_elements(coalesce(v_sala->'jugadores', '[]'::jsonb)) j where (j->>'esBot')::boolean;
  select min(ocurrido_en) into v_inicio
    from evento where codigo = new.codigo and coalesce(detalle->>'partida', '1') = v_partida;

  insert into partida_registro (codigo, partida, modalidad, jugadores, humanos, ganador_id, motivo, rondas, turnos,
    turno_promedio_ms, turno_humano_ms, cierres_aceptados, cierres_rechazados, turnos_expirados,
    servidor_p50_ms, servidor_p95_ms, cliente_p50_ms, cliente_p95_ms, servidor_p99_ms, cliente_p99_ms, muestras_latencia, inicio)
  with ev as (
    select * from evento where codigo = new.codigo and coalesce(detalle->>'partida', '1') = v_partida
  ), turnos as (
    select detalle->>'jugadorId' as jugador,
           lead((detalle->>'ts')::bigint) over (order by (detalle->>'seq')::bigint) - (detalle->>'ts')::bigint as dur
      from ev where tipo = 'TURNO_INICIADO'
  ), lat as (
    select (detalle->>'servidorMs')::numeric as srv, (detalle->>'clienteMs')::numeric as cli
      from evento where codigo = new.codigo and tipo = 'METRICA_LATENCIA' and ocurrido_en >= v_inicio
  )
  select new.codigo, v_partida::integer, v_sala->>'modalidad',
         jsonb_array_length(coalesce(v_sala->'jugadores', '[]'::jsonb)),
         jsonb_array_length(coalesce(v_sala->'jugadores', '[]'::jsonb)) - coalesce(array_length(v_bots, 1), 0),
         new.detalle->>'ganadorId', new.detalle->>'motivo',
         (select max((detalle->>'ronda')::integer) from ev),
         (select count(*) from ev where tipo = 'TURNO_INICIADO'),
         (select round(avg(dur)) from turnos where dur is not null),
         (select round(avg(dur)) from turnos where dur is not null and not (jugador = any(v_bots))),
         (select count(*) from ev where tipo = 'CIERRE_ACEPTADO'),
         (select count(*) from ev where tipo = 'CIERRE_RECHAZADO'),
         (select count(*) from ev where tipo = 'TURNO_EXPIRADO'),
         (select percentile_cont(0.5) within group (order by srv) from lat where srv is not null),
         (select percentile_cont(0.95) within group (order by srv) from lat where srv is not null),
         (select percentile_cont(0.5) within group (order by cli) from lat where cli is not null),
         (select percentile_cont(0.95) within group (order by cli) from lat where cli is not null),
         (select percentile_cont(0.99) within group (order by srv) from lat where srv is not null),
         (select percentile_cont(0.99) within group (order by cli) from lat where cli is not null),
         (select count(*) from lat),
         v_inicio
  returning id into v_id;

  insert into partida_jugador_registro (registro_id, jugador_id, nombre, es_bot, turnos, turno_promedio_ms,
    cierres_aceptados, cierres_rechazados, turnos_expirados, servidor_p50_ms, cliente_p50_ms, cliente_p95_ms, muestras_latencia)
  with ev as (
    select * from evento where codigo = new.codigo and coalesce(detalle->>'partida', '1') = v_partida
  ), turnos as (
    select detalle->>'jugadorId' as jugador,
           lead((detalle->>'ts')::bigint) over (order by (detalle->>'seq')::bigint) - (detalle->>'ts')::bigint as dur
      from ev where tipo = 'TURNO_INICIADO'
  ), lat as (
    select detalle->>'jugadorId' as jugador, (detalle->>'servidorMs')::numeric as srv, (detalle->>'clienteMs')::numeric as cli
      from evento where codigo = new.codigo and tipo = 'METRICA_LATENCIA' and ocurrido_en >= v_inicio
  ), j as (
    select x->>'id' as id, x->>'nombre' as nombre, coalesce((x->>'esBot')::boolean, false) as bot
      from jsonb_array_elements(coalesce(v_sala->'jugadores', '[]'::jsonb)) x
  )
  select v_id, j.id, j.nombre, j.bot,
         (select count(*) from ev where tipo = 'TURNO_INICIADO' and detalle->>'jugadorId' = j.id),
         (select round(avg(dur)) from turnos where dur is not null and jugador = j.id),
         (select count(*) from ev where tipo = 'CIERRE_ACEPTADO' and detalle->>'jugadorId' = j.id),
         (select count(*) from ev where tipo = 'CIERRE_RECHAZADO' and detalle->>'jugadorId' = j.id),
         (select count(*) from ev where tipo = 'TURNO_EXPIRADO' and detalle->>'jugadorId' = j.id),
         (select percentile_cont(0.5) within group (order by srv) from lat where srv is not null and jugador = j.id),
         (select percentile_cont(0.5) within group (order by cli) from lat where cli is not null and jugador = j.id),
         (select percentile_cont(0.95) within group (order by cli) from lat where cli is not null and jugador = j.id),
         (select count(*) from lat where jugador = j.id)
    from j;

  delete from partida_registro where id not in (select id from partida_registro order by id desc limit 100);
  return new;
exception
  when others then
    -- Las métricas son de mejor esfuerzo: un fallo aquí nunca impide guardar el fin de la partida.
    return new;
end;
$$;

drop trigger if exists tr_registrar_partida on evento;
create trigger tr_registrar_partida after insert on evento
  for each row when (new.tipo = 'PARTIDA_FINALIZADA') execute function registrar_partida();

-- Resumen de las últimas 100 partidas para el informe de las pruebas con usuarios (Entregable 03, sección 3.3).
create or replace view v_metricas_partidas with (security_invoker = true) as
select modalidad,
       count(*)                                 as partidas,
       round(avg(turno_humano_ms) / 1000.0, 1)  as turno_humano_promedio_s,
       round(avg(servidor_p50_ms))              as servidor_p50_ms,
       round(avg(servidor_p95_ms))              as servidor_p95_ms,
       round(avg(cliente_p50_ms))               as cliente_p50_ms,
       round(avg(cliente_p95_ms))               as cliente_p95_ms,
       sum(cierres_aceptados)                   as cierres_aceptados,
       sum(cierres_rechazados)                  as cierres_rechazados,
       sum(turnos_expirados)                    as turnos_expirados,
       round(avg(servidor_p99_ms))              as servidor_p99_ms,
       round(avg(cliente_p99_ms))               as cliente_p99_ms
  from partida_registro
 group by modalidad;

