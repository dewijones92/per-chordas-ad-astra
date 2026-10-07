export function newId(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 16);
}
