import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    dbUrl: string;
  }
}

/**
 * Starts one Postgres for the whole database test run. Set DB_TEST_URL to
 * point at an already-running Postgres (e.g. the docker-compose stack)
 * instead, and no container is started — this is how you'd point the same
 * test suite at an Aurora or RDS instance to sanity-check compatibility.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const existing = process.env.DB_TEST_URL;
  if (existing !== undefined && existing !== '') {
    project.provide('dbUrl', existing);
    return async () => undefined;
  }

  let container: StartedPostgreSqlContainer;
  try {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
  } catch (error) {
    throw new Error(
      'Could not start the Postgres test container. Is Docker running? ' +
        'Alternatively set DB_TEST_URL to an existing database.',
      { cause: error },
    );
  }

  project.provide('dbUrl', container.getConnectionUri());
  return async () => {
    await container.stop();
  };
}
