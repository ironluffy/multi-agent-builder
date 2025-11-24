# Database Migrations

This directory contains SQL migration files for database schema changes.

## Migration File Format

Migration files must follow this naming convention:
```
YYYYMMDDHHMMSS_description.sql
```

Example: `20250122100000_create_users_table.sql`

## Migration File Structure

Each migration file must contain UP and DOWN sections:

```sql
-- UP
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);

-- DOWN
DROP TABLE IF EXISTS users;
```

## Running Migrations

### Apply all pending migrations:
```bash
node dist/database/migrate.js up
```

### Apply specific number of migrations:
```bash
node dist/database/migrate.js up 3
```

### Rollback last migration:
```bash
node dist/database/migrate.js down
```

### Rollback multiple migrations:
```bash
node dist/database/migrate.js down 3
```

### Check migration status:
```bash
node dist/database/migrate.js status
```

## Best Practices

1. **Always provide DOWN migrations** for rollback capability
2. **Test migrations** in development before production
3. **Keep migrations atomic** - one logical change per migration
4. **Use transactions** - migrations run in transactions by default
5. **Never modify existing migrations** after they've been applied
6. **Timestamp migrations** to ensure proper ordering

## Migration Tracking

Executed migrations are tracked in the `schema_migrations` table:
- `id`: Migration ID (timestamp)
- `filename`: Migration filename
- `executed_at`: Timestamp of execution
