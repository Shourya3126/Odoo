import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add version column to expense_approvals for optimistic locking
  await knex.schema.alterTable('expense_approvals', (table) => {
    table.integer('version').notNullable().defaultTo(1);
    table.boolean('is_final').notNullable().defaultTo(false);
    table.boolean('is_required').notNullable().defaultTo(false);
  });

  // Add version column to expenses for optimistic locking
  await knex.schema.alterTable('expenses', (table) => {
    table.integer('version').notNullable().defaultTo(1);
    table.boolean('rate_is_fallback').notNullable().defaultTo(false);
  });

  // Enhance users table for invitation tracking
  await knex.schema.alterTable('users', (table) => {
    table.enum('invitation_status', ['PENDING', 'SENT', 'ACCEPTED']).notNullable().defaultTo('PENDING');
    table.timestamp('temp_password_expiry').nullable();
  });

  // Add composite indexes for performance
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_expenses_company_status ON expenses (company_id, status)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_approvals_approver_status ON expense_approvals (approver_id, status)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_approvals_expense_step ON expense_approvals (expense_id, step_order)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_approvals_version ON expense_approvals (id, version)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('expense_approvals', (table) => {
    table.dropColumn('version');
    table.dropColumn('is_final');
    table.dropColumn('is_required');
  });

  await knex.schema.alterTable('expenses', (table) => {
    table.dropColumn('version');
    table.dropColumn('rate_is_fallback');
  });

  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('invitation_status');
    table.dropColumn('temp_password_expiry');
  });

  await knex.raw('DROP INDEX IF EXISTS idx_expenses_company_status');
  await knex.raw('DROP INDEX IF EXISTS idx_approvals_approver_status');
  await knex.raw('DROP INDEX IF EXISTS idx_approvals_expense_step');
  await knex.raw('DROP INDEX IF EXISTS idx_approvals_version');
}
