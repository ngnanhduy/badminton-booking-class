/**
 * A tiny .xlsx writer: one worksheet with a bold, frozen, filterable header row. No dependency;
 * the parts go into an uncompressed ("stored") ZIP, which Excel, LibreOffice and Google Sheets
 * all open. Strings are written inline, so a cell starting with "=" stays text (no formulas).
 */

export type CellValue = string | number | null | undefined

export interface SheetColumn {
  header: string
  /** Width in characters. */
  width?: number
  /** "percent": numbers are fractions shown as "83%". */
  format?: 'percent'
}

export interface Sheet {
  /** Tab name; characters Excel rejects are replaced and it is cut to 31 characters. */
  name: string
  columns: SheetColumn[]
  rows: CellValue[][]
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

/** Style indexes in styles.xml (cellXfs). */
const STYLE = { header: 1, percent: 2 } as const

// Control characters (other than tab and line breaks) and U+FFFE/U+FFFF are not allowed in XML.
// oxlint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g

const escapeXml = (text: string) =>
  text
    .replace(INVALID_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** 0 → "A", 25 → "Z", 26 → "AA". */
export function columnName(index: number): string {
  let name = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  }
  return name
}

/** Excel refuses tab names with : \ / ? * [ ], starting/ending with ' or longer than 31. */
export function sheetName(name: string): string {
  const clean = [...name.replace(/[:\\/?*[\]]/g, '-')]
    .slice(0, 31)
    .join('')
    .replace(/^'+|'+$/g, '')
    .trim()
  return clean || 'Sheet1'
}

function cell(ref: string, value: CellValue, style?: number): string {
  const s = style ? ` s="${style}"` : ''
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `<c r="${ref}"${s}><v>${value}</v></c>` : ''
  }
  if (value === null || value === undefined || value === '') return ''
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
}

function worksheetXml(sheet: Sheet): string {
  const { columns, rows } = sheet
  const last = columnName(Math.max(columns.length - 1, 0))
  const lastRow = rows.length + 1

  const cols = columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 14}" customWidth="1"/>`)
    .join('')
  const header = `<row r="1">${columns
    .map((c, i) => cell(`${columnName(i)}1`, c.header, STYLE.header))
    .join('')}</row>`
  const body = rows
    .map((row, r) => {
      const cells = columns
        .map((c, i) =>
          cell(
            `${columnName(i)}${r + 2}`,
            row[i],
            c.format === 'percent' ? STYLE.percent : undefined,
          ),
        )
        .join('')
      return `<row r="${r + 2}">${cells}</row>`
    })
    .join('')

  return (
    XML_HEAD +
    `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    `<dimension ref="A1:${last}${lastRow}"/>` +
    '<sheetViews><sheetView workbookViewId="0">' +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
    '</sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${header}${body}</sheetData>` +
    (columns.length ? `<autoFilter ref="A1:${last}${lastRow}"/>` : '') +
    '</worksheet>'
  )
}

function workbookXml(name: string, filterRange: string | null): string {
  const quoted = `'${name.replace(/'/g, "''")}'`
  const filter = filterRange
    ? '<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">' +
      `${escapeXml(quoted)}!${filterRange}</definedName></definedNames>`
    : ''
  return (
    XML_HEAD +
    `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    `<sheets><sheet name="${escapeXml(name)}" sheetId="1" r:id="rId1"/></sheets>` +
    filter +
    '</workbook>'
  )
}

const STYLES_XML =
  XML_HEAD +
  `<styleSheet xmlns="${NS_MAIN}">` +
  '<fonts count="2">' +
  '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '</fonts>' +
  '<fills count="3">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFE4E4E7"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="3">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
  // 9 is Excel's built-in "0%" format.
  '<xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>'

const CONTENT_TYPES_XML =
  XML_HEAD +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '</Types>'

const ROOT_RELS_XML =
  XML_HEAD +
  `<Relationships xmlns="${NS_PKG_REL}">` +
  `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>` +
  '</Relationships>'

const WORKBOOK_RELS_XML =
  XML_HEAD +
  `<Relationships xmlns="${NS_PKG_REL}">` +
  `<Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="${NS_REL}/styles" Target="styles.xml"/>` +
  '</Relationships>'

// ── ZIP (stored, no compression) ─────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** MS-DOS date and time, as ZIP stores them. */
function dosDateTime(date: Date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, day }
}

export function zipStored(files: { name: string; data: Uint8Array }[], date = new Date()) {
  const encoder = new TextEncoder()
  const { time, day } = dosDateTime(date)
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const file of files) {
    const name = encoder.encode(file.name)
    const crc = crc32(file.data)
    const size = file.data.length

    const local = new Uint8Array(30 + name.length + size)
    const l = new DataView(local.buffer)
    l.setUint32(0, 0x04034b50, true) // local file header
    l.setUint16(4, 20, true) // version needed
    l.setUint16(6, 0x0800, true) // UTF-8 names
    l.setUint16(8, 0, true) // stored
    l.setUint16(10, time, true)
    l.setUint16(12, day, true)
    l.setUint32(14, crc, true)
    l.setUint32(18, size, true)
    l.setUint32(22, size, true)
    l.setUint16(26, name.length, true)
    l.setUint16(28, 0, true)
    local.set(name, 30)
    local.set(file.data, 30 + name.length)

    const central = new Uint8Array(46 + name.length)
    const c = new DataView(central.buffer)
    c.setUint32(0, 0x02014b50, true) // central directory header
    c.setUint16(4, 20, true) // version made by
    c.setUint16(6, 20, true) // version needed
    c.setUint16(8, 0x0800, true)
    c.setUint16(10, 0, true)
    c.setUint16(12, time, true)
    c.setUint16(14, day, true)
    c.setUint32(16, crc, true)
    c.setUint32(20, size, true)
    c.setUint32(24, size, true)
    c.setUint16(28, name.length, true)
    // extra, comment, disk, internal and external attributes: 0
    c.setUint32(42, offset, true)
    central.set(name, 46)

    locals.push(local)
    centrals.push(central)
    offset += local.length
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const e = new DataView(end.buffer)
  e.setUint32(0, 0x06054b50, true) // end of central directory
  e.setUint16(8, files.length, true)
  e.setUint16(10, files.length, true)
  e.setUint32(12, centralSize, true)
  e.setUint32(16, offset, true)

  const out = new Uint8Array(offset + centralSize + end.length)
  let at = 0
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at)
    at += part.length
  }
  return out
}

// ── Public API ───────────────────────────────────────────────────────────────────────────

/** The .xlsx file's bytes. */
export function buildXlsx(sheet: Sheet, date = new Date()): Uint8Array<ArrayBuffer> {
  const name = sheetName(sheet.name)
  const lastCol = columnName(Math.max(sheet.columns.length - 1, 0))
  const filterRange = sheet.columns.length ? `$A$1:$${lastCol}$${sheet.rows.length + 1}` : null
  const encoder = new TextEncoder()
  const parts: [string, string][] = [
    ['[Content_Types].xml', CONTENT_TYPES_XML],
    ['_rels/.rels', ROOT_RELS_XML],
    ['xl/workbook.xml', workbookXml(name, filterRange)],
    ['xl/_rels/workbook.xml.rels', WORKBOOK_RELS_XML],
    ['xl/styles.xml', STYLES_XML],
    ['xl/worksheets/sheet1.xml', worksheetXml(sheet)],
  ]
  return zipStored(
    parts.map(([path, xml]) => ({ name: path, data: encoder.encode(xml) })),
    date,
  )
}

/** Builds the workbook and has the browser save it as `fileName`. */
export function downloadXlsx(sheet: Sheet, fileName: string) {
  const blob = new Blob([buildXlsx(sheet)], { type: XLSX_MIME })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  // Some browsers read the blob after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
