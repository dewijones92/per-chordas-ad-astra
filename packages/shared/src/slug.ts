import { FileName, Slug } from './schemas.ts';

export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

export function uniqueSlug(title: string, taken: ReadonlySet<string>): Slug {
  const base = slugify(title) || 'piece';
  let candidate = base;
  for (let n = 2; taken.has(candidate); n++) candidate = `${base}-${String(n)}`;
  return Slug.parse(candidate);
}

export function safeFileName(original: string, taken: ReadonlySet<string>): FileName {
  const dot = original.lastIndexOf('.');
  const ext = (dot >= 0 ? original.slice(dot + 1) : '').toLowerCase();
  const stem = slugify(dot >= 0 ? original.slice(0, dot) : original) || 'file';
  let candidate = `${stem}.${ext}`;
  for (let n = 2; taken.has(candidate); n++) candidate = `${stem}-${String(n)}.${ext}`;
  return FileName.parse(candidate);
}
