# Security and synthetic-data policy

This repository is designed to be safe for hackathon review. It contains no operational company dataset and needs no private service to run.

## What is synthetic

Every demo customer, seller, product, brand, address, email, phone number, invoice, credit note, balance, visit, route, goal, recommendation input, and performance result is invented. Names use fictional entities; email addresses use the reserved `.invalid` top-level domain. Values are deterministic so tests, screenshots, and judge walkthroughs remain reproducible.

The demo does not preserve, perturb, aggregate, pseudonymize, or sample real records. Synthetic generation starts from committed fictional seeds.

## What is not in this edition

- API clients, refresh jobs, API keys, passwords, tokens, or credential templates
- Live ERP access or an environment-file requirement
- Real snapshots, exports, backups, operational SQLite databases, or customer identifiers
- Historical business-intelligence extracts or reconciliation databases
- Authentication claims or production deployment secrets

The application can request public OpenStreetMap tiles for the visual basemap. This request contains map viewport information only; no business dataset is sent to the tile service. If tiles are unavailable, the local workflow still functions.

## Repository controls

Generated and local-only artifacts are ignored by Git:

- `data/`
- `.env`
- logs and coverage
- build output and dependencies

The committed generator creates:

- `data/snapshot.json`
- `data/staging/snapshot-demo.json`
- `data/commercial-demo.sqlite`
- `data/pending-balances-demo.sqlite`

At runtime, operational actions use `data/operations.sqlite`. None of these files should be committed.

## Reproducible reset

Run `pnpm run prepare:demo` to regenerate the analytical pack. That command intentionally preserves `operations.sqlite`, because notes and workflow state are a separate data responsibility. For a pristine presentation, stop the server and move that file to a private ignored backup before restarting; startup will create a fresh operational database.

## Pre-publication review

Before every release:

1. Confirm `git ls-files` contains no `.env`, SQLite, JSON snapshot, backup, or export under `data/`.
2. Search tracked content for credential patterns, authorization headers, private URLs, and real entity identifiers.
3. Generate the demo from a clean checkout and run the complete audit chain.
4. Inspect visible UI, exports, and screenshots for real names or values.
5. Publish from the isolated `Hackaton` tree, not the production repository history.

If a scan finds an ambiguous record, treat it as private until it has been replaced and the generated pack has been rebuilt.
