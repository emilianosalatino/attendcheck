# Checador de Asistencia por QR

Sistema ligero para controlar asistencia en clases mediante QR. El maestro genera un QR con vigencia limitada, los alumnos lo escanean y registran su matrícula. El sistema detecta trampa si un mismo dispositivo intenta registrarse con varias matrículas.

## Stack

- **Next.js 16** (App Router, output: standalone) + TypeScript
- **Prisma ORM** con **libSQL adapter** (SQLite local o Turso en la nube)
- **Tailwind CSS 4** + **shadcn/ui**
- **qrcode.react** para generar QR
- Middleware de cabeceras de seguridad (CSP-ready, X-Frame-Options, HSTS, etc.)

## ⚠️ IMPORTANTE — Versión con seguridad

Esta versión incluye los fixes de los issues críticos del audit:
- ✅ **#1 Auth del maestro**: todos los endpoints del maestro requieren password
- ✅ **#2 Anti-trampa server-side**: la huella del dispositivo la calcula el servidor (no el cliente)
- ✅ **#5 XSS en name**: sanitización de HTML en el servidor
- ✅ **#6 Cabeceras de seguridad**: middleware global con X-Frame-Options, HSTS, etc.
- ✅ **#10 Validación de matrícula**: solo letras y números, 2-15 chars

Necesitas configurar una nueva env var: **`TEACHER_PASSWORD`** (mínimo 6 caracteres).

## Deploy en Render.com + Turso (gratis para siempre)

Guía de cero a producción. ~15 min.

### Requisitos

- Cuenta en GitHub (gratuita)
- Cuenta en Turso (gratuita, login con GitHub)
- Cuenta en Render.com (gratuita, login con GitHub)

### Paso 1 — Subir el código a GitHub

1. Descomprime `checador-asistencia.zip` en tu computadora.
2. Crea un repo nuevo en GitHub (público o privado): <https://github.com/new>
   - Nombre: `checador-asistencia`
   - **NO marques** "Add a README", "Add .gitignore", "Choose a license"
3. Sube todos los archivos del ZIP al repo (drag & drop). **NO subas**:
   - `node_modules/`
   - `.next/`
   - `db/*.db`
4. Commit con el mensaje que quieras.

### Paso 2 — Crear la base de datos en Turso

1. Entra a <https://turso.tech>, login con GitHub.
2. **Create Database**:
   - Name: `checador`
   - Location: AWS US East (Virginia) o la más cercana
   - Type: SQLite
3. Entra a la base de datos creada → copia la **URL** (algo como `libsql://checador-xxxxx.aws-us-east-1.turso.io`)
4. Ve a **Settings → Authentication Tokens → Create Token** → nombre `checador-prod` → copia el token
5. Anota estos dos valores:
   - **DATABASE_URL** = `libsql://checador-xxxxx.turso.io`
   - **DATABASE_AUTH_TOKEN** = `tu-token-largo`

### Paso 3 — Crear Web Service en Render

1. Entra a <https://dashboard.render.com> → **New +** → **Web Service**
2. **Connect a repository** → selecciona `checador-asistencia`
3. Completa:
   - **Name**: `checador-asistencia`
   - **Language**: Node (se detecta solo)
   - **Region**: la más cercana a tu escuela
   - **Branch**: `main`
   - **Runtime**: Node.js (default)
   - **Build Command** (copia y pega tal cual):
     ```
     npm install && npm run db:generate && npm run db:init && npm run build
     ```
   - **Start Command** (copia y pega tal cual):
     ```
     npm run start
     ```
   - **Instance Type**: **Free** (suficiente para uso educativo)
4. Baja hasta **Environment Variables** y agrega **3 variables**:

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | `libsql://checador-xxxxx.turso.io` (tu URL de Turso) |
   | `DATABASE_AUTH_TOKEN` | tu token de Turso |
   | `TEACHER_PASSWORD` | contraseña del maestro, mínimo 6 caracteres (elíge una fuerte) |

   > ⚠️ NO agregues `NODE_ENV` ni `HOSTNAME` — ya están baked en el código.

5. **Create Web Service**. Render tarda 3-5 min en el primer deploy.

### Paso 4 — Verificar

1. Cuando veas `==> Your service is live 🎉` en el log, abre tu URL:
   `https://checador-asistencia.onrender.com`
2. Render free tarda ~50s en despertar la primera vez. Sé paciente.
3. Debe cargar la **pantalla de login del maestro**.
4. Escribe tu `TEACHER_PASSWORD` → verás el dashboard.
5. Crea una sesión → mira el QR → copia el enlace del QR en otra pestaña → registra una matrícula → vuelve al dashboard → presiona "Lista" → debe aparecer la asistencia. ✓

## Cómo usarlo

### Como maestro
1. Abre la URL de tu app (sin parámetros en la URL).
2. **Pantalla de login**: escribe tu `TEACHER_PASSWORD`. Se guarda en `sessionStorage` (se borra al cerrar la pestaña).
3. Escribe el nombre de la clase.
4. Define la vigencia del QR en minutos (default 15).
5. Presiona **Generar QR**.
6. Proyecta el QR o copia el enlace directo y compártelo.
7. Para ver quién llegó: presiona **Lista** en la sesión.
8. Para exportar: botón **CSV** dentro de la lista.
9. Para borrar una asistencia individual: botón trash en cada fila.
10. Para borrar una sesión completa: botón trash en la tarjeta de la sesión.
11. Para cerrar sesión: botón **Salir** arriba a la derecha.

### Como alumno
1. Escanea el QR con la cámara del celular (o abre el enlace directo).
2. Se abre la página de registro con el nombre de la clase y un contador de tiempo.
3. Escribe tu matrícula o número de control (solo letras y números, 2-15 caracteres).
4. Presiona **Registrar asistencia**.
5. Si todo sale bien, verás un mensaje de éxito.
6. Si intentas registrar dos veces la misma matrícula → se rechaza.
7. Si intentas registrar con otra matrícula desde el mismo dispositivo/navegador → queda marcado como **sospechoso**.

## Medidas anti-trampa (mejoradas en esta versión)

Las **direcciones MAC no son accesibles desde el navegador** por seguridad. En su lugar, este sistema usa varias capas:

1. **Token de un solo uso** — el QR lleva un token aleatorio de 32 caracteres hex (128 bits).
2. **Ventana de tiempo** — el QR caduca a los X minutos definidos (default 15).
3. **Matrícula única por sesión** — restricción en la base de datos.
4. **Huella SERVER-SIDE** ⭐ — SHA-256 de (User-Agent + Accept-Language + sec-ch-ua + IP). El servidor calcula esta huella, no confía en el cliente. Un alumno con curl no puede forjarla trivialmente.
5. **Cookie HTTP-only firmada** ⭐ — el servidor setea una cookie `asist_track` firmada con un secreto. El alumno no puede leerla ni forjarla desde JS.
6. **Auth del maestro** — todos los endpoints sensibles requieren password.

### Limitaciones honestas

Ningún sistema web es 100% anti-trampa. Un alumno técnico podría:
- Usar varios navegadores distintos (uno por matrícula) → cookies distintas, huellas distintas.
- Limpiar cookies entre cada registro → cookies nuevas.
- Usar curl con headers custom → bypass temporal (aunque la IP sigue siendo la misma).

El sistema eleva la barrera de "mandar un curl con datos falsos" a "configurar extensiones de navegador o usar varios navegadores", que ya es mucho trabajo. Para usos más rigurosos (alto valor, como exámenes finales), considera complementar con video conferencia sincrónica.

## Auditoría de seguridad

Se realizó una auditoría completa en `SECURITY-AUDIT.md`. Esta versión aplica los fixes de los issues críticos (#1, #2, #5, #6) y menores (#10). Los issues pendientes:
- #3 — Tokens de un solo uso (rediseño del flujo QR, pendiente)
- #4 — Rate limiting (pendiente, bajo riesgo con auth)
- #7 — Hash débil del fingerprint anterior (ya resuelto: ahora usa SHA-256 real)
- #8 — Longitud de token (ya resuelto: ahora es 32 chars / 128 bits)
- #9 — Columna deviceUuid (pendiente, no crítico)

## ⚠️ Sobre el "sleep" en Render Free

El plan free de Render **duerme tras 15 minutos sin actividad**. La primera vez que abres la URL tarda ~50s en despertar.

**Recomendación**: tú (maestro) abre la URL primero para que despierte, y **después** genera el QR.

## Backup de datos

- **En Turso**: backups automáticos. Puedes exportar desde el dashboard si quieres una copia local.

## Actualizar la app cuando cambies código

Solo `git push` a tu repo. Render detecta el cambio y redespliega en 2-3 min.

## Scripts disponibles

```bash
npm run dev          # Desarrollo local con SQLite
npm run build        # Build de producción
npm run start        # Servidor de producción
npm run lint         # Verificar calidad de código
npm run db:generate  # Regenerar Prisma Client
npm run db:init      # Aplicar schema SQL a la DB (funciona con SQLite y Turso)
npm run db:push      # Alternativa a db:init, SOLO para SQLite local (falla con Turso)
npm run db:reset     # Borrar y recrear la base de datos (¡borra datos!)
```

## Instalación local (con SQLite)

```bash
cd checador-asistencia
npm install
cat > .env <<EOF
DATABASE_URL="file:./db/custom.db"
TEACHER_PASSWORD="tu_password_local"
EOF
mkdir -p db
npm run db:generate
npm run db:init
npm run dev
```

Abrir <http://localhost:3000>. Te pedirá la password de maestro.

## Variables de entorno

| Variable | Dónde | Para qué |
|----------|-------|----------|
| `DATABASE_URL` | Render env, .env local | URL de Turso (`libsql://...`) o SQLite local (`file:./db/custom.db`) |
| `DATABASE_AUTH_TOKEN` | Render env | Token de Turso (vacío para SQLite local) |
| `TEACHER_PASSWORD` | Render env, .env local | Contraseña para acceder al dashboard del maestro (mínimo 6 chars) |
| `TRACKING_SECRET` | Render env (opcional) | Secreto para firmar cookies de tracking. Si no se setea, deriva de TEACHER_PASSWORD |
| `NODE_ENV` | (auto-set por Render/Next.js) | No la setees manualmente — rompe el build |
| `HOSTNAME` | (auto-set en start script) | No la setees — el código ya la fuerza a `0.0.0.0` |

## Licencia

Código libre para uso educativo.
