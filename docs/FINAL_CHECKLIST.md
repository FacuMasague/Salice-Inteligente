# Final submission checklist

## Product and data

- [ ] Product name is **SMART Salice** everywhere visible.
- [ ] Application-owned text is English.
- [ ] Data badge identifies the synthetic local demo.
- [ ] No real customer, employee, product, transaction, address, or business result is present.
- [ ] No live ERP client, refresh action, credential, `.env` template, or private endpoint remains.
- [ ] C, O, and P are visible as separate concepts.
- [ ] Implemented features and roadmap items are clearly separated.

## Reproducibility and verification

- [ ] A clean checkout succeeds with `pnpm install` and `pnpm run prepare:demo`.
- [ ] `pnpm test` passes.
- [ ] `pnpm run build` passes.
- [ ] Data, commercial, vector, operations, and platform audits pass.
- [ ] Development and production startup paths work.
- [ ] Main browser path has no console errors or broken interactions.
- [ ] Map-offline fallback is usable.
- [ ] CSV/XLSX/PDF exports use only fictional content.

## Repository safety

- [ ] Publish from the isolated `Hackaton` worktree, never from `main`.
- [ ] `git status` contains only intended release changes.
- [ ] `git ls-files` contains no generated data, SQLite file, backup, export, `.env`, or credential file.
- [ ] Tracked-content scan finds no secret, private URL, real entity, or development-only messaging.
- [ ] Dedicated repository contains only the sanitized hackathon history.
- [ ] Release commit is identified and tag `v1.0.0-hackathon` points to it.
- [ ] Repository access works in a signed-out browser, or both required judge accounts have private access.

## Video

- [ ] Public YouTube URL works when signed out.
- [ ] Video is under three minutes.
- [ ] English narration is audible.
- [ ] Synthetic-data statement appears or is spoken.
- [ ] Codex and GPT-5.6 contribution is explained.
- [ ] No terminal, secret, private desktop notification, or real business content is visible.
- [ ] Repository URL is legible in the final frame or description.

## Devpost

- [ ] Correct Work and Productivity track selected.
- [ ] English description, technology list, repository link, and video link entered.
- [ ] Codex Session ID obtained through `/feedback` and entered.
- [ ] Human decisions and Codex contributions described clearly.
- [ ] Working-project access instructions included.
- [ ] All required team and eligibility fields completed.
- [ ] Preview reviewed for broken links and formatting.
- [ ] Submission sent before July 21, 2026, 5:00 PM Pacific / 9:00 PM Argentina.
- [ ] Confirmation page and email saved.

## Recommended release sequence

1. Finish browser QA and record validation evidence.
2. Commit the isolated `Hackaton` branch.
3. Export the sanitized tree into a new repository with no production history.
4. Push branch `Hackaton` and tag `v1.0.0-hackathon`.
5. Verify repository access from a signed-out browser.
6. Record and upload the final video.
7. Obtain the Codex Session ID with `/feedback`.
8. Complete Devpost, preview it, and submit.
