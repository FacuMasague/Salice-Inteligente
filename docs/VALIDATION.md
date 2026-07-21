# Validation record

Validation was performed on 21 July 2026 against the isolated `Hackaton` worktree and a newly generated fictional data pack.

## Release candidate

- Product: SMART Salice
- Version: 1.0.0
- Branch: `Hackaton`
- Dataset: deterministic synthetic demo
- Live business connectivity: none

## Required gates

| Gate | Command | Result |
| --- | --- | --- |
| TypeScript | `pnpm exec tsc --noEmit` | Passed |
| Tests | `pnpm test` | Passed: 22 files, 71 tests |
| Production build | `pnpm run build` | Passed: 1,729 modules transformed |
| Demo generation | `pnpm run prepare:demo` | Passed: all four local data layers regenerated |
| Snapshot audit | `pnpm run audit:data` | Passed: 16 customers, 16 products, 11 open documents |
| Commercial audit | `pnpm run audit:commercial-data` | Passed: 1,193 rows, 16 customers, 16 products, 4 sellers |
| Vector audit | `pnpm run audit:vectors` | Passed: 16/16 products vectorized, no contradictions |
| Operations audit | `pnpm run audit:operations` | Passed: SQLite integrity `ok`, 11 tables |
| Platform audit | `pnpm run audit:platform` | Passed: 15/15 checks, 0 failures, 0 warnings |
| Production startup | `pnpm start` plus HTTP smoke checks | Passed: application shell and `/api/dashboard` served locally |
| Administrative exports | CSV, XLSX, and PDF endpoint smoke checks | Passed: sales, receivables, goals, and invoice artifacts generated |
| Browser walkthrough | Main demo path and console | Passed: no warnings or errors in a clean browser session |
| Responsive browser check | 390 × 844 viewport | Passed: mobile menu works and no horizontal body overflow |
| Privacy and language scan | Tracked source and documentation | Passed |

## Browser evidence

The walkthrough covered the operational map, customer catalog and profile, product catalog and 33-dimension vector evidence, accounts receivable, route generation, Sales Explorer, Commercial Activities, System Guide, and the interactive tutorial. Customer profile opening, route optimization, responsive navigation, and the synthetic-data banner were exercised directly.

## Privacy evidence

- No protected production endpoint, original ERP name, private repository owner path, real company name, or known physical address was found in the release tree.
- No credential file, credential template, generated snapshot, SQLite database, backup, or export is intended to be tracked.
- Secret-pattern matches are explanatory statements saying that credentials are absent; no secret values or authorization headers are present.
- English-language scans found no remaining judge-visible Spanish text. Canonical internal vector keys remain implementation identifiers and are always presented through English labels.
- All generated demo records are ignored by Git and can be reproduced from source with `pnpm run prepare:demo`.

All required release gates passed before publication.
