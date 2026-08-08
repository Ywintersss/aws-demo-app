import { describe, expect, it } from 'vitest';
import { buildTestServer, AUTH_HEADER } from './testServer.js';

const createPatient = async (app: ReturnType<typeof buildTestServer>['app']) =>
  app
    .inject({
      method: 'POST', url: '/api/patients', headers: AUTH_HEADER,
      payload: { name: 'Tan Wei Ming', dob: '1990-01-01', sex: 'male', phone: '+60129876543' },
    })
    .then((r) => r.json());

describe('encounter and observation routes', () => {
  it('POST /api/patients/:id/encounters creates an encounter for that patient', async () => {
    const { app } = buildTestServer();
    const patient = await createPatient(app);
    const response = await app.inject({
      method: 'POST', url: `/api/patients/${patient.id}/encounters`, headers: AUTH_HEADER,
      payload: { type: 'outpatient', department: 'General' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().patientId).toBe(patient.id);
  });

  it('GET /api/patients/:id/encounters lists them', async () => {
    const { app } = buildTestServer();
    const patient = await createPatient(app);
    await app.inject({
      method: 'POST', url: `/api/patients/${patient.id}/encounters`, headers: AUTH_HEADER,
      payload: { type: 'outpatient', department: 'General' },
    });
    const response = await app.inject({ method: 'GET', url: `/api/patients/${patient.id}/encounters`, headers: AUTH_HEADER });
    expect(response.json()).toHaveLength(1);
  });

  it('PATCH /api/encounters/:id discharges an encounter', async () => {
    const { app } = buildTestServer();
    const patient = await createPatient(app);
    const encounter = await app
      .inject({ method: 'POST', url: `/api/patients/${patient.id}/encounters`, headers: AUTH_HEADER, payload: { type: 'inpatient', department: 'Cardiology' } })
      .then((r) => r.json());
    const response = await app.inject({
      method: 'PATCH', url: `/api/encounters/${encounter.id}`, headers: AUTH_HEADER, payload: { status: 'discharged' },
    });
    expect(response.json().status).toBe('discharged');
  });

  it('POST /api/encounters/:id/observations records an observation stamped with the caller', async () => {
    const { app, deps } = buildTestServer();
    const patient = await createPatient(app);
    const encounter = await app
      .inject({ method: 'POST', url: `/api/patients/${patient.id}/encounters`, headers: AUTH_HEADER, payload: { type: 'outpatient', department: 'General' } })
      .then((r) => r.json());
    const response = await app.inject({
      method: 'POST', url: `/api/encounters/${encounter.id}/observations`, headers: AUTH_HEADER,
      payload: { code: 'heart_rate', valueNum: 72, unit: 'bpm' },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.recordedBy).toBe((await deps.authProvider.verify('valid-token'))?.userId);
  });

  it('GET /api/encounters/:id/observations lists them oldest first', async () => {
    const { app } = buildTestServer();
    const patient = await createPatient(app);
    const encounter = await app
      .inject({ method: 'POST', url: `/api/patients/${patient.id}/encounters`, headers: AUTH_HEADER, payload: { type: 'outpatient', department: 'General' } })
      .then((r) => r.json());
    await app.inject({ method: 'POST', url: `/api/encounters/${encounter.id}/observations`, headers: AUTH_HEADER, payload: { code: 'heart_rate', valueNum: 72 } });
    const response = await app.inject({ method: 'GET', url: `/api/encounters/${encounter.id}/observations`, headers: AUTH_HEADER });
    expect(response.json()).toHaveLength(1);
  });
});
