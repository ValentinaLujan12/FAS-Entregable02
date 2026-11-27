# Hoja de registro - Sesión piloto S0 (23/11/2026)

Primer despliegue. Participantes: U01 a U05 y los guías G1 y G2. Partidas cortas de Clásica y Apuntado con bots de
relleno. Latencia guardada en la base de datos: 389 a 800 ms de proceso en el servidor y 570 a 670 ms de ida y vuelta
por comando.

| Usuario | Comentario | Ajuste (Tabla 3.4) | Estado |
|---|---|---|---|
| U02, U03 | "Los botones tardan en responder; hice clic varias veces." | Región alineada, lecturas en paralelo, respuesta antes de los efectos posteriores | Implementado |
| U04 | "No sé si mi clic se registró." | Atenuado al 50 % hasta que el servidor confirma | Implementado |
| U01 | "Quiero poner la carta que robo donde yo quiera." | Robar a una posición de la mano | Implementado |
| U05, U01 | "Retomar el control y Abandonar solo funcionan en mi turno; los bots juegan tan rápido que no veo qué hicieron." | Bots a su hora (0,5 a 2 s robar, 1 a 3 s descartar) | Implementado |
| U04 | "La pantalla de puntajes se pasa muy rápido; no alcanzo a contar." | Liquidación de 60 s con votación "Continuar"; tabla y cartas más grandes | Implementado |
| G1, G2 | Si todos los humanos salen, la partida queda abierta sin terminar. | Pausa de 5 min y fin por abandono registrado | Implementado |
| U02 | "La revancha solo la puede pedir el anfitrión y a veces me saca de la sala." | Revancha para todos en la misma sala; traspaso de anfitrión | Implementado |
