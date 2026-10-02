import { useQuery } from 'react-query'

// Consulta el modo de datos activo ('real' o 'demo'). Es público para poder
// avisar también en la pantalla de acceso.
export function useModoDatos() {
  const { data } = useQuery(
    ['modo-datos'],
    () => fetch('/api/modo/publico').then((r) => (r.ok ? r.json() : { modo: 'real' })),
    { staleTime: 60_000 },
  )
  return data?.modo ?? 'real'
}

// Insignia visible solo cuando se trabaja con la base de datos de prueba.
export default function ModoBadge({ className = '' }) {
  if (useModoDatos() !== 'demo') return null
  return (
    <span className={`rounded-full border border-naranja-500/50 bg-naranja-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-naranja-400 ${className}`}>
      Modo prueba
    </span>
  )
}
