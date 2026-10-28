/**
 * Clases de entidad / persistencia (Figura 2.3.1, Tabla 2.3.1). Mapean 1:1 las tablas del esquema y
 * convierten hacia y desde los snapshots del kernel. No salen del módulo persistence (FF-27).
 * El mapeo ORM (anotaciones JPA y bloqueo optimista por el campo version) se configura en el Entregable 3.
 */
package co.edu.unal.apuntado.persistence.entity;
