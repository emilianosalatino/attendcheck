import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  computeServerFingerprint,
  getOrCreateTrackingUuid,
} from '@/lib/server-fingerprint'

/**
 * POST /api/attendance
 * Registra la asistencia de un alumno.
 *
 * ESTE ENDPOINT ES PUBLICO: el alumno lo necesita.
 *
 * Body (lo que el cliente envia):
 *   {
 *     token: string         // token de la sesion (del QR)
 *     studentId: string     // matricula o numero de control
 *   }
 *
 * Lo que el servidor calcula (NO confia en el cliente):
 *   - deviceFp:   SHA-256 de (User-Agent + Accept-Language + sec-ch-ua + IP)
 *   - trackingUuid: UUID de la cookie HTTP-only firmada (asist_track)
 *
 * Anti-trampa (varias capas):
 *   1. La sesion debe existir y estar dentro de su ventana de tiempo.
 *   2. La misma matricula no puede registrar dos veces la misma sesion (unique constraint).
 *   3. Si el mismo deviceFp (server-side) ya registro con OTRA matricula -> flag.
 *   4. Si el mismo trackingUuid (cookie firmada) ya registro con otra matricula -> flag.
 *   5. Si la ventana ya cerro -> rechazar con error.
 *
 * IMPORTANTE: el cliente ya NO envia deviceFp. El servidor lo calcula.
 * Si el cliente intenta mandar un deviceFp en el body, se IGNORA.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const token = String(body.token || '').trim()
  const studentId = String(body.studentId || '').trim().toUpperCase()

  if (!token || !studentId) {
    return NextResponse.json(
      { error: 'Faltan datos (token o matricula)' },
      { status: 400 }
    )
  }
  // Validacion de formato de matricula: 2-15 alfanumerico
  if (!/^[A-Z0-9]{2,15}$/.test(studentId)) {
    return NextResponse.json(
      { error: 'Matricula con formato invalido (solo letras y numeros, 2-15 caracteres)' },
      { status: 400 }
    )
  }

  const session = await db.classSession.findUnique({
    where: { token },
  })
  if (!session) {
    return NextResponse.json(
      { error: 'Sesion no encontrada o QR invalido' },
      { status: 404 }
    )
  }

  const now = new Date()
  if (!session.isActive) {
    return NextResponse.json(
      { error: 'La sesion fue cerrada por el maestro' },
      { status: 403 }
    )
  }
  if (now < session.startsAt) {
    return NextResponse.json(
      { error: 'La sesion aun no abre' },
      { status: 403 }
    )
  }
  if (now > session.endsAt) {
    return NextResponse.json(
      { error: 'El QR ya caduco. Pide a tu maestro generar uno nuevo.' },
      { status: 403 }
    )
  }

  // === FINGERPRINT SERVER-SIDE (NO confia en el cliente) ===
  const deviceFp = computeServerFingerprint(req)

  // Creamos o leemos la cookie firmada HTTP-only.
  // Importante: creamos la response primero para poder setear la cookie.
  const response = NextResponse.json({}, { status: 200 })
  const trackingUuid = getOrCreateTrackingUuid(req, response)

  // IP y User-Agent del cliente (para auditoria)
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  const userAgent = req.headers.get('user-agent') || ''

  // Anti-trampa 1: esta matricula ya registro?
  const existingMat = await db.attendance.findUnique({
    where: { sessionId_studentId: { sessionId: session.id, studentId } },
  })
  if (existingMat) {
    return NextResponse.json(
      {
        error:
          'Tu matricula ya fue registrada en esta sesion. No puedes registrar dos veces.',
        duplicate: true,
      },
      { status: 409 }
    )
  }

  // Anti-trampa 2: mismo deviceFp (server-side) con otra matricula?
  const sameDeviceDiffMat = await db.attendance.findFirst({
    where: {
      sessionId: session.id,
      deviceFp,
      NOT: { studentId },
    },
  })

  // Anti-trampa 3: mismo trackingUuid con otra matricula?
  const sameUuidDiffMat = await db.attendance.findFirst({
    where: {
      sessionId: session.id,
      userAgent: { contains: `uuid:${trackingUuid}` },
      NOT: { studentId },
    },
  })

  let flagged = false
  let flagReason: string | null = null
  if (sameDeviceDiffMat) {
    flagged = true
    flagReason = `Mismo dispositivo (huella server-side) registro antes con la matricula ${sameDeviceDiffMat.studentId}`
  } else if (sameUuidDiffMat) {
    flagged = true
    flagReason = `Mismo dispositivo (cookie de tracking) registro antes con la matricula ${sameUuidDiffMat.studentId}`
  }

  // Guardamos el trackingUuid codificado en el userAgent (mantenemos schema ligero)
  const uaWithUuid = `${userAgent}||uuid:${trackingUuid}`

  const attendance = await db.attendance.create({
    data: {
      sessionId: session.id,
      studentId,
      deviceFp,
      ip,
      userAgent: uaWithUuid,
      flagged,
      flagReason,
    },
  })

  // Devolvemos la response CON la cookie seteada (si es nueva)
  return NextResponse.json(
    {
      ok: true,
      attendance: {
        id: attendance.id,
        studentId: attendance.studentId,
        submittedAt: attendance.submittedAt,
        flagged: attendance.flagged,
        flagReason: attendance.flagReason,
      },
    },
    {
      status: 201,
      headers: response.headers, // incluye Set-Cookie
    }
  )
}
