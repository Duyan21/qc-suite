import { describe, expect, it } from 'vitest'
import { cn, formatDate, getInitials } from './utils'

describe('cn', () => {
  it('merges class names and resolves tailwind conflicts', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4')
  })

  it('drops falsy values', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b')
  })
})

describe('formatDate', () => {
  it('formats a UTC ISO string as dd/mm/yyyy', () => {
    expect(formatDate('2026-03-05T00:00:00Z')).toBe('05/03/2026')
  })

  it('treats a timezone-less string as UTC', () => {
    expect(formatDate('2026-03-05T00:00:00')).toBe('05/03/2026')
  })

  it('returns an em dash for an invalid date', () => {
    expect(formatDate('not-a-date')).toBe('—')
  })
})

describe('getInitials', () => {
  it('takes the first and last name initials', () => {
    expect(getInitials('Nguyen Van An', 'an@example.com')).toBe('NA')
  })

  it('uses a single initial for a one-word name', () => {
    expect(getInitials('Cher', 'cher@example.com')).toBe('C')
  })

  it('falls back to the email initial when name is null', () => {
    expect(getInitials(null, 'an@example.com')).toBe('A')
  })

  it('falls back to the email initial when name is blank', () => {
    expect(getInitials('   ', 'an@example.com')).toBe('A')
  })

  it('falls back to "?" when both name and email are empty', () => {
    expect(getInitials(null, '')).toBe('?')
  })
})
