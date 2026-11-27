import { QueryFailedError } from 'typeorm';

export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  if (!(err instanceof QueryFailedError)) return false;
  const driverError = (err as QueryFailedError & { driverError?: { code?: string; constraint?: string } })
    .driverError;
  return driverError?.code === '23505' && (!constraint || driverError.constraint === constraint);
}

// escape % and _ so user input is matched literally in ILIKE
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
