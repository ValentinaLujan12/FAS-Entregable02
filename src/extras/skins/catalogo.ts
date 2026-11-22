/**
 * Catálogo de skins (cartas, mesas, ambientes y celebraciones) con estética pastel del viejo oeste.
 * Añadir una skin = añadir una entrada aquí y generar su arte con `npm run assets:generate` (tools/generate-assets.ts).
 */
export const CATALOGO: any = {
  saldoInicial: 99,
  recarga: { activa: true, tokens: 999 },
  cartas: [
    { id: 'carta_salvia', nombre: 'Salvia', descripcion: 'Verde salvia con borde de cuerda.', premium: false, precio: 0, diseno: { fondo: ['#a9c3a4', '#8aa889'], trazo: '#fbf4e6', motivo: 'cuerda', marco: null } },
    { id: 'carta_terracota', nombre: 'Terracota', descripcion: 'Barro cocido con herraduras de la suerte.', premium: false, precio: 0, diseno: { fondo: ['#e2a387', '#cf8a6e'], trazo: '#fdf1e2', motivo: 'herraduras', marco: { color: '#cf8a6e', ancho: 3 } } },
    { id: 'carta_pradera', nombre: 'Pradera', descripcion: 'Azul vaquero con franjas de sarape.', premium: false, precio: 0, diseno: { fondo: ['#a4b5cc', '#8b9db8'], trazo: '#fbf4e6', motivo: 'sarape', marco: { color: '#8b9db8', ancho: 3 } } },
    { id: 'carta_cactus', nombre: 'Cactus', descripcion: 'Turquesa suave con cactus en flor.', premium: false, precio: 0, diseno: { fondo: ['#98c2bd', '#7aaaa4'], trazo: '#fbf4e6', motivo: 'cactus', marco: { color: '#7aaaa4', ancho: 3 } } },
    { id: 'carta_pizarra', nombre: 'Pizarra', descripcion: 'Gris piedra con estrellas de sheriff.', premium: false, precio: 0, diseno: { fondo: ['#a7a9ad', '#8c8f95'], trazo: '#fbf4e6', motivo: 'estrellas', marco: { color: '#8c8f95', ancho: 3 } } },
    { id: 'carta_arena', nombre: 'Arena', descripcion: 'Dunas color trigo al atardecer.', premium: false, precio: 0, diseno: { fondo: ['#e9cf9c', '#d9b77d'], trazo: '#fffaf0', motivo: 'dunas', marco: { color: '#d9b77d', ancho: 3 } } },
    { id: 'carta_plata_sheriff', nombre: 'Plata del sheriff', descripcion: 'Placa de plata repujada.', premium: true, precio: 99, diseno: { fondo: ['#b9bfc7', '#959ca7'], trazo: '#f4f6f8', motivo: 'estrellas', tinta: 'metal', marco: { color: '#aeb6c1', ancho: 5, tinta: 'metal' } } },
    { id: 'carta_brasa', nombre: 'Brasa', descripcion: 'Tinta coral que brilla como una fogata.', premium: true, precio: 350, diseno: { fondo: ['#5c4a5a', '#463746'], trazo: '#ffb196', motivo: 'herraduras', tinta: 'neon', marco: { color: '#ff9f86', ancho: 4, tinta: 'neon' } } },
    { id: 'carta_oro_viejo', nombre: 'Oro viejo', descripcion: 'Cuero repujado con lámina dorada.', premium: true, precio: 450, diseno: { fondo: ['#b08a68', '#8f6c50'], trazo: '#f3d48c', motivo: 'repujado', tinta: 'metal', marco: { color: '#e2bd6c', ancho: 5, tinta: 'metal' } } },
    { id: 'carta_turquesa', nombre: 'Turquesa del desierto', descripcion: 'Piedra turquesa con vetas naturales.', premium: true, precio: 550, diseno: { fondo: ['#8fc9c2', '#6fb0aa'], trazo: '#fbf4e6', motivo: 'liso', tinta: 'marmol', paleta: ['#f6efe0', '#4f8f8a', '#c79d7b'], marco: { color: '#6fb0aa', ancho: 4, tinta: 'metal' } } },
    { id: 'carta_luciernagas', nombre: 'Luciérnagas', descripcion: 'Noche en la pradera con tinta que brilla.', premium: true, precio: 700, diseno: { fondo: ['#4b5873', '#3a465e'], trazo: '#c9f2c5', motivo: 'cuerda', tinta: 'neon', marco: { color: '#b6ecb0', ancho: 4, tinta: 'neon' } } },
    { id: 'carta_atardecer', nombre: 'Atardecer', descripcion: 'Acuarela de cielo naranja, salvia y lavanda.', premium: true, precio: 800, diseno: { fondo: ['#f6e7d4', '#efd9c0'], trazo: '#8a6a52', motivo: 'liso', tinta: 'salpicado', paleta: ['#f2b48f', '#a9c3a4', '#a9a3c9', '#e7c27d'], marco: { color: '#d9a07f', ancho: 4 } } },
    { id: 'carta_arcoiris', nombre: 'Arcoíris de pradera', descripcion: 'Tinta tornasol en tonos pastel.', premium: true, precio: 950, diseno: { fondo: ['#ece6f2', '#e0e6ec'], trazo: '#7d7290', motivo: 'sarape', tinta: 'holo', marco: { color: '#b9c9e6', ancho: 5, tinta: 'metal' } } },
  ],
  mesas: [
    { id: 'mesa_salvia', nombre: 'Salvia', descripcion: 'Paño verde salvia y roble claro.', premium: false, precio: 0, diseno: { fieltro: ['#b7cdb0', '#9fbb98', '#86a57f'], borde: ['#d9b48e', '#c39a73', '#a47c59'], filete: '#f6ead2' } },
    { id: 'mesa_pradera', nombre: 'Pradera', descripcion: 'Paño azul vaquero y pino.', premium: false, precio: 0, diseno: { fieltro: ['#b3c2d6', '#9aacc6', '#8195b3'], borde: ['#d6b896', '#bf9d79', '#9d7d5e'], filete: '#f4ede0' } },
    { id: 'mesa_terracota', nombre: 'Terracota', descripcion: 'Paño de barro cocido y nogal.', premium: false, precio: 0, diseno: { fieltro: ['#e8b49b', '#d99c80', '#c48368'], borde: ['#b48e72', '#987459', '#7a5b45'], filete: '#fbecd9' } },
    { id: 'mesa_arena', nombre: 'Arena', descripcion: 'Paño color trigo y madera de cerca.', premium: false, precio: 0, diseno: { fieltro: ['#ecd5a8', '#dfc18d', '#ccab75'], borde: ['#b89a7c', '#9c7f63', '#7e644c'], filete: '#fff7e6' } },
    { id: 'mesa_pizarra', nombre: 'Pizarra', descripcion: 'Paño gris piedra y madera vieja.', premium: false, precio: 0, diseno: { fieltro: ['#bfc3c7', '#a7acb2', '#8f959c'], borde: ['#c7ab8f', '#ab8f74', '#8b735d'], filete: '#f5f2ec' } },
    { id: 'mesa_turquesa', nombre: 'Turquesa', descripcion: 'Piedra turquesa con vetas y marco de plata.', premium: true, precio: 99, diseno: { fieltro: ['#a3d3cc', '#86bfb8', '#6aa7a0'], borde: ['#eef0f3', '#c3c9d1', '#99a1ac'], filete: '#ffffff', efecto: 'vetas' } },
    { id: 'mesa_fogata', nombre: 'Fogata', descripcion: 'Noche de campamento con borde de brasa.', premium: true, precio: 450, diseno: { fieltro: ['#6d6378', '#594f64', '#463e51'], borde: ['#ffb196', '#e8907a', '#b96f5f'], filete: '#ffd6c4', efecto: 'neon' } },
    { id: 'mesa_cuero', nombre: 'Cuero y tachuelas', descripcion: 'Cuero repujado con tachuelas doradas.', premium: true, precio: 600, diseno: { fieltro: ['#c9a383', '#b48c6c', '#9a7456'], borde: ['#f0d59a', '#d6b46e', '#ac8a4b'], filete: '#fff3d1', efecto: 'tachas' } },
    { id: 'mesa_noche_estrellada', nombre: 'Noche estrellada', descripcion: 'Cielo nocturno del desierto con borde de luciérnagas.', premium: true, precio: 999, diseno: { fieltro: ['#5d6b8a', '#4b5875', '#3b465f'], borde: ['#c9f2c5', '#97d39a', '#5e9a68'], filete: '#e6ffe2', efecto: 'neon' } },
  ],
  ambientes: [
    { id: 'amb_desierto', nombre: 'Desierto dorado', descripcion: 'Mesetas, cactus y el sol de la tarde.', premium: false, precio: 0, diseno: { pared: ['#cfe3e1', '#f3dcbf', '#f6cfae'], luz: '#ffe3b5', estilo: 'desierto', particulas: ['233,203,160', '245,224,190', '214,180,140', '255,240,215'] } },
    { id: 'amb_pradera', nombre: 'Pradera', descripcion: 'Colinas verdes, molino y cerca de madera.', premium: false, precio: 0, diseno: { pared: ['#cfe4ee', '#e3efe6', '#eef3df'], luz: '#fff6cf', estilo: 'pradera', particulas: ['255,248,214', '214,232,190', '255,255,240', '240,228,170'] } },
    { id: 'amb_canon', nombre: 'Cañón', descripcion: 'Paredes de roca color melocotón.', premium: false, precio: 0, diseno: { pared: ['#f4dfcf', '#f0cdb4', '#e8b99a'], luz: '#ffe0c2', estilo: 'canon', particulas: ['240,200,170', '250,226,204', '226,176,146', '255,236,220'] } },
    { id: 'amb_saloon', nombre: 'Saloon', descripcion: 'Madera tibia, lámparas y carteles de se busca.', premium: false, precio: 0, diseno: { pared: ['#e8d3b8', '#ddc2a1', '#cfae8a'], luz: '#ffe9bf', estilo: 'saloon', particulas: ['255,236,196', '246,220,176', '255,246,226', '232,206,160'] } },
    { id: 'amb_noche_desierto', nombre: 'Noche en el desierto', descripcion: 'Luna, estrellas y una fogata a lo lejos.', premium: true, precio: 199, diseno: { pared: ['#4a5677', '#626b8e', '#8c86a3'], luz: '#ffd9b0', estilo: 'desierto', variante: 'noche', particulas: ['255,236,190', '255,214,170', '220,230,255', '255,250,235'] } },
    { id: 'amb_pueblo', nombre: 'Pueblo de frontera', descripcion: 'Fachadas de madera y faroles al anochecer.', premium: true, precio: 299, diseno: { pared: ['#b8b6d1', '#e4c3b4', '#f2d2b0'], luz: '#ffd29a', estilo: 'pueblo', variante: 'faroles', particulas: ['255,214,150', '255,236,200', '250,196,150', '255,248,226'] } },
  ],
  celebraciones: [
    { id: 'celeb_confeti', nombre: 'Confeti de pradera', descripcion: 'Serpentinas pastel con fanfarria.', premium: false, precio: 0, diseno: { efecto: 'serpentinas', colores: ['#e7c27d', '#d88e70', '#9db89a', '#8ea1bd', '#86b6b1', '#fbf4e6'], musica: 'fanfarria' } },
    { id: 'celeb_estrellas', nombre: 'Estrellas de sheriff', descripcion: 'Una lluvia de estrellas doradas.', premium: false, precio: 0, diseno: { efecto: 'estrellas', colores: ['#f3d48c', '#e7c27d', '#fff1cf', '#e3a96f'], musica: 'campanas' } },
    { id: 'celeb_polvo_oro', nombre: 'Polvo de oro', descripcion: 'Pepitas de oro que estallan en tinta.', premium: true, precio: 150, diseno: { efecto: 'tinta', colores: ['#e7c27d', '#c9a15a', '#fff1cf', '#b88b6a'], musica: 'campanas' } },
    { id: 'celeb_baile', nombre: 'Baile del saloon', descripcion: 'Bola de baile, luces y música de fiesta.', premium: true, precio: 300, diseno: { efecto: 'disco', colores: ['#d88e70', '#86b6b1', '#e7c27d', '#a9a3c9'], musica: 'disco' } },
    { id: 'celeb_fuegos', nombre: 'Fuegos del pueblo', descripcion: 'Fuegos artificiales sobre los tejados.', premium: true, precio: 450, diseno: { efecto: 'fuegos', colores: ['#d88e70', '#e7c27d', '#86b6b1', '#8ea1bd', '#fbf4e6'], musica: 'fanfarria' } },
    { id: 'celeb_luciernagas', nombre: 'Luciérnagas', descripcion: 'Salpicaduras de luz verde y ámbar.', premium: true, precio: 600, diseno: { efecto: 'tinta', colores: ['#c9f2c5', '#e7c27d', '#b6ecb0', '#fff1cf'], musica: 'disco' } },
  ],
};

export default CATALOGO;
