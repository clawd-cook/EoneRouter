const EONE_ID_PATTERN = /^eone-[A-Za-z0-9_-]+$/;

export function isValidEoneId(id: string): boolean {
  return EONE_ID_PATTERN.test(id);
}
