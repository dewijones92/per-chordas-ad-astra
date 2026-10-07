function escapePdfText(text: string): string {
  return text.replace(/[\\()]/g, (c) => `\\${c}`);
}

export function makePdf(
  pageTexts: readonly string[],
  size: [number, number] = [595, 842],
): Uint8Array {
  const [width, height] = size;
  const objects: string[] = [];
  const add = (body: string): number => objects.push(body);

  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('PAGES');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds: number[] = [];
  for (const text of pageTexts) {
    const lines = text.split('\n');
    const content = lines
      .map(
        (line, i) =>
          `BT /F1 ${String(i === 0 ? 28 : 16)} Tf 72 ${String(height - 96 - i * 32)} Td (${escapePdfText(line)}) Tj ET`,
      )
      .join('\n');
    const contentId = add(`<< /Length ${String(content.length)} >>\nstream\n${content}\nendstream`);
    pageIds.push(
      add(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${String(width)} ${String(height)}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${String(contentId)} 0 R >>`,
      ),
    );
  }
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${String(id)} 0 R`).join(' ')}] /Count ${String(pageIds.length)} >>`;

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${String(i + 1)} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = out.length;
  out += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xrefAt)}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
