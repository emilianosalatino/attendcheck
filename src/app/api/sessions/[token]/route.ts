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
 * Requiere password de maestro.
 *
 * Body: { isActive: boolean }
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
  const session = await db.classSession.update({
    where: { token },
    data: { isActive },
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
