# ProxyFox review and repairs — 2026-10-03

Reviewed the Manifest V3 background worker, shared configuration utilities, popup, settings editor, styles, locales, import/export paths, and existing regression tests, based on `77a7cbb`. The review initially produced source-only fixes. A subsequent authorized release-preparation pass packages them as v1.4.3 with synchronized translations and website download information; see `RELEASE_NOTES.md` for artifact details. No Chrome Web Store submission was performed.

## Findings repaired

| Priority | Reproduction and impact | Repair |
| --- | --- | --- |
| P1 | Start a state refresh and type before the background response arrives: the old dirty-state check allowed the response to overwrite new input. A new untouched draft or a newer selection could also disappear. | Recheck editing state after the request; reject stale responses and preserve the editor revision and new drafts. |
| P1 | While saving, deleting, activating, importing, or testing, the surrounding profile list and add button remained usable. Completion could update a different editor. | Lock conflicting editor controls and guard handlers, defer state refreshes, and preserve queued selection after saving. |
| P1 | Import a record whose ID matches one profile and whose name matches an earlier profile: merge replaced the wrong record. | Resolve exact IDs before name fallback. |
| P1 | A legacy backup can contain parsed whitelist rules and an empty raw-text field. Reimport previously preferred the empty field, losing rules. | Fall back to parsed rules on import; generate raw text on export when it is absent. |
| P2 | Export 1,000 custom profiles plus the two built-in modes, then import: the file exceeded the importer’s count even though it came from ProxyFox. | Count custom profiles consistently. |
| P2 | Import profiles while another extension controls the connection: import failed; an unmatched connection controlled by ProxyFox could be replaced with direct mode. | Store the imported bundle without changing an external connection. |
| P2 | Two valid 10,000-rule lists could fail when merged; even one large wildcard list could fail after root domains were expanded. | Keep per-input limits and account separately for combined and expanded lists; use set membership instead of sorting to compare effective rules. |
| P2 | Test a proxy while the prior state uses separate HTTP/HTTPS/fallback proxies: restoration succeeded in Chrome but verification rejected the restored state. | Compare all supported proxy slots, normalize default ports, and treat malformed bypass data as a mismatch. See the [Chrome proxy API](https://developer.chrome.com/docs/extensions/reference/api/proxy) for these setting forms. |
| P2 | A custom probe URL returns a large or streaming body: fetching headers was enough for success, but the body was left downloading. | Cancel the response body after measuring header latency, including HTTP-error responses. |
| P2 | State-only refresh cleared a completed connection-test result. Oversized form whitelist parsing rejected outside the validation catch. | Preserve results when the selected configuration is unchanged; surface parsing failures as form errors. |
| P2 | A popup request failure left the list busy without a recovery action; rerendering after a switch lost keyboard focus. | Add localized Retry, always end loading state, ignore stale reads, refresh effective state after activation, and restore focus. |
| P2 | On a 390px viewport, fixed grid minimums and absolutely positioned test buttons clipped the port and test controls. | Add editor container queries, remove fieldset minimum overflow, reflow endpoint/actions, bound the narrow-screen profile list, and wrap long titles. |
| P2 | Unsaved global whitelist changes were omitted from leave-page/language/import protection. | Include them in dirty-state checks and serialize global whitelist saving with editor operations. |

## Verification

- Baseline: 27 tests passed. The initial seven background regressions and the editor race reproductions failed against the original implementation before the fixes.
- Final `npm run check`: 46 tests passed, including JavaScript syntax, locale coverage, existing transaction/authentication tests, and 19 new regressions. Tests use Node built-ins; no project dependencies were added.
- `git diff --check`: passed.
- Real isolated Chrome for Testing 151 with the unpacked extension: saved a profile through the form; tested an authenticated loopback HTTP proxy against success and HTTP 503 responses. Both restored the exact prior Chrome proxy state, and the local server confirmed streaming response connections were released.
- UI connection test: list/add controls stayed locked during the request; the result remained visible after the background state refreshed.
- Popup: keyboard Enter switched to direct mode and retained focus; injected message failure exposed Retry and cleared `aria-busy`; retry recovered the normal state. One local ready measurement was approximately 3.4ms, not a general performance guarantee.
- Form overflow checks at 320, 390, 900, 1024, 1280, and 1440px: no horizontally clipped inputs/buttons, and form scroll width matched client width. English and Simplified Chinese screenshots were visually inspected; all five locale JSON files passed message coverage checks.
- Normal options-page browser console: no errors or warnings.

The host's accelerated browser rendering stalled animation frames during UI automation. Verification used isolated Chromium with GPU acceleration disabled, keyboard/fill input and DOM click dispatch, plus rendered screenshots. This does not establish hardware-accelerated rendering performance or physical-device coverage.

## Boundaries

- Inspected `../proxyfox.github.io` and its whitelist guides. The subsequent v1.4.3 preparation updates the bilingual homepages, download package, and homepage sitemap dates in that separate repository. Privacy and installation requirements are unchanged.
- Existing `AGENTS.md` and `community-rules/` were left untouched.
- Historical release ZIPs remain unchanged. The v1.4.3 ZIP is rebuilt from the repaired source and verified separately.
- Live enterprise policies, another installed proxy extension, remote authenticated HTTPS/SOCKS infrastructure, and minimum-version Chrome 114 were not exercised in a real browser. External ownership and per-protocol restoration are covered by the background harness.
