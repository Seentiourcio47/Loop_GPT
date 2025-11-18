# Database Documentation

This directory contains database-related files and documentation.

## Schema

The database schema is defined in `../backend/prisma/schema.prisma`.

## Migrations

Migrations are managed by Prisma. To create a new migration:

```bash
cd backend
npx prisma migrate dev --name your-migration-name
```

## Seeding (Future)

To add seed data, create a `seed.ts` file and run:

```bash
npx prisma db seed
```

## Backup & Restore

### Backup
```bash
pg_dump -h localhost -U user -d loopgpt > backup.sql
```

### Restore
```bash
psql -h localhost -U user -d loopgpt < backup.sql
```

