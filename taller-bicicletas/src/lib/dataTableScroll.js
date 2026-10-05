// Utilidades puras del scroll horizontal de las tablas (DataTable).

// Indica si hay que mostrar la barra de desplazamiento horizontal «espejo»: solo
// cuando la tabla es más ancha que su contenedor y no se usa el modo con scroll
// interno (que ya tiene su propia barra visible). El margen absorbe las pequeñas
// diferencias de redondeo entre scrollWidth y clientWidth.
export function debeMostrarBarraEspejo({ scrollInterno = false, scrollWidth = 0, clientWidth = 0, margen = 1 } = {}) {
  if (scrollInterno) return false
  return Number(scrollWidth) - Number(clientWidth) > margen
}
