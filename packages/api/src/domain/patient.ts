import type { BranchCode } from '@aethelgard/shared';
import { ValidationError } from './errors.js';

const MRN_DIGITS = 6;
const MRN_MAX_SEQUENCE = 10 ** MRN_DIGITS - 1;
const EARLIEST_PLAUSIBLE_DOB = '1900-01-01';

export const formatMrn = (branchCode: BranchCode, sequence: number): string => {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MRN_MAX_SEQUENCE) {
    throw new ValidationError(
      `MRN sequence must be an integer between 1 and ${MRN_MAX_SEQUENCE}`,
      { field: 'sequence', received: sequence },
    );
  }
  return `${branchCode}-${String(sequence).padStart(MRN_DIGITS, '0')}`;
};

const randomSequence = (): number => 1 + Math.floor(Math.random() * MRN_MAX_SEQUENCE);

/** Candidate only — the unique constraint on `patients.mrn` is the authority; the service retries on ConflictError. */
export const generateMrnCandidate = (
  branchCode: BranchCode,
  sequenceSource: () => number = randomSequence,
): string => formatMrn(branchCode, sequenceSource());

export const assertValidDateOfBirth = (dob: string, today: Date): void => {
  const parsed = Date.parse(`${dob}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(parsed)) {
    throw new ValidationError('Date of birth must be an ISO calendar date (YYYY-MM-DD)', {
      field: 'dob',
      received: dob,
    });
  }
  const todayUtcMidnight = Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00.000Z`);
  if (parsed > todayUtcMidnight) {
    throw new ValidationError('Date of birth cannot be in the future', { field: 'dob', received: dob });
  }
  if (parsed < Date.parse(`${EARLIEST_PLAUSIBLE_DOB}T00:00:00.000Z`)) {
    throw new ValidationError(`Date of birth cannot be earlier than ${EARLIEST_PLAUSIBLE_DOB}`, {
      field: 'dob',
      received: dob,
    });
  }
};
