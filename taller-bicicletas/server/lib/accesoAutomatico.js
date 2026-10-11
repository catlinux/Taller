export function elegirUsuarioAutomatico(usuarios) {
  return usuarios
    .filter((usuario) => usuario.rol === 'admin' && usuario.activo === true)
    .reduce((elegido, usuario) => (!elegido || usuario.id < elegido.id ? usuario : elegido), null)
}
