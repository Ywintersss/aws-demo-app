import { describe, expect, it } from 'vitest';
import { buildTestServer, AUTH_HEADER } from './testServer.js';

const createPatient = async (app: Awaited<ReturnType<typeof buildTestServer>>['app']) =>
  app
    .inject({
      method: 'POST',
      url: '/api/patients',
      headers: AUTH_HEADER,
      payload: { name: 'Tan Wei Ming', dob: '1990-01-01', sex: 'male', phone: '+60129876543' },
    })
    .then((r) => r.json());

describe('patients routes', () => {
  it('POST /api/patients requires authentication', async () => {
    const { app } = await buildTestServer();
    const response = await app.inject({
      method: 'POST',
      url: '/api/patients',
      payload: { name: 'X', dob: '1990-01-01', sex: 'male', phone: '+60100000000' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('POST /api/patients creates a patient defaulting to the caller\'s branch', async () => {
    const { app } = await buildTestServer();
    const patient = await createPatient(app);
    expect(patient.mrn).toMatch(/^KL-\d{6}$/);
  });

  it('GET /api/patients/:id returns the created patient; unknown id returns 404', async () => {
    const { app } = await buildTestServer();
    const created = await createPatient(app);
    const found = await app.inject({ method: 'GET', url: `/api/patients/${created.id}`, headers: AUTH_HEADER });
    expect(found.json()).toEqual(created);
    const missing = await app.inject({ method: 'GET', url: '/api/patients/does-not-exist', headers: AUTH_HEADER });
    expect(missing.statusCode).toBe(404);
  });

  it('GET /api/patients searches and paginates', async () => {
    const { app } = await buildTestServer();
    await createPatient(app);
    const response = await app.inject({ method: 'GET', url: '/api/patients?search=Tan&page=1&pageSize=10', headers: AUTH_HEADER });
    const body = response.json();
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('PATCH /api/patients/:id updates a field', async () => {
    const { app } = await buildTestServer();
    const created = await createPatient(app);
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/patients/${created.id}`,
      headers: AUTH_HEADER,
      payload: { phone: '+60111111111' },
    });
    expect(response.json().phone).toBe('+60111111111');
  });

  it('DELETE /api/patients/:id soft-deletes; a subsequent GET is 404', async () => {
    const { app } = await buildTestServer();
    const created = await createPatient(app);
    expect((await app.inject({ method: 'DELETE', url: `/api/patients/${created.id}`, headers: AUTH_HEADER })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/api/patients/${created.id}`, headers: AUTH_HEADER })).statusCode).toBe(404);
  });
});
