import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkTeacherAuth, unauthorizedResponse } from '@/lib/auth'

/**
 * GET /api/sessions/[token]
 * Devuelve info de una sesion para mostrar al alumno cuando escanea el QR.
 * Solo devuelve datos publicos (nombre, ventana de tiempo, si sigue activa).
 *
 * ESTE ENDPOINT ES PUBLICO: el alumno lo necesita para ver la info de la
 * sesion. NO requiere password de maestro.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const session = await db.classSession.findUnique({
    where: { token },
    select: {
      id: true,
      name: true,
      startsAt: true,
      endsAt: true,
      isActive: true,
    },
  })
  if (!session) {
    return NextResponse.json(
      { error: 'Sesion no encontrada o QR invalido' },
      { status: 404 }
    )
  }
  const now = new Date()
  const isWindowOpen =
    session.isActive && now >= session.startsAt && now <= session.endsAt
  return NextResponse.json({
    session: {
      id: session.id,
      name: session.name,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      isActive: session.isActive,
      isWindowOpen,
    },
  })
}

/**
 * PATCH /api/sessions/[token]
 * Cierra (o reabre) una sesion manualmente desde el panel del maestro.
 * Body: { isActive: boolean }
 *
 * IMPORTANTE: Cuando reabres (isActive = true), se EXTIENDE el endsAt
 * automaticamente por la duracion original de la sesion.
 * Asi el QR vuelve a estar vigente desde el momento en que lo abres.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  if (!checkTeacherAuth(req)) {
    return unauthorizedResponse()
  }
  const { token } = await params
  const body = await req.json().catch(() => ({}))
  const isActive = Boolean(body.isActive)

  // Si vamos a reabrir la sesion, calculamos nuevo endsAt = ahora + duracion original
  // Si vamos a cerrar, dejamos endsAt como esta (para que el maestro sepa cuando caduco)
  const now = new Date()
  const updateData: { isActive: boolean; endsAt?: Date } = { isActive }

  if (isActive) {
    // Necesitamos leer la duracion original de la sesion primero
    const existing = await db.classSession.findUnique({
      where: { token },
      select: { durationMin: true },
    })
    if (!existing) {
      return NextResponse.json(
        { error: 'Sesion no encontrada' },
        { status: 404 }
      )
    }
    // Nuevo endsAt: ahora + durationMin originales
    updateData.endsAt = new Date(now.getTime() + existing.durationMin * 60_000)
    // Tambien actualizamos startsAt para que la ventana "ahora" tenga sentido
    updateData as { isActive: boolean; endsAt?: Date; startsAt?: Date }
    ;(updateData as { startsAt?: Date }).startsAt = now
  }

  const session = await db.classSession.update({
    where: { token },
    data: updateData,
  })
  return NextResponse.json({ session })
}
/**
 * DELETE /api/sessions/[token]
 * Borra la sesion y, por cascade (ver schema Prisma), tambien borra
 * todos los registros de asistencia asociados. No se puede deshacer.
 * Requiere password de maestro.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  if (!checkTeacherAuth(req)) {
    return unauthorizedResponse()
  }
  const { token } = await params
  try {
    await db.classSession.delete({ where: { token } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: 'No se pudo borrar la sesion (quizas ya no existe)' },
      { status: 404 }
    )
  }
}
