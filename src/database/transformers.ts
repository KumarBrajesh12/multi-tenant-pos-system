import { ValueTransformer } from 'typeorm';

// pg returns bigint as string. Our amounts are in cents and stay far below
// Number.MAX_SAFE_INTEGER, so converting to number is fine.
export const bigintToNumber: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value === null || value === undefined ? value : Number(value)),
};
