'use client'

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import {
  Clock,
  Copy,
  Download,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  StopCircle,
  Play,
  CheckCircle2,
  AlertTriangle,
  Users,
  Calendar,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'

import { useTeacherAuth } from '@/hooks/use-teacher-auth'

type SessionInfo = {
  id: string
  name: string
  token: string
  startsAt: string
  endsAt: string
  durationMin: number
  isActive: boolean
  _count?: { attendances: number }
  createdAt: string
}

type StudentSessionInfo = {
  id: string
  name: string
  startsAt: string
  endsAt: string
  isActive: boolean
  isWindowOpen: boolean
}

type AttendanceRow = {
  id: string
  studentId: string
  deviceFp: string
  ip: string | null
  userAgent: string | null
  submittedAt: string
  flagged: boolean
  flagReason: string | null
}

function LoadingView() {
  return (
    <div className="grid place-items-center min-h-[60vh]">
      <Loader2 className="size-6 animate-spin text-zinc-400" />
    </div>
  )
}

function HomeInner() {
  // useSearchParams es la forma SSR-safe de leer query params en Next.js 16.
  // El componente padre (Home) lo envuelve en <Suspense> para evitar
  // el error de hydration mismatch.
  const searchParams = useSearchParams()
  const qrToken = searchParams.get('t')
  const view: 'teacher' | 'student' = qrToken ? 'student' : 'teacher'

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 text-zinc-900">
      <Toaster richColors position="top-center" />
      <header className="border-b bg-white">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-lg bg-emerald-600 text-white grid place-items-center">
              <QrCode className="size-5" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">Checador de Asistencia</div>
              <div className="text-[11px] text-zinc-500">
                Control de clases por QR · Anti-trampa
              </div>
            </div>
          </div>
          {qrToken && (
            <a
              href="/"
              className="text-[11px] text-zinc-500 hover:text-zinc-900"
            >
              Vista de maestro
            </a>
          )}
        </div>
      </header>

      <main className="flex-1">
        {view === 'teacher' && <TeacherDashboard />}
        {view === 'student' && qrToken && (
          <StudentAttendanceForm token={qrToken} />
        )}
      </main>

      <footer className="border-t bg-white">
        <div className="mx-auto max-w-6xl px-4 py-3 text-[11px] text-zinc-400">
          Hecho con stack ligero: Next.js + SQLite + Tailwind. La MAC no es
          accesible desde el navegador; usamos huella de dispositivo + ventana
          de tiempo + token de un solo uso.
        </div>
      </footer>
    </div>
  )
}

export default function Home() {
  return (
    <Suspense fallback={<LoadingView />}>
      <HomeInner />
    </Suspense>
  )
}

/* -------------------------- VISTA: PROFESOR -------------------------- */

function TeacherDashboard() {
  const { password, ready, login, logout, authedFetch } = useTeacherAuth()
  const [pwInput, setPwInput] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwChecking, setPwChecking] = useState(false)
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [duration, setDuration] = useState(15)
  const [creating, setCreating] = useState(false)
  const [qrSession, setQrSession] = useState<SessionInfo | null>(null)

  // Probar la password: hace un GET /api/sessions, si responde 200 esta OK
  const tryLogin = async () => {
    setPwChecking(true)
    setPwError(null)
    try {
      const res = await fetch('/api/sessions', {
        headers: { 'X-Teacher-Password': pwInput },
      })
      if (res.status === 401) {
        setPwError('Password incorrecta')
        return
      }
      if (!res.ok) {
        setPwError('Error al verificar password')
        return
      }
      const data = await res.json()
      setSessions(data.sessions || [])
      login(pwInput)
      toast.success('Sesion iniciada')
    } catch {
      setPwError('Error de red')
    } finally {
      setPwChecking(false)
    }
  }

  const load = useCallback(async () => {
    if (!password) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await authedFetch('/api/sessions')
      if (res.status === 401) {
        toast.error('Tu sesion expiro. Vuelve a loguearte.')
        return
      }
      const data = await res.json()
      setSessions(data.sessions || [])
    } catch (e) {
      toast.error('No se pudieron cargar las sesiones')
    } finally {
      setLoading(false)
    }
  }, [password, authedFetch])

  useEffect(() => {
    if (ready && password) {
      load()
      const id = setInterval(load, 15_000)
      return () => clearInterval(id)
    }
    setLoading(false)
  }, [ready, password, load])

  const createSession = async () => {
    if (!name.trim()) {
      toast.error('Escribe el nombre de la clase')
      return
    }
    setCreating(true)
    try {
      const res = await authedFetch('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), durationMin: duration }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error al crear sesion')
      }
      const data = await res.json()
      setName('')
      setDuration(15)
      await load()
      setQrSession(data.session as SessionInfo)
      toast.success('Sesion creada. Muestra el QR a tus alumnos.')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const toggleActive = async (s: SessionInfo) => {
    const next = !s.isActive
    try {
      await authedFetch(`/api/sessions/${s.token}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: next }),
      })
      await load()
      toast.success(next ? 'Sesion reabierta' : 'Sesion cerrada')
    } catch {
      toast.error('No se pudo cambiar el estado')
    }
  }

  const deleteSession = async (s: SessionInfo) => {
    try {
      const res = await authedFetch(`/api/sessions/${s.token}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'No se pudo borrar la sesion')
      }
      await load()
      toast.success('Sesion eliminada (y todas sus asistencias)')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  // --- Pantalla de login ---
  if (ready && !password) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 w-full">
        <Card className="border-emerald-200">
          <CardHeader>
            <div className="flex items-center gap-2 mb-1">
              <div className="size-9 rounded-lg bg-emerald-600 text-white grid place-items-center">
                <QrCode className="size-5" />
              </div>
              <CardTitle className="text-base">Acceso de maestro</CardTitle>
            </div>
            <CardDescription>
              Esta pagina es privada. Escribe la password que configuraste
              en la variable de entorno <code className="text-xs bg-zinc-100 px-1 rounded">TEACHER_PASSWORD</code> de Render.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="pw">Password</Label>
              <Input
                id="pw"
                type="password"
                placeholder="Tu password de maestro"
                value={pwInput}
                onChange={(e) => setPwInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') tryLogin()
                }}
                autoFocus
              />
            </div>
            {pwError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-2">
                {pwError}
              </div>
            )}
            <Button
              onClick={tryLogin}
              disabled={pwChecking || !pwInput}
              className="bg-emerald-600 hover:bg-emerald-700 text-white w-full"
            >
              {pwChecking ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              Entrar
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // --- Boton de logout arriba a la derecha ---
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 w-full relative">
      <div className="absolute right-4 top-4">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            logout()
            toast.success('Sesion cerrada')
          }}
          title="Cerrar sesion"
        >
          Salir
        </Button>
      </div>

      {/* Hero / nueva sesion */}
      <Card className="mb-6 border-emerald-200 bg-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="size-5 text-emerald-600" />
            Crear nueva sesion de clase
          </CardTitle>
          <CardDescription>
            Genera un QR con vigencia limitada. Tus alumnos lo escanean y
            registran su matricula. Detectamos trampa si el mismo dispositivo
            intenta registrar con otra matricula.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-[1fr_140px_auto]">
          <div className="grid gap-2">
            <Label htmlFor="name">Nombre de la clase</Label>
            <Input
              id="name"
              placeholder="Ej. Calculo Diferencial - Grupo A"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createSession()
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="dur">Vigencia (min)</Label>
            <Input
              id="dur"
              type="number"
              min={1}
              max={480}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value) || 15)}
            />
          </div>
          <div className="grid gap-2 items-end">
            <Button
              onClick={createSession}
              disabled={creating}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {creating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <QrCode className="size-4" />
              )}
              Generar QR
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista de sesiones */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
          <Users className="size-4" /> Sesiones recientes
        </h2>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw
            className={`size-4 ${loading ? 'animate-spin' : ''}`}
          />
          Refrescar
        </Button>
      </div>

      {loading && sessions.length === 0 ? (
        <div className="grid place-items-center py-12">
          <Loader2 className="size-5 animate-spin text-zinc-400" />
        </div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-zinc-500">
            No hay sesiones todavia. Crea una arriba para empezar.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {sessions.map((s) => (
            <SessionRow
              key={s.id}
              s={s}
              onShowQR={() => setQrSession(s)}
              onToggle={() => toggleActive(s)}
              onDelete={() => deleteSession(s)}
            />
          ))}
        </div>
      )}

      {qrSession && (
        <QRDialog session={qrSession} onClose={() => setQrSession(null)} />
      )}
    </div>
  )
}

function SessionRow({
  s,
  onShowQR,
  onToggle,
  onDelete,
}: {
  s: SessionInfo
  onShowQR: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const startsAt = new Date(s.startsAt)
  const endsAt = new Date(s.endsAt)
  const now = new Date()
  const isExpired = now > endsAt
  const status = !s.isActive
    ? 'closed'
    : isExpired
      ? 'expired'
      : 'active'
  const statusMap = {
    active: { label: 'Activa', color: 'bg-emerald-100 text-emerald-700' },
    expired: { label: 'Caducó', color: 'bg-zinc-100 text-zinc-600' },
    closed: { label: 'Cerrada', color: 'bg-red-100 text-red-700' },
  } as const

  return (
    <Card>
      <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                statusMap[status].color
              }`}
            >
              {statusMap[status].label}
            </span>
            <span className="text-[11px] text-zinc-500">
              {startsAt.toLocaleString('es-MX', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              -{' '}
              {endsAt.toLocaleTimeString('es-MX', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
          <div className="text-sm font-medium text-zinc-800 truncate">
            {s.name}
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5">
            {s._count?.attendances ?? 0} asistencia(s) registradas
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={onShowQR}>
            <QrCode className="size-4" /> Ver QR
          </Button>
          <AttendanceDialog
            session={s}
            trigger={
              <Button size="sm" variant="outline">
                <Users className="size-4" /> Lista
              </Button>
            }
          />
          <Button
            size="sm"
            variant={s.isActive ? 'destructive' : 'outline'}
            onClick={onToggle}
          >
            {s.isActive ? (
              <>
                <StopCircle className="size-4" /> Cerrar
              </>
            ) : (
              <>
                <Play className="size-4" /> Abrir
              </>
            )}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                <Trash2 className="size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar esta sesion?</AlertDialogTitle>
                <AlertDialogDescription>
                  Se borrara permanentemente la sesion{' '}
                  <strong className="text-zinc-900">{s.name}</strong> junto con{' '}
                  {s._count?.attendances ?? 0} registro(s) de asistencia
                  asociado(s). Esta accion no se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onDelete}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  <Trash2 className="size-4" /> Eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  )
}

function QRDialog({
  session,
  onClose,
}: {
  session: SessionInfo
  onClose: () => void
}) {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : ''
  const qrUrl = useMemo(() => `${origin}/?t=${session.token}`, [origin, session.token])

  const copyLink = () => {
    navigator.clipboard.writeText(qrUrl).then(
      () => toast.success('Enlace copiado'),
      () => toast.error('No se pudo copiar')
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="size-5 text-emerald-600" />
            {session.name}
          </DialogTitle>
          <DialogDescription>
            Muestra este QR a tus alumnos. Caduca el{' '}
            {new Date(session.endsAt).toLocaleString('es-MX')}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid place-items-center bg-white p-4 rounded-lg border">
          <QRCodeSVG
            value={qrUrl}
            size={260}
            level="M"
            includeMargin
            bgColor="#ffffff"
            fgColor="#0a0a0a"
          />
        </div>

        <div className="grid gap-2">
          <Label className="text-[11px] text-zinc-500">Enlace directo</Label>
          <div className="flex gap-2">
            <Input readOnly value={qrUrl} className="text-xs font-mono" />
            <Button size="sm" variant="outline" onClick={copyLink}>
              <Copy className="size-4" />
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose} className="bg-zinc-900 text-white">
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AttendanceDialog({
  session,
  trigger,
}: {
  session: SessionInfo
  trigger: React.ReactNode
}) {
  const { authedFetch } = useTeacherAuth()
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<AttendanceRow[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authedFetch(`/api/sessions/${session.token}/attendance`)
      const data = await res.json()
      setList(data.attendances || [])
    } catch {
      toast.error('No se pudo cargar la lista')
    } finally {
      setLoading(false)
    }
  }, [session.token, authedFetch])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const flagged = list.filter((a) => a.flagged).length
  const clean = list.length - flagged

  const deleteAttendance = async (id: string) => {
    try {
      const res = await authedFetch(`/api/attendance/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'No se pudo borrar')
      }
      await load()
      toast.success('Registro eliminado')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const exportCSV = () => {
    const rows = [
      ['matricula', 'fecha_hora', 'ip', 'device_fp', 'sospechoso', 'razon'],
      ...list.map((a) => [
        a.studentId,
        new Date(a.submittedAt).toISOString(),
        a.ip ?? '',
        a.deviceFp,
        a.flagged ? 'SI' : 'NO',
        a.flagReason ?? '',
      ]),
    ]
    const csv = rows
      .map((r) =>
        r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')
      )
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `asistencia_${session.name.replace(/\s+/g, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-5 text-emerald-600" />
            {session.name}
          </DialogTitle>
          <DialogDescription>
            Lista de asistencia registrada por QR.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 mb-2">
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
            <ShieldCheck className="size-3 mr-1" /> {clean} limpias
          </Badge>
          {flagged > 0 && (
            <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
              <ShieldAlert className="size-3 mr-1" /> {flagged} sospechosas
            </Badge>
          )}
          <Badge className="bg-zinc-100 text-zinc-700 hover:bg-zinc-100">
            Total: {list.length}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={exportCSV}
            disabled={list.length === 0}
            className="ml-auto"
          >
            <Download className="size-4" /> CSV
          </Button>
        </div>

        {loading ? (
          <div className="grid place-items-center py-8">
            <Loader2 className="size-5 animate-spin text-zinc-400" />
          </div>
        ) : list.length === 0 ? (
          <div className="text-center py-10 text-sm text-zinc-500">
            Nadie ha registrado asistencia en esta sesion todavia.
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto rounded-md border border-zinc-200">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 sticky top-0">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Matricula</th>
                  <th className="text-left font-medium px-3 py-2">Hora</th>
                  <th className="text-left font-medium px-3 py-2">IP</th>
                  <th className="text-left font-medium px-3 py-2">Estado</th>
                  <th className="text-right font-medium px-3 py-2">Accion</th>
                </tr>
              </thead>
              <tbody>
                {list.map((a) => (
                  <tr
                    key={a.id}
                    className={`border-t ${
                      a.flagged
                        ? 'bg-amber-50'
                        : 'bg-white'
                    } hover:bg-zinc-50`}
                  >
                    <td className="px-3 py-2 font-mono text-xs">
                      {a.studentId}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-600">
                      {new Date(a.submittedAt).toLocaleTimeString('es-MX', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-500 font-mono">
                      {a.ip ?? '-'}
                    </td>
                    <td className="px-3 py-2">
                      {a.flagged ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-700">
                          <AlertTriangle className="size-3" />
                          {a.flagReason}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
                          <CheckCircle2 className="size-3" /> OK
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7 w-7 p-0"
                            title="Eliminar este registro"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              ¿Eliminar este registro?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Se borrara la asistencia de la matricula{' '}
                              <strong className="text-zinc-900 font-mono">
                                {a.studentId}
                              </strong>{' '}
                              registrada a las{' '}
                              {new Date(a.submittedAt).toLocaleTimeString('es-MX')}.
                              No se puede deshacer.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteAttendance(a.id)}
                              className="bg-red-600 hover:bg-red-700 text-white"
                            >
                              <Trash2 className="size-4" /> Eliminar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* --------------------------- VISTA: ALUMNO --------------------------- */

function StudentAttendanceForm({ token }: { token: string }) {
  const [session, setSession] = useState<StudentSessionInfo | null>(null)
  const [loadingS, setLoadingS] = useState(true)
  const [studentId, setStudentId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<
    | { kind: 'ok'; message: string }
    | { kind: 'error'; message: string }
    | null
  >(null)

  // Cargar info de la sesion
  const loadSession = useCallback(async () => {
    setLoadingS(true)
    try {
      const res = await fetch(`/api/sessions/${token}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setResult({ kind: 'error', message: err.error || 'Sesion no encontrada' })
        setSession(null)
      } else {
        const data = await res.json()
        setSession(data.session)
        setResult(null)
      }
    } catch {
      setResult({ kind: 'error', message: 'No se pudo conectar con el servidor' })
      setSession(null)
    } finally {
      setLoadingS(false)
    }
  }, [token])

  useEffect(() => {
    loadSession()
    const id = setInterval(loadSession, 10_000) // refresca cada 10s
    return () => clearInterval(id)
  }, [loadSession])

  const submit = async () => {
    if (!studentId.trim()) {
      toast.error('Escribe tu matricula o numero de control')
      return
    }
    setSubmitting(true)
    setResult(null)
    try {
      // IMPORTANTE: ya NO enviamos deviceFp ni deviceUuid desde el cliente.
      // El servidor calcula la huella a partir de los headers HTTP (no forgeable
      // trivialmente) y setea una cookie HTTP-only firmada.
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // para que el navegador envie/reciba cookies
        body: JSON.stringify({
          token,
          studentId: studentId.trim().toUpperCase(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResult({
          kind: 'error',
          message: data.error || 'No se pudo registrar la asistencia',
        })
        return
      }
      setResult({
        kind: 'ok',
        message: data.attendance?.flagged
          ? `Asistencia registrada para ${data.attendance.studentId}. AVISO: tu registro quedo marcado como sospechoso: ${data.attendance.flagReason}. Contacta a tu maestro.`
          : `Asistencia registrada para ${data.attendance.studentId}. Gracias!`,
      })
      setStudentId('')
    } catch {
      setResult({ kind: 'error', message: 'Error de red al registrar' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingS) {
    return (
      <div className="grid place-items-center min-h-[60vh]">
        <Loader2 className="size-6 animate-spin text-zinc-400" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <Card>
          <CardContent className="py-10 text-center">
            <AlertTriangle className="size-10 text-amber-500 mx-auto mb-3" />
            <div className="text-sm font-medium text-zinc-800 mb-1">
              Sesion invalida
            </div>
            <div className="text-xs text-zinc-500">
              {result?.message || 'El QR no es valido o ya caduco.'}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const now = new Date()
  const endsAt = new Date(session.endsAt)
  const remainingMs = Math.max(0, endsAt.getTime() - now.getTime())
  const remainingMin = Math.floor(remainingMs / 60_000)
  const remainingSec = Math.floor((remainingMs % 60_000) / 1000)

  return (
    <div className="mx-auto max-w-md px-4 py-8 w-full">
      <Card className="border-emerald-200">
        <CardHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="size-8 rounded-lg bg-emerald-600 text-white grid place-items-center">
              <QrCode className="size-4" />
            </div>
            <CardTitle className="text-base">Registro de asistencia</CardTitle>
          </div>
          <CardDescription className="text-base font-medium text-zinc-800">
            {session.name}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center gap-2 text-xs">
            {session.isWindowOpen ? (
              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                <Clock className="size-3 mr-1" /> Sesion abierta
              </Badge>
            ) : (
              <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                <Clock className="size-3 mr-1" /> Cerrada
              </Badge>
            )}
            <span className="text-zinc-500">
              Tiempo restante: {String(remainingMin).padStart(2, '0')}:
              {String(remainingSec).padStart(2, '0')}
            </span>
          </div>

          {session.isWindowOpen ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="mat">Matricula o numero de control</Label>
                <Input
                  id="mat"
                  placeholder="Ej. 20180564"
                  value={studentId}
                  autoCapitalize="characters"
                  onChange={(e) => setStudentId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submit()
                  }}
                  autoFocus
                />
              </div>
              <Button
                onClick={submit}
                disabled={submitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white w-full"
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                Registrar asistencia
              </Button>
              <p className="text-[10px] text-zinc-400 text-center">
                Tu dispositivo se identifica para prevenir suplantaciones.
                Si tu maestro lo verifica, sabra que fuiste tu.
              </p>
            </>
          ) : (
            <div className="text-center py-4 text-sm text-zinc-600">
              {now < new Date(session.startsAt)
                ? 'La sesion aun no abre. Espera a que tu maestro inicie.'
                : 'La sesion ya cerro. Pide a tu maestro que reabra o genere un QR nuevo.'}
            </div>
          )}

          {result && (
            <div
              className={`rounded-md p-3 text-sm ${
                result.kind === 'ok'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              <div className="flex gap-2">
                {result.kind === 'ok' ? (
                  <CheckCircle2 className="size-4 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                )}
                <div>{result.message}</div>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-[10px] text-zinc-400">
            Cierra esta pestana cuando termines. No necesitas instalar nada.
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
