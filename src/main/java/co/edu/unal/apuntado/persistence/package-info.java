/**
 * Módulo persistence (PersistenceDomain, Tabla 1.2.1; ADR-04): StateRepositoryComponent sobre PostgreSQL.
 * Es el único módulo que abre conexiones y usa JDBC/ORM (FF-06); sus entidades no salen del módulo (FF-27).
 * Depende solo de kernel (FF-02).
 */
package co.edu.unal.apuntado.persistence;
