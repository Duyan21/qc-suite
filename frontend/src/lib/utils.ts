import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(iso: string): string {
  const hasTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso)
  const d = new Date(hasTimezone ? iso : `${iso}Z`)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export function getInitials(name: string | null, email: string): string {
  const source = (name ?? '').trim()
  if (!source) return email[0]?.toUpperCase() ?? '?'
  const parts = source.split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}
