# Database backup and portability

The application uses Alibaba Cloud RDS for PostgreSQL as its primary database. RDS automatic backups remain the first recovery layer. A separate PostgreSQL custom-format archive provides a provider-independent copy for migration or disaster recovery.

## Create a local backup

Docker Desktop must be running. The script loads `.env.local` through the existing TypeScript runner, prefers `DATABASE_MIGRATION_URL`, and never prints the connection string. For a remote URL without an explicit SSL mode, the backup process requires TLS.

```powershell
node scripts/run-tsx.cjs scripts/backup-database.ts
```

Archives are written to the Git-ignored `backups/database` directory. Each `.dump` has a JSON sidecar containing its size and SHA-256 checksum. The script also runs `pg_restore --list` before reporting success.

Alibaba Cloud RDS names pgvector index operator classes with an `rds_vector_` prefix. A vanilla pgvector server uses `vector_` instead. The backup command therefore creates two additional portability sidecars:

- `.restore-list` excludes RDS-specific vector indexes from the main restore;
- `.portable-indexes.sql` recreates those indexes with standard pgvector operator classes.

Keep these sidecars with the `.dump` file. The original archive remains unchanged and can still be restored inside Alibaba Cloud.

The archive intentionally excludes ownership and ACL metadata so it can be restored under a different PostgreSQL account or cloud provider. Database roles and deployment credentials must be provisioned separately. The destination must support the extensions used by the schema, including pgvector.

## Storage policy

- Keep daily archives for 14 days.
- Keep one weekly archive for 8 weeks.
- Copy each successful archive to an encrypted disk and an independent versioned object-storage bucket.
- Never commit archives, manifests, passwords, or `.env.local`.
- Perform a test restore at least monthly. A backup is not considered valid until it has been restored and the application checks pass.

## Restore safety

Restore into a new empty database first. Do not use `--clean` against the production database. After restoring, run migrations, application security verification, and the most relevant RAG verification commands before switching application traffic.

## Switch development to the restored local database

After a verified archive has been restored as `network_copilot_local`, apply migrations with a temporary local owner connection. Then run:

```powershell
node scripts/run-tsx.cjs scripts/configure-local-database.ts
```

The command creates or rotates a restricted local login and updates only the three database settings in `.env.local`. Other model, embedding, search, and mailbox settings remain unchanged. The Docker port is bound to `127.0.0.1`, so PostgreSQL is not exposed on the LAN.

After switching, `backup-database.ts` backs up the local database because it reads the updated `DATABASE_MIGRATION_URL`. RDS is no longer queried by the application, but external model, embedding, search, contact, and mailbox providers remain external unless separately replaced.
