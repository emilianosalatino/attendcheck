/**
 * Generador de huella de dispositivo (device fingerprint)
 *
 * Por que NO usamos MAC address:
 * - Los navegadores modernos NO exponen la MAC address por seguridad/privacidad.
 * - Es una restriccion estandar de la Web: ninguna pagina puede leer la MAC.
 *
 * Alternativa: fingerprint del navegador combinando varias senales:
 *   - Canvas fingerprint (diferencias en el renderizado de canvas entre dispositivos)
 *   - WebGL fingerprint (info de la tarjeta grafica)
 *   - User-Agent, idioma, zona horaria
 *   - Resolucion de pantalla, profundidad de color
 *   - Numero de CPUs, memoria (si estan disponibles)
 *
 * Se hace un hash SHA-256 de todo esto para obtener un ID estable por dispositivo.
 * No es perfecto (modo incognito da otra huella, borrar datos reinicia localStorage)
 * pero detecta la mayoria de intentos de trampa simples.
 */

function hashString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i)
    hash = (hash << 5) - hash + chr
    hash |= 0 // Convertir a 32-bit
  }
  // Segunda pasada para mejor distribucion
  let h2 = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h2 ^= str.charCodeAt(i)
    h2 = Math.imul(h2, 0x01000193)
  }
  return (
    (hash >>> 0).toString(16).padStart(8, '0') +
    (h2 >>> 0).toString(16).padStart(8, '0')
  )
}

function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 240
    canvas.height = 60
    const ctx = canvas.getContext('2d')
    if (!ctx) return 'no-canvas'
    ctx.textBaseline = 'top'
    ctx.font = "14px 'Arial'"
    ctx.fillStyle = '#f60'
    ctx.fillRect(0, 0, 100, 30)
    ctx.fillStyle = '#069'
    ctx.fillText('Asistencia, fingerprint! áéíóú', 4, 4)
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)'
    ctx.fillText('Asistencia, fingerprint! áéíóú', 6, 6)
    return canvas.toDataURL()
  } catch {
    return 'canvas-blocked'
  }
}

function getWebGLFingerprint(): string {
  try {
    const canvas = document.createElement('canvas')
    const gl =
      (canvas.getContext('webgl') as WebGLRenderingContext | null) ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null)
    if (!gl) return 'no-webgl'
    const extInfo = gl.getExtension('WEBGL_debug_renderer_info')
    if (!extInfo) return 'no-webgl-ext'
    const vendor = gl.getParameter(extInfo.UNMASKED_VENDOR_WEBGL) || ''
    const renderer = gl.getParameter(extInfo.UNMASKED_RENDERER_WEBGL) || ''
    return `${vendor}::${renderer}`
  } catch {
    return 'webgl-blocked'
  }
}

export function generateDeviceFingerprint(): string {
  const parts: string[] = []

  // Canvas fingerprint
  parts.push('canvas:' + getCanvasFingerprint())

  // WebGL fingerprint
  parts.push('webgl:' + getWebGLFingerprint())

  // Navigator props
  const nav = navigator
  parts.push('ua:' + nav.userAgent)
  parts.push('lang:' + nav.language)
  parts.push('langs:' + (nav.languages || []).join(','))
  parts.push('platform:' + (nav.platform || ''))
  parts.push('hwconcur:' + String(nav.hardwareConcurrency || ''))
  parts.push('mem:' + String((nav as Navigator & { deviceMemory?: number }).deviceMemory || ''))
  parts.push('touch:' + String(nav.maxTouchPoints || 0))
  parts.push('doNotTrack:' + String(nav.doNotTrack || ''))

  // Screen props
  parts.push('res:' + screen.width + 'x' + screen.height)
  parts.push('depth:' + screen.colorDepth)
  parts.push('pixratio:' + (window.devicePixelRatio || 1))

  // Timezone
  parts.push('tz:' + Intl.DateTimeFormat().resolvedOptions().timeZone)
  parts.push('offset:' + new Date().getTimezoneOffset())

  return hashString(parts.join('|'))
}

/**
 * Persistimos un UUID en localStorage para reforzar la huella entre sesiones.
 * Si el alumno borra las cookies/storage, se genera uno nuevo.
 * Esto es una capa adicional, no la unica senal.
 */
export function getOrCreateDeviceUUID(): string {
  try {
    const KEY = 'asistencia_dev_uuid'
    let uuid = localStorage.getItem(KEY)
    if (!uuid) {
      uuid =
        'dev-' +
        Date.now().toString(36) +
        '-' +
        Math.random().toString(36).slice(2, 12)
      localStorage.setItem(KEY, uuid)
    }
    return uuid
  } catch {
    return 'no-storage'
  }
}
