import * as XLSX from 'xlsx';

function parseCsvText(text: string): string[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];

  const first = lines[0];
  const cols = first.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  const deptIdx = cols.findIndex((c) => /department|dept|division|unit/i.test(c));

  if (deptIdx >= 0) {
    const out: string[] = [];
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      if (row[deptIdx]) out.push(row[deptIdx].replace(/\u00a0/g, ' ').trim());
    }
    return out;
  }

  const out: string[] = [];
  for (const line of lines) {
    const firstCol = line.split(',')[0]?.trim().replace(/^"|"$/g, '') || '';
    if (firstCol && !/^department$/i.test(firstCol)) {
      out.push(firstCol.replace(/\u00a0/g, ' ').trim());
    }
  }
  return out;
}

/**
 * Reads department names from CSV, TXT (one per line), or XLSX (first column or column named Department).
 * Returns **raw** rows in file order (duplicates preserved) so the uploader can report add vs skip counts.
 */
export async function parseDepartmentFile(file: File): Promise<{ raw: string[] }> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    const text = await file.text();
    if (name.endsWith('.txt') && !text.includes(',')) {
      const raw = text
        .split(/\r?\n/)
        .map((l) => l.replace(/\u00a0/g, ' ').trim())
        .filter(Boolean);
      return { raw };
    }
    return { raw: parseCsvText(text) };
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buf = await file.arrayBuffer();
    const workbook = XLSX.read(buf, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: '' });
    if (!data.length) return { raw: [] };

    const headerRow = data[0].map((c) => String(c).trim());
    let colIdx = headerRow.findIndex((c) => /department|dept|division|unit/i.test(c));
    if (colIdx < 0) colIdx = 0;

    const startRow =
      colIdx >= 0 && /department|dept|division|unit/i.test(String(headerRow[colIdx])) ? 1 : 0;
    const out: string[] = [];
    for (let i = startRow; i < data.length; i++) {
      const row = data[i];
      const cell = row[colIdx];
      if (cell !== undefined && cell !== '') out.push(String(cell).replace(/\u00a0/g, ' ').trim());
    }
    return { raw: out };
  }

  throw new Error('Unsupported file type. Use .csv, .txt, or .xlsx');
}
