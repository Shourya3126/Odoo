import { config } from './src/config/index';

module.exports = {
  client: 'pg',
  connection: config.database.url,
  pool: { min: 2, max: 10 },
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations',
    extension: 'ts',
  },
  seeds: {
    directory: './seeds',
    extension: 'ts',
  },
};
