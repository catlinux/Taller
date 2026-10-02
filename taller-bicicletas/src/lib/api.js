export async function apiRequest(url, token, options = {}) {
  // `sinEventoExpirado` permite distinguir el 401 de «sesión caducada» del 401
  // de «contraseña o PIN incorrectos» (rutas /api/auth/pin y /api/auth/desbloquear),
  // de forma que un error de credenciales no cierre la sesión.
  const { sinEventoExpirado, ...fetchOptions } = options
  const response = await fetch(url, {
    ...fetchOptions,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(fetchOptions.body ? { 'Content-Type': 'application/json' } : {}),
      ...fetchOptions.headers,
    },
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    if (response.status === 401 && !sinEventoExpirado) {
      window.dispatchEvent(new Event('auth:expired'))
    }
    const error = new Error(data.error || 'No se pudo completar la operación.')
    error.status = response.status
    error.data = data
    throw error
  }
  return response.status === 204 ? null : response.json()
}

export function apiGet(url, token) {
  return apiRequest(url, token)
}

export function apiPost(url, token, body) {
  return apiRequest(url, token, { method: 'POST', body: JSON.stringify(body) })
}

export function apiPut(url, token, body) {
  return apiRequest(url, token, { method: 'PUT', body: JSON.stringify(body) })
}

export function apiPatch(url, token, body) {
  return apiRequest(url, token, { method: 'PATCH', body: JSON.stringify(body) })
}

export function apiDelete(url, token) {
  return apiRequest(url, token, { method: 'DELETE' })
}
