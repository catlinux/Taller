// Impresión directa de un PDF generado con jsPDF.
//
// En vez de abrir el PDF en una pestaña nueva (que obliga a pasar por el visor
// del navegador), carga el documento en un <iframe> oculto y lanza desde ahí el
// diálogo de impresión. En los navegadores que no permiten imprimir desde un
// iframe (algunos móviles y la tablet Android), abre el PDF en una pestaña nueva
// como alternativa, sin mostrar ningún error al usuario.

// Tiempo máximo (ms) que esperamos a que el iframe cargue antes de recurrir a
// abrir el PDF en una pestaña nueva.
const TIEMPO_MAXIMO_CARGA = 4000

// Tiempo (ms) tras el cual limpiamos el iframe y la URL del blob. Da margen a
// que el diálogo de impresión se abra (o se cancele) antes de retirarlos.
const TIEMPO_LIMPIEZA = 60000

// En estos navegadores la impresión desde un iframe no es fiable: los tratamos
// directamente con la alternativa de la pestaña nueva.
function permiteImpresionDirecta() {
  const ua = navigator.userAgent || ''
  return !/android|iphone|ipad|ipod|mobile/i.test(ua)
}

// Imprime el PDF de jsPDF abriendo el diálogo del navegador.
export function imprimirPdf(doc) {
  const url = URL.createObjectURL(doc.output('blob'))

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.setAttribute('aria-hidden', 'true')
  iframe.setAttribute('tabindex', '-1')

  let terminado = false
  let temporizadorCarga = null
  let temporizadorLimpieza = null

  function quitarIframe() {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
  }

  // Camino de éxito: retira el iframe y libera la URL del blob.
  function limpiar() {
    if (terminado) return
    terminado = true
    clearTimeout(temporizadorCarga)
    clearTimeout(temporizadorLimpieza)
    quitarIframe()
    URL.revokeObjectURL(url)
  }

  // Alternativa: abre el PDF en una pestaña nueva. Revoca la URL un poco más
  // tarde para dar tiempo a la pestaña a cargar el documento.
  function abrirEnPestana() {
    if (terminado) return
    terminado = true
    clearTimeout(temporizadorCarga)
    clearTimeout(temporizadorLimpieza)
    quitarIframe()
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), TIEMPO_LIMPIEZA)
  }

  function imprimir() {
    if (terminado) return
    const ventana = iframe.contentWindow
    if (!ventana || typeof ventana.print !== 'function') {
      abrirEnPestana()
      return
    }
    // El iframe ya ha cargado: el temporizador de carga ya no hace falta, o abriría
    // además una pestaña nueva tras lanzar la impresión.
    clearTimeout(temporizadorCarga)
    try {
      ventana.focus()
      ventana.print()
    } catch {
      abrirEnPestana()
      return
    }
    // Nos limpiamos cuando el navegador termina de imprimir, si lo soporta.
    try {
      ventana.addEventListener('afterprint', limpiar, { once: true })
    } catch {
      // Sin afterprint: nos apoyamos en el temporizador de limpieza.
    }
  }

  // Si el navegador no imprime bien desde un iframe, no lo intentamos siquiera.
  if (!permiteImpresionDirecta()) {
    abrirEnPestana()
    return
  }

  temporizadorLimpieza = setTimeout(limpiar, TIEMPO_LIMPIEZA)
  iframe.addEventListener('load', imprimir, { once: true })
  iframe.src = url
  document.body.appendChild(iframe)

  // Si el iframe no carga a tiempo, abrimos el PDF en una pestaña nueva.
  temporizadorCarga = setTimeout(() => {
    if (terminado) return
    abrirEnPestana()
  }, TIEMPO_MAXIMO_CARGA)
}
