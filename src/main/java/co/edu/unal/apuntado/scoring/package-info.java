/**
 * Módulo scoring (ScoringDomain, Tabla 1.2.1): penalizaciones, acumulado y umbral según ParametrosModalidad.
 * Depende solo de rules (ICalculadorPuntos) y kernel (FF-03). Es puro: calcula en memoria y devuelve el
 * resultado al orquestador, que lo persiste (sin llamar de vuelta a game, ADR-01).
 */
package co.edu.unal.apuntado.scoring;
