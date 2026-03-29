import knex from 'knex';
import { config } from './index';

const db = knex({
  client: 'pg',
  connection: config.database.url,
  pool: { min: 2, max: 10 },
  migrations: {
    directory: '../migrations',
    tableName: 'knex_migrations',
  },
});

export default db;
