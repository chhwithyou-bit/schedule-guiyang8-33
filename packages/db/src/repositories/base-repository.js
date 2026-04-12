import { and, eq } from 'drizzle-orm';

function normalizePredicates(whereConditions) {
  return Array.isArray(whereConditions) ? whereConditions.filter(Boolean) : [whereConditions].filter(Boolean);
}

export class BaseRepository {
  constructor(db, table) {
    this.db = db;
    this.table = table;
  }

  get idColumn() {
    return this.table.id ?? null;
  }

  getExecutor(options = {}) {
    return options.tx || this.db;
  }

  async create(values, options = {}) {
    const query = this.getExecutor(options).insert(this.table).values(values);
    return options.returning === false ? query : query.returning();
  }

  async findById(id, options = {}) {
    if (!this.idColumn) {
      throw new Error('findById requires a table with an id column.');
    }

    const [row] = await this.getExecutor(options)
      .select()
      .from(this.table)
      .where(eq(this.idColumn, id))
      .limit(1);
    return row ?? null;
  }

  async deleteById(id, options = {}) {
    if (!this.idColumn) {
      throw new Error('deleteById requires a table with an id column.');
    }

    const query = this.getExecutor(options).delete(this.table).where(eq(this.idColumn, id));
    return options.returning === false ? query : query.returning();
  }

  async list({ where, orderBy, limit, offset } = {}, options = {}) {
    let query = this.getExecutor(options).select().from(this.table);

    if (where) query = query.where(where);
    if (orderBy?.length) query = query.orderBy(...orderBy);
    if (typeof limit === 'number') query = query.limit(limit);
    if (typeof offset === 'number') query = query.offset(offset);

    return query;
  }

  async updateWhere(whereConditions, values, options = {}) {
    const predicates = normalizePredicates(whereConditions);
    if (!predicates.length) {
      throw new Error('updateWhere requires at least one predicate.');
    }

    const query = this.getExecutor(options).update(this.table).set(values).where(and(...predicates));
    return options.returning === false ? query : query.returning();
  }

  async deleteWhere(whereConditions, options = {}) {
    const predicates = normalizePredicates(whereConditions);
    if (!predicates.length) {
      throw new Error('deleteWhere requires at least one predicate.');
    }

    const query = this.getExecutor(options).delete(this.table).where(and(...predicates));
    return options.returning === false ? query : query.returning();
  }
}
