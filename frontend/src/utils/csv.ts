/**
 * One quoted CSV cell. Text that Excel, LibreOffice or Google Sheets would run as a formula
 * (starting with = + - @, a tab or a carriage return) gets a leading apostrophe, so a Zalo name
 * or note like `=HYPERLINK(…)` typed into the public booking form stays plain text in the
 * admin's spreadsheet (CSV / formula injection).
 */
export function csvCell(value: string): string {
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return `"${text.replace(/"/g, '""')}"`
}

/** Rows as CSV text: CRLF line ends, every cell quoted and formula-safe. */
export const toCsv = (rows: readonly (readonly string[])[]) =>
  rows.map((cols) => cols.map(csvCell).join(',')).join('\r\n')
