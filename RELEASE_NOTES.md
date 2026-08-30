# ProxyFox release notes

## v1.4.2 — release candidate

The v1.4.2 candidate improves startup and large-configuration performance while tightening rollback and authentication behavior.

### Changes

- Parallelized popup initialization and reduced Manifest V3 service-worker cold-start work.
- Matched proxy endpoints before expanding large bypass lists.
- Made configuration and global-whitelist imports one rollback-safe transaction.
- Fixed credential selection while a newly selected proxy becomes active.
- Migrated legacy configurations and isolated invalid stored entries.
- Replaced certificate-exception advice with safer administrator-managed trust guidance in all five languages.
- Added regression coverage for cold starts, scale, import rollback, authentication races, and migration.

### Verified artifact

- File: `proxyfox-v1.4.2.zip`
- Size: `268003` bytes
- SHA-256: `457d02710d5e3af93d6c1d86590462424067c6594ebaefbf722273b7f55790bd`

The candidate has not yet been submitted as a Chrome Web Store update. The store currently carries stable v1.4.1.
