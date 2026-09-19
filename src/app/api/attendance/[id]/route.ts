import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkTeacherAuth, unauthorizedResponse } from '@/lib/auth'

/**
 * DELETE /api/attendance/[id]
 * Borra un registro individual de asistencia.
 * Requiere password de maestro.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkTeacherAuth(req)) {
    return unauthorizedResponse()
  }
  const { id } = await params
  try {
    await db.attendance.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: 'No se pudo borrar el registro (quizas ya no existe)' },
      { status: 404 }
    )
  }
}
