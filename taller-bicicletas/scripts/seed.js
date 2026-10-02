import bcrypt from 'bcryptjs'
import prisma from '../server/db.js'

async function seed() {
  // Usuarios por defecto (idempotente: solo se crean si no existen)
  const defaultUsers = [
    { username: 'admin', password: 'admin123', nombre: 'Administrador', rol: 'admin' },
    { username: 'mecanico', password: 'mecanico123', nombre: 'Mecánico', rol: 'mecanico' },
  ]

  for (const user of defaultUsers) {
    const existing = await prisma.usuario.findUnique({ where: { username: user.username } })
    if (!existing) {
      await prisma.usuario.create({
        data: { ...user, password: await bcrypt.hash(user.password, 10) },
      })
    }
  }

  // Datos de empresa genéricos: se editan después en Configuración > Empresa.
  // (npm run db:demo los sustituye por una empresa ficticia de ejemplo.)
  const datosEmpresa = {
    nombre: 'Mi Taller de Bicicletas',
    cif: '',
    direccion: '',
    codigoPostal: '',
    ciudad: '',
    provincia: '',
    telefono: '',
    email: '',
    web: '',
    logoUrl: '/icons/logo.png',
  }

  const empresaExistente = await prisma.empresa.findFirst()
  if (!empresaExistente) {
    await prisma.empresa.create({ data: datosEmpresa })
  }

  // Catálogo real de operaciones de mano de obra (upsert por código).
  // tiempoDefecto en horas; precioHoraDefecto 30 € en todas.
  const operaciones = [
    { codigo: 'REV-GEN', descripcion: 'Revisión general', tiempoDefecto: 1 },
    { codigo: 'REV-BAS', descripcion: 'Revisión básica', tiempoDefecto: 0.5 },
    { codigo: 'CAD-CAM', descripcion: 'Cambio de cadena', tiempoDefecto: 0.25 },
    { codigo: 'FRE-PUR', descripcion: 'Purgado de frenos (por freno)', tiempoDefecto: 0.5 },
    { codigo: 'FRE-PAS', descripcion: 'Cambio de pastillas (por freno)', tiempoDefecto: 0.25 },
    { codigo: 'FRE-AJU', descripcion: 'Ajuste de frenos', tiempoDefecto: 0.25 },
    { codigo: 'RUE-CEN', descripcion: 'Centrado de rueda', tiempoDefecto: 0.5 },
    { codigo: 'RUE-NEU', descripcion: 'Sustitución de neumático', tiempoDefecto: 0.25 },
    { codigo: 'RUE-PIN', descripcion: 'Reparación de pinchazo', tiempoDefecto: 0.25 },
    { codigo: 'RUE-TUB', descripcion: 'Montaje tubeless (por rueda)', tiempoDefecto: 0.5 },
    { codigo: 'CAM-AJU', descripcion: 'Ajuste de cambio', tiempoDefecto: 0.25 },
    { codigo: 'CAM-CAB', descripcion: 'Cambio de cable y funda de cambio', tiempoDefecto: 0.5 },
    { codigo: 'TRA-LIM', descripcion: 'Limpieza de transmisión', tiempoDefecto: 0.5 },
    { codigo: 'DIR-REV', descripcion: 'Revisión de dirección', tiempoDefecto: 0.5 },
    { codigo: 'SUS-HOR', descripcion: 'Mantenimiento horquilla (básico)', tiempoDefecto: 1 },
    { codigo: 'SUS-AMO', descripcion: 'Mantenimiento amortiguador (básico)', tiempoDefecto: 1 },
    { codigo: 'EBK-DIA', descripcion: 'Diagnóstico e-bike', tiempoDefecto: 0.5 },
    { codigo: 'EBK-FIR', descripcion: 'Actualización firmware e-bike', tiempoDefecto: 0.25 },
    { codigo: 'MON-BIC', descripcion: 'Montaje de bicicleta completa', tiempoDefecto: 2 },
    { codigo: 'MO-GEN', descripcion: 'Mano de obra general (por horas)', tiempoDefecto: 1 },
  ]

  for (const operacion of operaciones) {
    await prisma.operacionManoObra.upsert({
      where: { codigo: operacion.codigo },
      update: { descripcion: operacion.descripcion, tiempoDefecto: operacion.tiempoDefecto, precioHoraDefecto: 30 },
      create: { ...operacion, precioHoraDefecto: 30 },
    })
  }

  // Limpieza de operaciones de muestra antiguas (SEED-*) que no se usen en
  // ninguna orden, para no romper el historial de órdenes existentes.
  const operacionesMuestra = await prisma.operacionManoObra.findMany({
    where: { codigo: { startsWith: 'SEED-' } },
    select: { codigo: true },
  })
  for (const { codigo } of operacionesMuestra) {
    const enUso = await prisma.ordenManoObra.count({ where: { codigoOp: codigo } })
    if (enUso === 0) {
      await prisma.operacionManoObra.delete({ where: { codigo } })
    }
  }

  console.log('Seed completado correctamente.')
}

seed()
  .catch((error) => {
    console.error('Error al ejecutar el seed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

