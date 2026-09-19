'use client'

import { useState, useCallback } from 'react'

/**
 * Hook para manejar la sesion del maestro en el cliente.
 *
 * - Guarda la password en sessionStorage (se borra al cerrar la pestana).
 * - Expone un helper para enviarla como header X-Teacher-Password.
 * - Si la password esta mal, el primer request 401 y limpiamos.
 */

const STORAGE_KEY = 'teacher_pw'

export function useTeacherAuth() {
  // Inicializadores perezosos para evitar setState en effects (lint rule).
  // En SSR no hay window, devolvemos null/false y el primer render del
  // cliente ya trae el valor correcto (evita hydration mismatch).
  const [password, setPassword] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      return sessionStorage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
  })
  const [ready] = useState<boolean>(() => typeof window !== 'undefined')

  const login = useCallback((pw: string) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, pw)
    } catch {
      // ignore
    }
    setPassword(pw)
  }, [])

  const logout = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
    setPassword(null)
  }, [])

  /**
   * Helper para hacer fetch con la cabecera de auth agregada.
   * Uso: const res = await authedFetch('/api/sessions', { method: 'POST', ... })
   */
  const authedFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      if (!password) {
        throw new Error('No hay password de maestro')
      }
      const headers = new Headers(init.headers)
      headers.set('X-Teacher-Password', password)
      if (init.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json')
      }
      const res = await fetch(url, { ...init, headers })
      if (res.status === 401) {
        // Password mal -> logout
        logout()
      }
      return res
    },
    [password, logout]
  )

  return { password, ready, login, logout, authedFetch }
}
