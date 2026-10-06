import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useAuth } from '../../context/AuthContext.jsx'
import { apiGet, apiPost } from '../../lib/api.js'
import { IconFlechaArriba } from '../Icons.jsx'

// Descripción de las tarjetas de importación (en el orden en que hay que subirlas).
const TARJETAS = [
  { tipo: 'clientes', titulo: 'Clientes', columnas: 'Cód;Nombre;Domicilio;C.P.;Población;Provincia;Teléfono;NIF' },
  { tipo: 'articulos', titulo: 'Artículos', columnas: 'Código;Descripción;Referencia;Prov.;P.Costo;P.Venta;Stock, agrupados por familia' },
  { tipo: 'bicicletas', titulo: 'Bicicletas', columnas: 'CLIENT;MARCA;MODEL;Nº SERIE;CATEGORIA' },
  { tipo: 'trabajos', titulo: 'Tiempos de trabajos', columnas: 'Excel con categorías y tiempos HH:MM por trabajo (Tiempos sexagesimales)', binario: true },
]

// Lee un fichero en el navegador y devuelve su texto. Prueba UTF-8 y, si no es
// válido, reintenta con windows-1252 (los CSV del ERP antiguo pueden venir en ANSI).
async function leerTextoFichero(fichero) {
  const buffer = await fichero.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

// Codifica un ArrayBuffer en base64 (para subir un Excel binario sin TextDecoder).
async function leerBase64Fichero(fichero) {
  const bytes = new Uint8Array(await fichero.arrayBuffer())
  let binario = ''
  const trozo = 0x8000
  for (let i = 0; i < bytes.length; i += trozo) {
    binario += String.fromCharCode(...bytes.subarray(i, i + trozo))
  }
  return btoa(binario)
}

// Una fila (etiqueta + valor) de la tabla de resumen.
function FilaResumen({ etiqueta, valor }) {
  return (
    <tr>
      <th scope="row" className="py-1.5 text-left text-sm font-normal text-slate-400">{etiqueta}</th>
      <td className="py-1.5 text-right text-sm font-semibold text-white sm:text-left">{valor}</td>
    </tr>
  )
}

// Resumen de la simulación (no se ha escrito nada todavía).
function ResumenSimulacion({ resumen }) {
  return (
    <div className="mt-4 rounded-lg border border-antracita-700 bg-antracita-900/50 p-4">
      <p className="text-sm font-medium text-white">Simulación: todavía no se ha escrito nada</p>
      <table className="mt-2 w-full">
        <tbody className="divide-y divide-antracita-800">
          <FilaResumen etiqueta="Leídos" valor={resumen.leidos} />
          <FilaResumen etiqueta="Se crearán" valor={resumen.creados} />
          <FilaResumen etiqueta="Se actualizarán" valor={resumen.actualizados} />
          {resumen.familias != null && <FilaResumen etiqueta="Familias distintas" valor={resumen.familias} />}
          {resumen.categorias != null && <FilaResumen etiqueta="Categorías" valor={resumen.categorias} />}
        </tbody>
      </table>
      {resumen.omitidos?.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-medium text-naranja-300">Omitidos</p>
          <ul className="mt-1 space-y-1 text-sm text-slate-300">
            {resumen.omitidos.map((omitido) => (
              <li key={omitido.motivo}>
                {omitido.motivo}: {omitido.cantidad}
                {omitido.lineas?.length ? ` (líneas ${omitido.lineas.join(', ')})` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// Resultado real de la importación (en verde).
function ResultadoImportacion({ resultado }) {
  return (
    <div role="status" className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
      <p className="font-medium text-emerald-300">Importación completada</p>
      <p className="mt-1">Se han creado {resultado.creados} y se han actualizado {resultado.actualizados}.</p>
      {resultado.omitidos?.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {resultado.omitidos.map((omitido) => (
            <li key={omitido.motivo}>
              {omitido.motivo}: {omitido.cantidad}
              {omitido.lineas?.length ? ` (líneas ${omitido.lineas.join(', ')})` : ''}
            </li>
          ))}
        </ul>
      )}
      {resultado.backup && <p className="mt-1">Copia de seguridad: {resultado.backup}</p>}
    </div>
  )
}

// Tarjeta de importación de un tipo de dato: fichero -> simulación -> importación.
function TarjetaImportacion({ tipo, titulo, columnas, binario = false }) {
  const { token } = useAuth()
  const queryClient = useQueryClient()
  const inputRef = useRef(null)
  const [nombreFichero, setNombreFichero] = useState('')
  const [contenido, setContenido] = useState('')
  const [resumen, setResumen] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState('')

  const simular = useMutation(
    (texto) => apiPost(`/api/importar/${tipo}`, token, { contenido: texto, simular: true }),
    {
      onSuccess: (datos) => { setError(''); setResumen(datos) },
      onError: (e) => { setResumen(null); setError(e.message) },
    },
  )

  const importar = useMutation(
    (texto) => apiPost(`/api/importar/${tipo}`, token, { contenido: texto, simular: false }),
    {
      onSuccess: (datos) => {
        setError('')
        setResumen(null)
        setResultado(datos)
        // Refresca las pantallas que muestran estos datos.
        for (const clave of ['clientes', 'articulos', 'bicicletas', 'operaciones', 'dashboard']) {
          queryClient.invalidateQueries([clave])
        }
      },
      onError: (e) => setError(e.message),
    },
  )

  const cargando = simular.isLoading || importar.isLoading

  async function alElegirFichero(evento) {
    const fichero = evento.target.files?.[0]
    if (!fichero) return
    setError('')
    setResumen(null)
    setResultado(null)
    setNombreFichero(fichero.name)
    try {
      const datos = binario ? await leerBase64Fichero(fichero) : await leerTextoFichero(fichero)
      setContenido(datos)
      simular.mutate(datos)
    } catch {
      setContenido('')
      setError('No se pudo leer el fichero.')
    }
  }

  // Reinicia la tarjeta para poder elegir otro fichero.
  function cambiarFichero() {
    setNombreFichero('')
    setContenido('')
    setResumen(null)
    setResultado(null)
    setError('')
    simular.reset()
    importar.reset()
    if (inputRef.current) inputRef.current.value = ''
  }

  function importarDeVerdad() {
    const nuevos = resumen?.creados ?? 0
    const actualizados = resumen?.actualizados ?? 0
    const aviso = `Se creará una copia de seguridad y después se importarán ${nuevos} nuevos y se actualizarán ${actualizados} existentes. ¿Continuar?`
    if (window.confirm(aviso)) importar.mutate(contenido)
  }

  // Solo se puede importar con una simulación correcta y al menos un registro leído.
  const puedeImportar = Boolean(resumen) && resumen.leidos > 0 && !cargando

  return (
    <div className="card p-5">
      <h3 className="font-semibold text-white">{titulo}</h3>
      <p className="mt-1 text-sm text-slate-400">
        Columnas esperadas: <span className="text-slate-300">{columnas}</span>
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          ref={inputRef}
          type="file"
          accept={binario ? '.xlsx,.xls' : '.csv,text/csv,.txt'}
          onChange={alElegirFichero}
          disabled={cargando}
          aria-label={`Fichero de ${titulo}`}
          className="block w-full min-h-[44px] text-sm text-slate-300 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-azul-500/15 file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-azul-300 hover:file:bg-azul-500/25 disabled:opacity-60"
        />
        {nombreFichero && (
          <button type="button" onClick={cambiarFichero} disabled={cargando} className="btn-secondary shrink-0">
            Cambiar de fichero
          </button>
        )}
      </div>

      {nombreFichero && <p className="mt-2 text-xs text-slate-500">Fichero: {nombreFichero}</p>}

      {cargando && (
        <p role="status" className="mt-3 text-sm text-slate-400">
          {importar.isLoading ? 'Importando…' : 'Simulando…'}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </p>
      )}

      {resumen && <ResumenSimulacion resumen={resumen} />}
      {resultado && <ResultadoImportacion resultado={resultado} />}

      <div className="mt-4 flex justify-end">
        <button type="button" onClick={importarDeVerdad} disabled={!puedeImportar} className="btn-primary min-h-[44px]">
          <IconFlechaArriba size={16} /> {importar.isLoading ? 'Importando…' : 'Importar de verdad'}
        </button>
      </div>
    </div>
  )
}

// Panel de «Importar» de Configuración: sube los listados del ERP en CSV.
export default function ImportarPanel() {
  const { token, user } = useAuth()
  const esAdmin = user?.rol === 'admin'
  const { data } = useQuery(['modo-datos', 'admin'], () => apiGet('/api/modo', token), {
    enabled: Boolean(token) && esAdmin,
  })
  const modoDemo = data?.modo === 'demo'

  return (
    <div>
      <h2 className="text-lg font-semibold text-white">Importar datos</h2>
      <p className="mt-1 text-sm text-slate-400">
        Sube los listados del ERP en CSV. Lo que ya existe se actualiza (por código de cliente, referencia de artículo o serie de bicicleta) y nada se borra. Importa en este orden: clientes, artículos y bicicletas (las bicicletas necesitan que sus clientes ya estén).
      </p>

      {modoDemo && (
        <p role="status" className="mt-4 rounded-lg border border-naranja-500/30 bg-naranja-500/10 px-4 py-3 text-sm text-naranja-300">
          Estás en datos de prueba: se importará en la base de prueba, no en la real.
        </p>
      )}

      <div className="mt-6 space-y-4">
        {TARJETAS.map((tarjeta) => (
          <TarjetaImportacion key={tarjeta.tipo} {...tarjeta} />
        ))}
      </div>
    </div>
  )
}

