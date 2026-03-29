import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Companies table
  await knex.schema.createTable('companies', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.string('country').notNullable();
    table.string('base_currency', 3).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // Users table
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    table.string('name').notNullable();
    table.string('email').notNullable();
    table.string('password_hash').notNullable();
    table.enum('role', ['EMPLOYEE', 'MANAGER', 'ADMIN']).notNullable().defaultTo('EMPLOYEE');
    table.uuid('manager_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.boolean('must_reset_password').defaultTo(false);
    table.boolean('invitation_sent').defaultTo(false);
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.unique(['email', 'company_id']);
    table.index('company_id');
  });

  // Expense categories
  await knex.schema.createTable('expense_categories', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    table.string('name').notNullable();
    table.string('description').nullable();
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.index('company_id');
  });

  // Expenses table
  await knex.schema.createTable('expenses', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.decimal('amount', 14, 2).notNullable();
    table.string('currency', 3).notNullable();
    table.decimal('converted_amount', 14, 2).nullable();
    table.decimal('conversion_rate', 14, 6).nullable();
    table.string('category').notNullable();
    table.text('description').nullable();
    table.date('expense_date').notNullable();
    table.string('receipt_url').nullable();
    table.enum('status', ['DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED']).notNullable().defaultTo('DRAFT');
    table.timestamp('submitted_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.index('company_id');
    table.index('user_id');
    table.index('status');
  });

  // Approval flows
  await knex.schema.createTable('approval_flows', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    table.string('name').notNullable();
    table.boolean('is_manager_first').defaultTo(false);
    table.boolean('is_active').defaultTo(true);
    table.decimal('amount_threshold', 14, 2).nullable();
    table.integer('approval_percentage').nullable().defaultTo(100);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.index('company_id');
  });

  // Approval steps
  await knex.schema.createTable('approval_steps', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('flow_id').notNullable().references('id').inTable('approval_flows').onDelete('CASCADE');
    table.integer('step_order').notNullable();
    table.enum('step_type', ['SEQUENTIAL', 'PARALLEL']).notNullable().defaultTo('SEQUENTIAL');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.index('flow_id');
  });

  // Step approvers
  await knex.schema.createTable('step_approvers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('step_id').notNullable().references('id').inTable('approval_steps').onDelete('CASCADE');
    table.enum('approver_type', ['USER', 'ROLE', 'MANAGER']).notNullable();
    table.uuid('approver_id').nullable();
    table.boolean('is_required').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.index('step_id');
  });

  // Expense approvals (tracking)
  await knex.schema.createTable('expense_approvals', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('expense_id').notNullable().references('id').inTable('expenses').onDelete('CASCADE');
    table.uuid('step_id').nullable().references('id').inTable('approval_steps').onDelete('SET NULL');
    table.uuid('approver_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.enum('status', ['PENDING', 'APPROVED', 'REJECTED']).notNullable().defaultTo('PENDING');
    table.text('comment').nullable();
    table.integer('step_order').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.index('expense_id');
    table.index('approver_id');
    table.index('status');
  });

  // Audit logs
  await knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    table.string('entity_type').notNullable();
    table.uuid('entity_id').notNullable();
    table.string('action').notNullable();
    table.uuid('actor_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.jsonb('details').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.index('company_id');
    table.index(['entity_type', 'entity_id']);
    table.index('actor_id');
  });

  // Currency cache
  await knex.schema.createTable('currency_cache', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('base_currency', 3).notNullable();
    table.string('target_currency', 3).notNullable();
    table.decimal('rate', 14, 6).notNullable();
    table.timestamp('fetched_at').defaultTo(knex.fn.now());
    table.unique(['base_currency', 'target_currency']);
  });

  // Notifications
  await knex.schema.createTable('notifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('type').notNullable();
    table.string('title').notNullable();
    table.text('message').notNullable();
    table.jsonb('metadata').nullable();
    table.boolean('is_read').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.index('user_id');
    table.index('company_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('notifications');
  await knex.schema.dropTableIfExists('currency_cache');
  await knex.schema.dropTableIfExists('audit_logs');
  await knex.schema.dropTableIfExists('expense_approvals');
  await knex.schema.dropTableIfExists('step_approvers');
  await knex.schema.dropTableIfExists('approval_steps');
  await knex.schema.dropTableIfExists('approval_flows');
  await knex.schema.dropTableIfExists('expenses');
  await knex.schema.dropTableIfExists('expense_categories');
  await knex.schema.dropTableIfExists('users');
  await knex.schema.dropTableIfExists('companies');
}
