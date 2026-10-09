function escapePdfText(text: string): string {
  return text.replace(/[\\()]/g, (c) => `\\${c}`);
}

type Rgb = readonly [number, number, number];
type Rect = readonly [number, number, number, number];

export type FixtureMark =
  | { kind: 'sketch'; rect: Rect; colour: Rgb; path: string; evenOdd?: boolean; paint?: string }
  | { kind: 'highlight' | 'strikeout'; rect: Rect; colour: Rgb }
  | { kind: 'line'; from: readonly [number, number]; to: readonly [number, number]; colour: Rgb }
  | { kind: 'freetext'; rect: Rect; text: string; size: number }
  | { kind: 'note'; rect: Rect }
  | { kind: 'link'; rect: Rect };

const num = (n: number) => String(Math.round(n * 1000) / 1000);
const list = (ns: readonly number[]) => `[${ns.map(num).join(' ')}]`;
const rgb = (c: Rgb) => c.map((v) => num(v / 255)).join(' ');

function markObjects(mark: FixtureMark, add: (body: string) => number): number {
  const stream = (dict: string, content: string) =>
    add(`<< ${dict} /Length ${String(content.length)} >>\nstream\n${content}\nendstream`);
  switch (mark.kind) {
    case 'sketch': {
      const [x1, y1, x2, y2] = mark.rect;
      const ap = stream(
        `/Type /XObject /Subtype /Form /BBox ${list([0, 0, x2 - x1, y2 - y1])}`,
        mark.paint ?? `${rgb(mark.colour)} rg\n${mark.path}\n${mark.evenOdd ? 'f*' : 'f'}`,
      );
      return add(
        `<< /Type /Annot /Subtype /Stamp /Rect ${list(mark.rect)} /C [${rgb(mark.colour)}] /F 4 /AP << /N ${String(ap)} 0 R >> >>`,
      );
    }
    case 'highlight':
    case 'strikeout': {
      const [x1, y1, x2, y2] = mark.rect;
      const subtype = mark.kind === 'highlight' ? 'Highlight' : 'StrikeOut';
      return add(
        `<< /Type /Annot /Subtype /${subtype} /Rect ${list(mark.rect)} /QuadPoints ${list([x1, y2, x2, y2, x1, y1, x2, y1])} /C [${rgb(mark.colour)}] /F 4 >>`,
      );
    }
    case 'line': {
      const [x1, y1] = mark.from;
      const [x2, y2] = mark.to;
      const rect = [
        Math.min(x1, x2) - 2,
        Math.min(y1, y2) - 2,
        Math.max(x1, x2) + 2,
        Math.max(y1, y2) + 2,
      ];
      return add(
        `<< /Type /Annot /Subtype /Line /Rect ${list(rect)} /L ${list([x1, y1, x2, y2])} /C [${rgb(mark.colour)}] /BS << /W 2 >> /F 4 >>`,
      );
    }
    case 'freetext':
      return add(
        `<< /Type /Annot /Subtype /FreeText /Rect ${list(mark.rect)} /Contents (${escapePdfText(mark.text)}) /DA (/Helv ${num(mark.size)} Tf 0 0 1 rg) /F 4 >>`,
      );
    case 'note':
      return add(
        `<< /Type /Annot /Subtype /Text /Rect ${list(mark.rect)} /Contents (a sticky note) /F 4 >>`,
      );
    case 'link':
      return add(
        `<< /Type /Annot /Subtype /Link /Rect ${list(mark.rect)} /Border [0 0 0] /A << /S /URI /URI (https://example.com) >> >>`,
      );
  }
}

export function makePdf(
  pageTexts: readonly string[],
  size: [number, number] = [595, 842],
  marks: readonly (readonly FixtureMark[])[] = [],
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
    const annots = (marks[pageIds.length] ?? []).map((m) => `${String(markObjects(m, add))} 0 R`);
    const annotsEntry = annots.length > 0 ? ` /Annots [${annots.join(' ')}]` : '';
    pageIds.push(
      add(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${String(width)} ${String(height)}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${String(contentId)} 0 R${annotsEntry} >>`,
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
