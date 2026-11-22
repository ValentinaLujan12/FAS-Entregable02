# Guía de administración de El Apuntado

Esta guía cubre tareas de administración del juego ya desplegado en Vercel. Para la instalación inicial, usa `GUIA_DESPLIEGUE.md`.

## Antes de empezar

- Los usuarios y contraseñas de acceso se manejan en la variable `ACCESO_USUARIOS` de Vercel. El repositorio de GitHub **no** contiene contraseñas ni hashes.
- Guarda en un lugar privado una copia completa del valor actual de `ACCESO_USUARIOS`. Vercel no vuelve a mostrar el valor después de guardarlo, y lo necesitarás para agregar o quitar usuarios sin regenerar a todos.
- Nunca compartas los valores de `ACCESO_USUARIOS` ni de `SECRETO_SESION` por chat, correo o GitHub. Sí puedes compartir el usuario y la contraseña en texto, por un canal privado.
- Cada cambio en las variables de Vercel requiere un **Redeploy** para tener efecto.

## Agregar un usuario nuevo

1. Abre `herramientas/generar-acceso.html` con doble clic. Funciona sin internet.
2. Escribe **solo** el usuario nuevo y su contraseña (mínimo 10 caracteres) y pulsa **Generar**.
3. Copia únicamente la entrada del usuario nuevo del campo `ACCESO_USUARIOS`. Tiene esta forma:
   `usuario=pbkdf2-sha256$600000$...$...`
   **No copies el valor de `SECRETO_SESION`.** Cambiarlo cierra todas las sesiones abiertas.
4. En Vercel, entra a tu proyecto `apuntadocozzyplay` y ve a **Settings > Environment Variables**.
5. Pulsa **Edit** en `ACCESO_USUARIOS`. Pega el valor completo guardado en tu copia privada y agrega al final, separado por punto y coma y sin espacios: `;usuario=pbkdf2-sha256$...`
6. Guarda el cambio.
7. Ve a **Deployments**, abre el último despliegue, pulsa **...** y elige **Redeploy**.
8. Entra al sitio con el usuario nuevo para comprobar que funciona.
9. Comparte usuario y contraseña con la persona por un canal privado. Actualiza tu copia privada del valor completo.

## Cambiar la contraseña de un usuario

1. Genera de nuevo la entrada de ese usuario con la nueva contraseña, como en el paso 1 de la sección anterior.
2. En `ACCESO_USUARIOS`, reemplaza solo la entrada de ese usuario. Deja las demás tal como están.
3. Guarda, haz **Redeploy** y actualiza tu copia privada.

## Quitar un usuario

1. En `ACCESO_USUARIOS`, borra su entrada completa, incluido el punto y coma que la separa de la siguiente.
2. Guarda y haz **Redeploy**.

Su sesión deja de funcionar en cuanto el nuevo despliegue esté activo, porque el servidor revisa la lista de usuarios en cada petición.

## Cambiar SECRETO_SESION

Solo hazlo si sospechas que alguien conoce la clave de firma. Al cambiarla, **todas** las sesiones abiertas se cierran y todos tendrán que volver a entrar. Genera el valor con el mismo HTML, cópialo en `SECRETO_SESION` en Vercel y haz **Redeploy**.

## Qué no afecta a la base de datos

Agregar, cambiar o quitar usuarios solo modifica las variables de Vercel. No toca las tablas de Supabase: salas, presencia, buzones, cuentas de skins ni límites de intentos. No hay que ejecutar nada en el SQL Editor.

## Problemas comunes

- **"Demasiados intentos":** el sistema permite 10 intentos de inicio de sesión cada 15 minutos por dirección. Espera ese tiempo.
- **"Usuario o contraseña incorrectos" con datos correctos:** revisa que la entrada en Vercel esté completa, con el usuario en minúsculas (el sistema no distingue mayúsculas), y que hiciste **Redeploy** después del cambio.
- **`/api/salud` responde `configuracion-incompleta`:** falta una variable o `ACCESO_USUARIOS` quedó mal formado. Revisa que cada entrada tenga la forma `usuario=pbkdf2-sha256$...` y que estén separadas por `;`.
- **Perdiste tu copia del valor completo:** no se puede recuperar desde Vercel. Tendrás que generar de nuevo todas las entradas con las contraseñas de cada usuario, y repetir el paso de Redeploy.
