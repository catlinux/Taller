import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from 'react-query'
import { apiPut } from '../../lib/api.js'
import { aNumero, formatearEuros } from '../../lib/ordenes.js'

// Fila de total: etiqueta a la izquierda e importe a la derecha.
function Fila({ etiqueta, valor, destacado = false }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${destacado ? 'text-lg font-bold text-naranja-500' : 'text-sm text-slate-300'}`}>
      <span>{etiqueta}</span>
      <span className={destacado ? 'text-naranja-500' : 'text-white'}>{formatearEuros(valor)}</span>
    </div>
  )
}

// Bloque de totales de la orden. El descuento global es editable y se guarda
// contra el servidor, que devuelve la orden recalculada. El resto de importes
// los calcula el servidor y aquí solo se muestran.
export default function Totales({ orden, token }) {
  const queryClient = useQueryClient()
  const ordenId = orden.id
  const claveOrden = ['orden', String(ordenId)]

  const [descuento, setDescuento] = useState(String(orden.descuentoGlobal ?? 0))
  const [errorAccion, setErrorAccion] = useState('')

  useEffect(() => {
    setDescuento(String(orden.descuentoGlobal ?? 0))
  }, [orden.descuentoGlobal])

  const guardarDescuento = useMutation(
    (valor) => apiPut(`/api/ordenes/${ordenId}`, token, { descuentoGlobal: valor }),
    {
      onSuccess: (actualizada) => {
        queryClient.setQueryData(claveOrden, actualizada)
        queryClient.invalidateQueries(['ordenes'])
      },
      onError: (e) => setErrorAccion(e.message),
    },
  )

  function confirmarDescuento() {
    setErrorAccion('')
    const valor = aNumero(descuento)
    if (valor === null || valor < 0 || valor > 100 || valor === Number(orden.descuentoGlobal)) {
      setDescuento(String(orden.descuentoGlobal ?? 0))
      return
    }
    guardarDescuento.mutate(valor)
  }

  return (
    <div className="space-y-3">
      {errorAccion && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{errorAccion}</p>}
      <div className="space-y-2">
        <Fila etiqueta="Subtotal materiales" valor={orden.subtotalMateriales} />
        <Fila etiqueta="Subtotal mano de obra" valor={orden.subtotalManoObra} />
        <div className="flex items-center justify-between gap-4 text-sm text-slate-300">
          <label htmlFor="descuento-global">Descuento global %</label>
          <input
            id="descuento-global"
            type="text"
            inputMode="decimal"
            value={descuento}
            onChange={(event) => setDescuento(event.target.value)}
            onBlur={confirmarDescuento}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                event.currentTarget.blur()
              }
            }}
            className="w-24 rounded-md border border-antracita-600 bg-antracita-900 px-2 py-1.5 text-right text-white outline-none focus:border-azul-400"
          />
        </div>
        <div className="border-t border-antracita-700 pt-2">
          <Fila etiqueta="Base imponible" valor={orden.baseImponible} />
        </div>
        <Fila etiqueta="IVA" valor={orden.iva} />
      </div>
      <div className="border-t border-antracita-700 pt-3">
        <Fila etiqueta="TOTAL" valor={orden.total} destacado />
      </div>
    </div>
  )
}
