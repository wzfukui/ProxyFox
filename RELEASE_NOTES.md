# ProxyFox release notes

## v1.4.3 — 2026-10-03

- Preserve drafts, newer selections, and test results during asynchronous state refreshes; prevent overlapping editor operations.
- Protect unsaved global whitelist edits when importing, changing languages, or leaving the page.
- Fix full-size backup imports, prefer exact IDs over name collisions, and retain legacy global whitelist rules.
- Preserve externally controlled connections when importing saved profiles.
- Support the full combined and expanded whitelist capacity and compare bypass rules without sorting.
- Restore per-protocol proxy settings after connection tests and stop downloading probe responses after headers arrive.
- Add popup retry recovery and preserve keyboard focus after switching.
- Reflow the editor for narrow windows and simplify configuration-name labels in all five languages.
- Add 19 regression tests; see `CODE_REVIEW_2026-10-03.md` for verification and scope.

The v1.4.3 source and ZIP include these fixes. The five interface languages and Store listing drafts include matching release notes; the bilingual website links to the same ZIP. This version has not been submitted to the Chrome Web Store.

### Verified v1.4.3 artifact

- File: `proxyfox-v1.4.3.zip`
- Size: `272484` bytes
- SHA-256: `d118df3ab8e8a219e391e8afe5148d9fa8b4743f3a2ced36e8dd2578a380a547`
- Website download: the identical ZIP is stored in `../proxyfox.github.io/docs/download/`.
- Validation: all 46 tests passed; ZIP integrity and packaged-file/source parity passed. The unpacked ZIP displayed the v1.4.3 release history correctly in all five languages in Chromium, with no page errors or overflowing release text. Both website download pages passed local HTTP and ZIP hash checks.

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

The Chrome Web Store lists v1.4.2, updated August 30, 2026 (checked October 3, 2026 on the [public listing](https://chromewebstore.google.com/detail/proxyfox/ejgcljmgjglpeacggbhccbhhojjmkjci)).
