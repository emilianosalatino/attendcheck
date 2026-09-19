import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkTeacherAuth, unauthorizedResponse } from '@/lib/auth'

/**
 * GET /api/sessions/[token]/attendance
 * Lista los registros de asistencia de una sesion (panel del profesor).
 * Incluye los marcados como sospechosos.
 * Requiere password de maestro.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  if (!checkTeacherAuth(req)) {
    return unauthorizedResponse()
  }
  const { token } = await params
  const session = await db.classSession.findUnique({
    where: { token },
    select: { id: true },
  })
  if (!session) {
    return NextResponse.json(
      { error: 'Sesion no encontrada' },
      { status: 404 }
    )
  }
  const attendances = await db.attendance.findMany({
    where: { sessionId: session.id },
    orderBy: { submittedAt: 'asc' },
  })
  return NextResponse.json({ attendances })
}
