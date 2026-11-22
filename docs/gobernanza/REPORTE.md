# Reporte de gobernanza arquitectónica

Generado: 2026-11-22T14:19:36.955Z con `npm run gobernanza:reporte`.
Resultado global: **todas las funciones bloqueantes se cumplen**.

## Tipos estrictos

Comando: `npm run typecheck` - resultado: **OK**

```text

```

## FF-01 a FF-09, FF-27: reglas de dependencias

Comando: `npm run deps` - resultado: **OK**

```text
✔ no dependency violations found (79 modules, 267 dependencies cruised)
```

## Sondas de las reglas de dependencias

Comando: `npm run deps:sondas` - resultado: **OK**

```text
Sondas de dependencias OK: las 15 reglas detectan su violación
```

## FF-10: complejidad ciclomática del núcleo

Comando: `npm run cc` - resultado: **OK**

```text

```

## FF-31: aserciones en todas las pruebas

Comando: `npm run aserciones` - resultado: **OK**

```text
FF-31 OK: 216 bloques it/test, todos con al menos una aserción
```

## FF-30: métricas de modularidad

Comando: `npm run metricas -- --json docs/gobernanza/metricas-modulos.json` - resultado: **OK**

```text
Módulo        Arch  Ca  Ce   I     A     D     Tipo          Estado
deck             4   3   1  0.25  0.22  0.53  base estable  cumple
estado           1   3   3  0.50  0.00  0.50  núcleo        cumple
extras          15   2   5  0.71  0.10  0.18  informativo   cumple
game             5   2   8  0.80  0.69  0.49  núcleo        cumple
infra            4   2   3  0.60  0.40  0.00  núcleo        cumple
kernel           6  10   0  0.00  0.00  1.00  base estable  cumple
persistence      6   3   2  0.40  0.50  0.10  núcleo        cumple
player           3   3   0  0.00  0.33  0.67  base estable  cumple
rules            7   4   1  0.20  0.38  0.42  base estable  cumple
scoring          3   1   2  0.67  0.33  0.00  núcleo        cumple
serverless       5   0   7  1.00  0.08  0.08  núcleo        cumple
web             14   1   2  0.67  0.06  0.27  informativo   cumple

Sin ciclos entre módulos del núcleo.
FF-30 OK: D <= 0.5 en los módulos del núcleo; base estable reportada (deck, kernel, player, rules)
```

## FF-16: latencia de validación

Comando: `npm run latencia -- --json docs/gobernanza/latencia.json` - resultado: **OK**

```text
Escenario                         Manos   p50 (ms)  p99 (ms)  máx (ms)
CLASICA - aleatorias               2000     0.471     0.894     3.796
CLASICA - adversas                    5     1.714     3.962     3.962
APUNTADO - aleatorias              2000     0.296     0.513     4.701
APUNTADO - adversas                   5     0.346     1.191     1.191
APUNTADO estricto - aleatorias     2000     0.444     0.713     2.084
APUNTADO estricto - adversas          5     1.155     2.728     2.728
```

## Pruebas y cobertura (FF-11 a FF-29, FF-15)

Comando: `npm run test:cov -- --coverage.reporter=text-summary` - resultado: **OK**

```text
RUN  v5.1.1 /home/claude/w/repo
      Coverage enabled with v8


 Test Files  20 passed (20)
      Tests  240 passed (240)
   Start at  09:18:10
   Duration  28.26s (tests 97%, import 2%, worker 1%)

    Isolate  20 workers spawned · ~81ms startup each (spawn + environment, per file)
             at least ~1.53s faster with isolate: false — reuses workers across files instead of one per file

 % Coverage report from v8

=============================== Coverage summary ===============================
Statements   : 37.88% ( 2220/5860 )
Branches     : 36.51% ( 1326/3631 )
Functions    : 46.94% ( 629/1340 )
Lines        : 37.73% ( 1808/4791 )
================================================================================
```

## Protocolo HTTP de punta a punta

Comando: `npm run test:e2e` - resultado: **OK**

```text
[1] Acceso
  ok - sin cookie no se puede jugar (401)
  ok - contraseña errónea: 401
  ok - usuario inexistente: 401 (mismo mensaje)
  ok - POST sin Origin propio: 403 (anti-CSRF)
  ok - acceso correcto (usuario sin distinguir mayúsculas)
  ok - cookie manipulada: 401

[2] Sala real compartida
  ok - cuenta anónima creada (créditos)
  ok - sala creada (ASHRR)
  ok - Beto se une desde otro cliente con el código
  ok - Ana ve a Beto sin recargar (buzón)
  ok - solo el anfitrión inicia
  ok - manos repartidas
  ok - Beto nunca recibe cartas de la mano de Ana
  ok - ningún mensaje lleva tokens, hashes ni IPs

[3] Turnos, bots y fin de partida
  ok - un token falso no puede jugar
  ok - la partida termina con podio de 3 (incluye bot)

[4] Presencia y reconexión
  ok - recargar la página recupera el asiento con el token
  ok - revancha vuelve a la sala

E2E HTTP OK - 18 verificaciones
```

## Complejidad de la interfaz web y los extras (informativo)

Comando: `npm run cc:ui` - resultado: **OK**

```text

/home/claude/w/repo/src/extras/web/sonido.ts
   72:3  warning  Constructor has a complexity of 11. Maximum allowed is 10          complexity
  304:3  warning  Method 'tocar' has a complexity of 19. Maximum allowed is 10       complexity
  393:3  warning  Method 'celebrar' has a complexity of 12. Maximum allowed is 10    complexity
  448:3  warning  Method 'sintetizar' has a complexity of 26. Maximum allowed is 10  complexity

/home/claude/w/repo/src/web/dom.ts
  4:8  warning  Function 'h' has a complexity of 18. Maximum allowed is 10  complexity

/home/claude/w/repo/src/web/estado.ts
  95:3  warning  Method 'textoEvento' has a complexity of 26. Maximum allowed is 10  complexity

/home/claude/w/repo/src/web/main.ts
  112:48  warning  Arrow function has a complexity of 17. Maximum allowed is 10  complexity

/home/claude/w/repo/src/web/mesa.ts
   301:3   warning  Method 'eventos' has a complexity of 31. Maximum allowed is 10              complexity
   413:3   warning  Method 'sincronizarMano' has a complexity of 17. Maximum allowed is 10      complexity
   642:3   warning  Method 'teclaAbajo' has a complexity of 32. Maximum allowed is 10           complexity
   750:44  warning  Arrow function has a complexity of 11. Maximum allowed is 10                complexity
   874:3   warning  Method 'objetivos' has a complexity of 18. Maximum allowed is 10            complexity
   893:27  warning  Arrow function has a complexity of 13. Maximum allowed is 10                complexity
  1016:3   warning  Method 'render' has a complexity of 17. Maximum allowed is 10               complexity
  1112:3   warning  Method 'posicionarFlotantes' has a complexity of 15. Maximum allowed is 10  complexity
  1314:3   warning  Method 'marcarZonas' has a complexity of 12. Maximum allowed is 10          complexity
  1338:3   warning  Method 'pintarPlaquetas' has a complexity of 25. Maximum allowed is 10      complexity
  1480:3   warning  Method 'pintarVotacion' has a complexity of 12. Maximum allowed is 10       complexity
  1518:3   warning  Method 'tick' has a complexity of 21. Maximum allowed is 10                 complexity

/home/claude/w/repo/src/web/net.ts
  129:3  warning  Async method 'peticion' has a complexity of 17. Maximum allowed is 10  complexity

/home/claude/w/repo/src/web/overlays.ts
  60:39  warning  Arrow function has a complexity of 16. Maximum allowed is 10  complexity

/home/claude/w/repo/src/web/sala.ts
  59:27  warning  Arrow function has a complexity of 19. Maximum allowed is 10  complexity

✖ 28 problems (0 errors, 28 warnings)
```
