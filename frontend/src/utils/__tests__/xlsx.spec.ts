import { describe, expect, it } from 'vitest'

import { buildXlsx, columnName, crc32, sheetName } from '../xlsx'

/** Reads a stored (uncompressed) ZIP back into { path: text }, checking every CRC. */
function unzip(bytes: Uint8Array): Record<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decoder = new TextDecoder()
  const files: Record<string, string> = {}
  let at = 0
  while (view.getUint32(at, true) === 0x04034b50) {
    expect(view.getUint16(at + 8, true)).toBe(0) // stored
    const crc = view.getUint32(at + 14, true)
    const size = view.getUint32(at + 18, true)
    const nameLength = view.getUint16(at + 26, true)
    const name = decoder.decode(bytes.subarray(at + 30, at + 30 + nameLength))
    const data = bytes.subarray(at + 30 + nameLength, at + 30 + nameLength + size)
    expect(crc32(data)).toBe(crc)
    files[name] = decoder.decode(data)
    at += 30 + nameLength + size
  }
  // Central directory and its end record follow, pointing back at the entries.
  const end = bytes.length - 22
  expect(view.getUint32(end, true)).toBe(0x06054b50)
  expect(view.getUint16(end + 10, true)).toBe(Object.keys(files).length)
  expect(view.getUint32(end + 16, true)).toBe(at)
  return files
}

describe('xlsx', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
    expect(crc32(new Uint8Array())).toBe(0)
  })

  it('names columns like Excel', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual([
      'A',
      'B',
      'Z',
      'AA',
      'AB',
      'AZ',
      'BA',
      'ZZ',
      'AAA',
    ])
  })

  it('makes tab names Excel accepts', () => {
    expect(sheetName('Tuần 16/11 - 22/11')).toBe('Tuần 16-11 - 22-11')
    expect(sheetName("'[a]:b*?'")).toBe('-a--b--')
    expect(sheetName('x'.repeat(40))).toHaveLength(31)
    expect(sheetName(' ')).toBe('Sheet1')
  })

  it('writes a workbook with a styled header, inline text and numbers', () => {
    const files = unzip(
      buildXlsx({
        name: 'Tuần 16/11 - 22/11',
        columns: [
          { header: 'Tên Zalo', width: 28 },
          { header: 'Số buổi' },
          { header: 'Chuyên cần', format: 'percent' },
        ],
        rows: [
          ['Duy <Nguyễn> & "co"', 2, 0.75],
          ['=SUM(A1)', 0, null],
        ],
      }),
    )

    expect(Object.keys(files)).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
    ])
    expect(files['xl/workbook.xml']).toContain('<sheet name="Tuần 16-11 - 22-11" sheetId="1"')
    expect(files['xl/workbook.xml']).toContain("'Tuần 16-11 - 22-11'!$A$1:$C$3")

    const sheet = files['xl/worksheets/sheet1.xml']!
    expect(sheet).toContain('<dimension ref="A1:C3"/>')
    expect(sheet).toContain('state="frozen"')
    expect(sheet).toContain('<autoFilter ref="A1:C3"/>')
    expect(sheet).toContain('<col min="1" max="1" width="28" customWidth="1"/>')
    expect(sheet).toContain(
      '<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Tên Zalo</t></is></c>',
    )
    expect(sheet).toContain('<t xml:space="preserve">Duy &lt;Nguyễn&gt; &amp; &quot;co&quot;</t>')
    expect(sheet).toContain('<c r="B2"><v>2</v></c>')
    expect(sheet).toContain('<c r="C2" s="2"><v>0.75</v></c>')
    // Text stays text, even when it looks like a formula; empty cells are left out.
    expect(sheet).toContain('<c r="A3" t="inlineStr"><is><t xml:space="preserve">=SUM(A1)</t>')
    expect(sheet).not.toContain('<f>')
    expect(sheet).not.toContain('r="C3"')
  })

  it('drops characters XML cannot hold', () => {
    const files = unzip(
      buildXlsx({ name: 'S', columns: [{ header: 'A' }], rows: [['a\u0001b\u000bc\td']] }),
    )
    expect(files['xl/worksheets/sheet1.xml']).toContain('>abc\td</t>')
  })
})
