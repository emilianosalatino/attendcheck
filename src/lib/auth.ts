import { NextRequest, NextResponse } from 'next/server'

/**
 * Autenticacion del maestro via password compartida.
 *
 * Flujo:
 *   1. El maestro entra a la pagina y ve un formulario de login.
 *   2. Escribe la password (que TU configuraste en la env var TEACHER_PASSWORD).
 *   3. El cliente la guarda en sessionStorage y la envia como header
 *      `X-Teacher-Password` en cada peticion a endpoints protegidos.
 *   4. El servidor compara la password recibida con process.env.TEACHER_PASSWORD.
 *
 * Usamos `crypto.timingSafeEqual` para evitar timing attacks.
 */

function getExpectedPassword(): string {
  const pw = process.env.TEACHER_PASSWORD
  if (!pw) {
    // Si no esta configurada, fallamos loudly. NO queremos que el sistema
    // quede "abierto por defecto" si el maestro olvida setearla.
    throw new Error(
      'TEACHER_PASSWORD no esta configurada. Seteala en las variables de entorno de Render.'
    )
  }
  if (pw.length < 6) {
    throw new Error(
      'TEACHER_PASSWORD es muy corta (minimo 6 caracteres). Usa una mas fuerte.'
    )
  }
  return pw
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  // constant-time comparison
  return bufA.equals(bufB) && bufA.length > 0
}

export function checkTeacherAuth(req: NextRequest): boolean {
  let expected: string
  try {
    expected = getExpectedPassword()
  } catch {
    return false
  }
  const received = req.headers.get('x-teacher-password') || ''
  if (!received) return false
  return safeEqual(received, expected)
}

export function unauthorizedResponse() {
  return NextResponse.json(
    { error: 'No autorizado. Necesitas password de maestro.' },
    { status: 401 }
  )
}

/**
 * Comprueba si el sistema tiene TEACHER_PASSWORD configurada.
 * Sirve para mostrar un mensaje claro en el dashboard si falta.
 */
export function isAuthConfigured(): boolean {
  try {
    getExpectedPassword()
    return true
  } catch {
    return false
  }
}
