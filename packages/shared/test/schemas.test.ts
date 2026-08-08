import { describe, expect, it } from 'vitest';
import {
  createEncounterSchema,
  createObservationSchema,
  createPatientSchema,
  demoUserSchema,
  encounterSchema,
  loginSchema,
  mrnSchema,
  observationSchema,
  paginationQuerySchema,
  patientSchema,
  principalSchema,
  updatePatientSchema,
} from '../src/index.js';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const NOW = '2026-08-07T09:00:00.000Z';

describe('paginationQuerySchema', () => {
  it('defaults to the first page of twenty', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('coerces numeric strings so it can parse a query string directly', () => {
    expect(paginationQuerySchema.parse({ page: '3', pageSize: '50' })).toEqual({
      page: 3,
      pageSize: 50,
    });
  });

  it('caps pageSize so a client cannot request an unbounded scan', () => {
    expect(paginationQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });
});

describe('mrnSchema', () => {
  it('accepts a branch-prefixed medical record number', () => {
    expect(mrnSchema.parse('KL-000123')).toBe('KL-000123');
  });

  it.each(['kl-000123', 'KL-12345', 'KL000123', 'ZZ-000123'])(
    'rejects the malformed MRN %s',
    (candidate) => {
      expect(mrnSchema.safeParse(candidate).success).toBe(false);
    },
  );
});

describe('patientSchema', () => {
  const valid = {
    id: UUID_A,
    mrn: 'KL-000123',
    name: 'Nurul Aisyah binti Rahman',
    dob: '1985-03-14',
    sex: 'female',
    phone: '+60123456789',
    branchId: UUID_B,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  };

  it('accepts a complete patient record', () => {
    expect(patientSchema.parse(valid)).toEqual(valid);
  });

  it('rejects an empty name', () => {
    expect(patientSchema.safeParse({ ...valid, name: '' }).success).toBe(false);
  });
});

describe('createPatientSchema', () => {
  it('does not accept an MRN — the server assigns it', () => {
    const parsed = createPatientSchema.parse({
      mrn: 'KL-000123',
      name: 'Tan Wei Ming',
      dob: '1990-01-01',
      sex: 'male',
      phone: '+60129876543',
    });
    expect(parsed).not.toHaveProperty('mrn');
  });

  it('allows a caller to name the target branch', () => {
    const parsed = createPatientSchema.parse({
      name: 'Tan Wei Ming',
      dob: '1990-01-01',
      sex: 'male',
      phone: '+60129876543',
      branchId: UUID_B,
    });
    expect(parsed.branchId).toBe(UUID_B);
  });
});

describe('updatePatientSchema', () => {
  it('accepts a single-field patch', () => {
    expect(updatePatientSchema.parse({ phone: '+60111111111' })).toEqual({
      phone: '+60111111111',
    });
  });

  it('rejects an empty patch so a no-op write never reaches the database', () => {
    expect(updatePatientSchema.safeParse({}).success).toBe(false);
  });
});

describe('encounterSchema and createEncounterSchema', () => {
  it('accepts an open encounter with no discharge timestamp', () => {
    const valid = {
      id: UUID_A,
      patientId: UUID_B,
      branchId: UUID_B,
      type: 'inpatient',
      department: 'Cardiology',
      admittedAt: NOW,
      dischargedAt: null,
      status: 'open',
    };
    expect(encounterSchema.parse(valid)).toEqual(valid);
  });

  it('defaults status to open and leaves admittedAt optional', () => {
    const parsed = createEncounterSchema.parse({ type: 'outpatient', department: 'General' });
    expect(parsed).toEqual({ type: 'outpatient', department: 'General', status: 'open' });
  });
});

describe('createObservationSchema', () => {
  it('accepts a numeric observation with a unit', () => {
    expect(
      createObservationSchema.parse({ code: 'heart_rate', valueNum: 72, unit: 'bpm' }),
    ).toEqual({ code: 'heart_rate', valueNum: 72, unit: 'bpm' });
  });

  it('accepts a textual observation', () => {
    expect(
      createObservationSchema.parse({ code: 'blood_pressure', valueText: '120/80' }),
    ).toEqual({ code: 'blood_pressure', valueText: '120/80' });
  });

  it('rejects an observation carrying neither a numeric nor a textual value', () => {
    expect(createObservationSchema.safeParse({ code: 'weight' }).success).toBe(false);
  });
});

describe('observationSchema', () => {
  it('accepts a stored observation with explicit nulls', () => {
    const stored = {
      id: UUID_A,
      encounterId: UUID_B,
      code: 'spo2',
      valueNum: 98,
      valueText: null,
      unit: '%',
      recordedAt: NOW,
      recordedBy: UUID_B,
    };
    expect(observationSchema.parse(stored)).toEqual(stored);
  });
});

describe('auth schemas', () => {
  it('accepts a principal carrying branch identity', () => {
    const principal = {
      userId: UUID_A,
      email: 'doc.kl@aethelgard.demo',
      role: 'doctor',
      branchId: UUID_B,
    };
    expect(principalSchema.parse(principal)).toEqual(principal);
  });

  it('rejects a malformed login email', () => {
    expect(loginSchema.safeParse({ email: 'not-an-email', password: 'demo1234' }).success).toBe(
      false,
    );
  });

  it('exposes no secret on a demo user entry', () => {
    const demoUser = {
      email: 'doc.kl@aethelgard.demo',
      role: 'doctor',
      branchCode: 'KL',
      displayName: 'Dr Lim (Kuala Lumpur)',
    };
    expect(demoUserSchema.parse(demoUser)).toEqual(demoUser);
    expect(demoUserSchema.parse({ ...demoUser, password: 'leaked' })).not.toHaveProperty(
      'password',
    );
  });
});
