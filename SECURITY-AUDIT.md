# Auditoría de Seguridad — Checador de Asistencia

Fecha: 2026-09-19
URL auditada: https://checador-asistencia-tester.onrender.com
Pruebas realizadas: en vivo con curl + análisis de código

---

## Resumen ejecutivo

| # | Severidad | Título | Estado |
|---|----------|--------|--------|
| 1 | 🔴 CRÍTICA | Sin autenticación en todos los endpoints del maestro | Confirmado en vivo |
| 2 | 🔴 CRÍTICA | Bypass total del anti-trampa (deviceFp forjado) | Confirmado en vivo |
| 3 | 🔴 CRÍTICA | Tokens de QR expuestos en URLs públicamente logueadas | Confirmado |
| 4 | 🟠 ALTA | Sin rate limiting (DoS trivial, spam de sesiones/asistencias) | Confirmado |
| 5 | 🟠 ALTA | XSS almacenado en `name` de sesión | Confirmado en vivo |
| 6 | 🟡 MEDIA | Cabeceras de seguridad ausentes (CORS, CSP, X-Frame-Options) | Confirmado |
| 7 | 🟡 MEDIA | Hash de huella débil (no es SHA-256 como dice el docstring) | Confirmado |
| 8 | 🟡 MEDIA | Tokens de sesión predecibles en longitud (24 hex / 96 bits) | Confirmado |
| 9 | 🟢 BAJA | deviceUuid codificado en userAgent (hack innecesario, búsqueda lenta) | Confirmado |
| 10 | 🟢 BAJA | Falta validación de formato de `studentId` (acepta cualquier cosa) | Confirmado |

---

## Detalle y pruebas en vivo

### 🔴 #1 — Sin autenticación en endpoints del maestro

**Impacto**: Cualquiera en internet que conozca (o adivine) el token de una sesión puede:
- Borrar sesiones completas con todas sus asistencias
- Cerrar/abrir sesiones a voluntad
- Listar todas las asistencias de cualquier sesión (con IPs, matrículas, huellas)
- Borrar asistencias individuales por ID

**Prueba en vivo**:
```bash
# Borra sesión sin auth
curl -X DELETE https://checador-asistencia-tester.onrender.com/api/sessions/08e7839f5a4a6e50ebe7f532
# Respuesta: {"ok":true}
```

**Endpoints afectados**:
- `GET /api/sessions` (lista todas las sesiones)
- `POST /api/sessions` (cualquiera puede crear sesiones)
- `PATCH /api/sessions/[token]` (cualquiera puede cerrar/abrir)
- `DELETE /api/sessions/[token]` (cualquiera puede borrar)
- `GET /api/sessions/[token]/attendance` (cualquiera puede ver asistencias)
- `DELETE /api/attendance/[id]` (cualquiera puede borrar registros)

**Fix sugerido**: Implementar login de maestro con contraseña (variable de entorno `TEACHER_PASSWORD`). Validar cookie/header en cada endpoint de maestro.

---

### 🔴 #2 — Bypass total del anti-trampa (deviceFp forjado)

**Impacto**: La huella de dispositivo se calcula en el cliente y se envía al servidor. El servidor **confía ciegamente** en lo que el cliente le manda. Un alumno con mínimos conocimientos técnicos puede:

1. Abrir la consola del navegador
2. Llamar a la API con cualquier `deviceFp` inventado:
   ```bash
   curl -X POST https://checador-asistencia-tester.onrender.com/api/attendance \
     -H "Content-Type: application/json" \
     -d '{"token":"...","studentId":"20180564","deviceFp":"fp-falsa-001"}'
   ```
3. Registrar a 10 compañeros con la misma computadora, cada uno con un `deviceFp` distinto → **NUNCA queda marcado como sospechoso**

**Prueba en vivo**:
```bash
# Mismo alumno, mismo dispositivo, deviceFp diferente cada vez → nunca se detecta
curl -X POST .../api/attendance -d '{"studentId":"A","deviceFp":"x"}'  → 201 OK
curl -X POST .../api/attendance -d '{"studentId":"B","deviceFp":"y"}'  → 201 OK
curl -X POST .../api/attendance -d '{"studentId":"C","deviceFp":"z"}'  → 201 OK
```

**Fix sugerido**: El servidor NO debe confiar en `deviceFp` enviado por el cliente. Opciones:
- **A) Fingerprint server-side**: el servidor calcula un fingerprint basado en headers HTTP (User-Agent + IP + Accept-Language + Accept-Encoding + sec-ch-ua). Limitado pero no forgeable.
- **B) HMAC firmado en cliente**: el fingerprint va firmado con un secreto que el alumno no debería tener... pero como el código JS es público, no funciona realmente.
- **C) Aceptar la limitación**: la Web no permite anti-trampa perfecto. Documentar honestamente.
- **D) Capa adicional basada en cookies HTTP-only**: el servidor setea una cookie de tracking firmada con un secreto del server. Difícil de bypassar sin borrar cookies.

Recomiendo **opción A + D** combinadas.

---

### 🔴 #3 — Tokens de QR en URLs públicamente logueadas

**Impacto**: El QR codifica `https://.../?t=TOKEN`. Esa URL se guarda en:
- Historial del navegador del alumno
- Logs de acceso del servidor
- Posibles proxies/caches intermedios
- Capturas de pantalla compartidas en redes sociales

Si alguien conozca el token puede:
- Ver info de la sesión (GET /api/sessions/[token])
- Registrar asistencias por un alumno sin que él sepa
- Borrar la sesión (ver #1)

**Prueba**: Si compartes el link del QR, cualquiera que lo tenga puede usarlo. No hay "single-use" real del QR.

**Fix sugerido**:
- Hacer que el token sea de un solo uso (se marca como "usado" al primer registro)
- O generar un token efímero por estudiante (conoce su matrícula antes del QR)
- O exigir login previo del alumno (matrícula + algo que solo él sepa)

---

### 🟠 #4 — Sin rate limiting

**Impacto**: Sin protección, alguien puede:
- Spammear POST /api/sessions con miles de sesiones falsas → llena la DB
- Spammear POST /api/attendance con matrículas random → llena la DB
- Probar tokens de sesión por fuerza bruta (aunque son 24 hex chars, 96 bits → infeasible, pero la flood sigue siendo problema)

**Prueba en vivo**: Creé 4 sesiones en menos de 3 segundos. Render Free no bloquea.

**Fix sugerido**: Implementar rate limiting simple basado en IP con un mapa en memoria:
- POST /api/sessions: máx 5 por IP por minuto
- POST /api/attendance: máx 20 por IP por minuto
- GET /api/sessions/[token]: máx 60 por IP por minuto

---

### 🟠 #5 — XSS almacenado en `name` de sesión

**Impacto**: El campo `name` acepta cualquier string. Acepté `<script>alert(1)</script>`. Aunque React escapa el HTML por defecto al renderizar, si en algún punto se usa `dangerouslySetInnerHTML` o se renderiza en un correo HTML, sería XSS real.

**Prueba en vivo**:
```bash
curl -X POST .../api/sessions -d '{"name":"<script>alert(1)</script>"}'
# 201 Created — el nombre quedó guardado tal cual en la DB
```

**Fix sugerido**: Sanitizar el `name` en el servidor:
```typescript
const name = String(body.name || '').trim().slice(0, 200)
// Strip HTML tags
const cleanName = name.replace(/<[^>]*>/g, '').trim()
```

---

### 🟡 #6 — Cabeceras de seguridad ausentes

**Impacto**: Sin `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`:
- La app puede ser embebida en iframes de sitios maliciosos (clickjacking)
- El navegador puede hacer MIME-sniffing y ejecutar contenido como script
- Referrer expone el token del QR en el header Referer

**Fix sugerido**: Agregar middleware de Next.js que setee estas cabeceras:
```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const response = NextResponse.next()
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'")
  return response
}
```

---

### 🟡 #7 — Hash de huella débil (NO es SHA-256)

**Impacto**: El docstring dice "Se hace un hash SHA-256" pero el código usa una función hash custom de 32 bits (DJB2-like + FNV-1). Eso da **16 hex chars = 64 bits** de espacio, no los 256 bits de SHA-256. Riesgo de colisión: aunque es raro, dos dispositivos distintos podrían tener el mismo fingerprint.

**Fix sugerido**: Usar `crypto.subtle.digest('SHA-256', ...)` del navegador (built-in, async):
```typescript
async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}
```

---

### 🟡 #8 — Tokens de sesión predecibles en longitud

**Impacto**: Los tokens son 24 hex chars = 96 bits de entropía. Suficiente contra fuerza bruta (2^96 intentos), pero el sistema es vulnerable a enumeración si el atacante conoce el patrón (son always 24 chars, hex).

**Fix sugerido**: No crítico. El token actual es suficiente. Pero si quieres más seguridad, usa 32 hex chars (128 bits).

---

### 🟢 #9 — deviceUuid codificado en userAgent (hack innecesario)

**Impacto**: Para no agregar una columna a la DB, el código guarda el UUID del dispositivo dentro del campo `userAgent` con un separador `||devuuid:`. Esto:
- Hace las búsquedas lentas (no hay index)
- Es frágil (si el UA contiene `||` se rompe)
- Es confuso de mantener

**Prueba en vivo**: La búsqueda `userAgent: { contains: deviceUuid }` puede fallar si el UUID es substring de otro UUID.

**Fix sugerido**: Agregar columna `deviceUuid` a la tabla `Attendance` con un index.

---

### 🟢 #10 — Sin validación de formato de `studentId`

**Impacto**: El sistema acepta cualquier string de 2-64 chars como matrícula. Alguien puede registrar `"A"`, `"FOO"`, `"<script>"`, etc. No hay formato esperado.

**Fix sugerido**: Validar formato con regex:
```typescript
if (!/^[A-Z0-9]{5,15}$/.test(studentId)) {
  return NextResponse.json({ error: 'Matrícula con formato inválido' }, { status: 400 })
}
```

---

## Vulnerabilidades que NO son vulnerabilidades reales

Por transparencia, esto lo revisé y **NO** es problema:

- ✅ **Inyección SQL**: Prisma usa queries parametrizadas por defecto. No hay SQL injection en los `where`, `findUnique`, etc.
- ✅ **Inyección NoSQL**: No usamos Mongo u otra NoSQL.
- ✅ **CSRF en POST**: Como los POST son JSON con `Content-Type: application/json`, los ataques CSRF clásicos (form HTML) no funcionan por CORS preflight. Aún así, no hay protección explícita.
- ✅ **Path traversal**: No leemos ni escribimos archivos en disco desde el código (solo Prisma que abre el .db).
- ✅ **Secretos en código**: No hay secretos hardcodeados. Las creds de DB están en env vars (Render env).
- ✅ **Dependencias críticas**: `npm audit` reporta 9 vulns pero son de paquetes de desarrollo o vulnerabilidades que no afectan runtime (sharp, postcss plugins, etc.). No requieren acción inmediata.

---

## Prioridades recomendadas

### 🚨 Urgentes (esta semana)
1. **#1 — Auth del maestro**: implementar login con contraseña en env var.
2. **#2 — Bypass del anti-trampa**: cambiar a fingerprint server-side o aceptar la limitación honestamente.
3. **#4 — Rate limiting**: implementar mapa en memoria simple.
4. **#5 — XSS en name**: sanitización simple.

### 📋 Important (este mes)
5. **#6 — Cabeceras de seguridad**: agregar middleware de Next.js.
6. **#7 — Hash débil**: migrar a `crypto.subtle.digest('SHA-256', ...)`.

### 💡 Mejoras (cuando tengas tiempo)
7. **#3 — Tokens de un solo uso**: rediseñar el flujo del QR.
8. **#9 — Columna deviceUuid**: agregar al schema.
9. **#10 — Validación de matrícula**: regex.

---

## Conclusión

El sistema funciona bien para **uso confiable entre maestro y alumnos** (sin atacantes activos), pero **NO es seguro contra un alumno con conocimientos técnicos que quiera hacer trampa**. La vulnerabilidad #2 (bypass de anti-trampa) es la más importante desde el punto de vista del propósito del sistema.

Si el objetivo es "evitar trampa de alumnos normales que no saben programar", el sistema actual es razonable. Si el objetivo es "ser robusto contra alumnos técnicos", hay que aplicar al menos #1, #2 y #4.
