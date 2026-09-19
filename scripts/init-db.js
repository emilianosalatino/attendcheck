/**
 * Inicializa el schema de la base de datos en Turso (o SQLite local).
 *
 * Por que NO usamos `prisma db push` en produccion:
 *   - Prisma CLI con provider="sqlite" rechaza URLs tipo "libsql://..."
 *   - Por eso este script aplica el schema via @libsql/client, que SI acepta
 *     tanto URLs "file:" como "libsql://".
 *
 * Uso:
 *   DATABASE_URL="libsql://..." DATABASE_AUTH_TOKEN="..." node scripts/init-db.js
 *   o
 *   DATABASE_URL="file:./db/custom.db" node scripts/init-db.js
 */
import { createClient } from '@libsql/client'

const SCHEMA_SQL = `
-- Tabla de sesiones de clase
CREATE TABLE IF NOT EXISTS "ClassSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de registros de asistencia
CREATE TABLE IF NOT EXISTS "Attendance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "deviceFp" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "flagged" BOOLEAN NOT NULL DEFAULT 0,
    "flagReason" TEXT,
    FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE CASCADE
);

-- Indices para busquedas rapidas
CREATE UNIQUE INDEX IF NOT EXISTS "ClassSession_token_key" ON "ClassSession"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "Attendance_sessionId_studentId_key" ON "Attendance"("sessionId", "studentId");
CREATE INDEX IF NOT EXISTS "Attendance_sessionId_idx" ON "Attendance"("sessionId");
CREATE INDEX IF NOT EXISTS "Attendance_deviceFp_idx" ON "Attendance"("deviceFp");
CREATE INDEX IF NOT EXISTS "Attendance_studentId_idx" ON "Attendance"("studentId");
`

async function main() {
  const url = process.env.DATABASE_URL
  const token = process.env.DATABASE_AUTH_TOKEN || undefined

  if (!url) {
    console.error('ERROR: Falta DATABASE_URL en variables de entorno')
    process.exit(1)
  }

  console.log('Conectando a:', url.replace(/\/\/.*@/, '//***@'))
  const client = createClient({ url, authToken: token })

  // Ejecutamos cada statement por separado porque libsql no soporta
  // multiples sentencias en una sola llamada a execute()
  const statements = SCHEMA_SQL.split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  let count = 0
  for (const stmt of statements) {
    try {
      await client.execute(stmt)
      count++
      const preview = stmt.replace(/\s+/g, ' ').slice(0, 60)
      console.log('  OK:', preview, '...')
    } catch (err) {
      const msg = err.message || ''
      if (msg.includes('already exists') || msg.includes('UNIQUE constraint')) {
        continue
      }
      console.error('  ERROR:', msg)
      throw err
    }
  }

  console.log('\nOK: Schema aplicado.', count, 'sentencias ejecutadas.')
  process.exit(0)
}

main().catch((err) => {
  console.error('\nERROR: Falló la inicializacion del schema:')
  console.error(err)
  process.exit(1)
})
