export type CsvCell = string | number | null | undefined;

// Spreadsheet apps execute cells starting with these as formulas, and notes
// are free text typed by callers.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function cell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && FORMULA_PREFIX.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: CsvCell[][]): string {
  return rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function downloadCsv(filename: string, rows: CsvCell[][]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
