export function shouldAdvanceFromPeriod(from: string, to: string) {
  return Boolean(from && from === to);
}
