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
- Size: `269338` bytes
- SHA-256: `c5a50300f77a61e521f81f22c2e995caaf78f50e13dd3e7dfcf56d3ef7fd71d3`

The candidate has not yet been submitted as a Chrome Web Store update. The store currently carries stable v1.4.1.
