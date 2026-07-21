# Demo script

Target duration: 2 minutes 40 seconds. The narration should identify the operational problem first, demonstrate one connected decision loop, and reserve the final seconds for architecture and Codex collaboration.

## Before recording or presenting

```bash
pnpm install
pnpm run prepare:demo
pnpm test
pnpm run build
pnpm run dev
```

Open `http://localhost:5173`, use a 1440×900 or larger browser window, dismiss unrelated notifications, and confirm the data badge says **Synthetic local demo**. Keep the app on the map home screen and the terminal out of the recording.

## Main path

| Time | Screen and action | Suggested narration |
| --- | --- | --- |
| 0:00–0:18 | Map overview; point to priorities and data status | “A regional distributor has sales dashboards, receivables, routes, and follow-ups in separate tools. SMART Salice turns those signals into one auditable operational loop.” |
| 0:18–0:42 | Open the highest-priority fictional customer | “The map ranks the next visit without hiding the logic. C is collection risk, O is commercial opportunity, and P combines them only for visit ordering.” |
| 0:42–1:05 | In the customer profile, show balance, recent movement, history, and a follow-up action | “The aggregate drills into documents and activity. Human notes, promises, and review decisions are stored separately from analytical facts.” |
| 1:05–1:30 | Open Products; select a recommendation and its vector evidence | “Recommendations are deterministic, not an opaque AI claim. Thirty-three product dimensions, confidence, and peer adoption explain why an item fits this customer.” |
| 1:30–1:52 | Open Receivables; filter aging and open a document | “The office can separate time until due from time overdue, filter multiple aging bands, and inspect the exact fictional document behind a balance.” |
| 1:52–2:14 | Open Sales Explorer; change a period or seller and drill into a row | “One filter universe drives aggregate sales and drill-down. Signed movements keep invoices and credit notes consistent across reports.” |
| 2:14–2:30 | Open Routes or Agenda briefly | “The signal becomes work: a feasible route, visit, call, collection, offer, or payment promise—with an auditable history.” |
| 2:30–2:40 | Show Settings/data-quality panel or a prepared architecture image | “Codex with GPT-5.6 helped isolate the project, replace private connectivity with deterministic fictional data, translate the product, and validate every layer. The business rules and final product decisions remained human-owned.” |

## Presentation discipline

- Say “fictional” or “synthetic” before showing any customer or balance.
- Do not describe C, O, P, vector confidence, or route ranking as machine-learning predictions.
- Pause after each click and let the screen settle before narrating the result.
- Show one strong drill-down rather than visiting every report.
- Keep cursor movement deliberate and avoid free-form typing during the video.
- End before three minutes; leave a five-to-ten-second upload safety margin.

## Fallback paths

| If this fails | Continue with |
| --- | --- |
| Map tiles are unavailable | Use customer markers on the blank Leaflet canvas or switch immediately to Customers; all business data remains local. |
| A map marker is hard to select | Open **Customers**, sort by P, and select the first row. |
| Operational data was changed during rehearsal | Continue—the audit trail demonstrates persistence—or move `data/operations.sqlite` aside before restart for a clean local seed. |
| A filter produces an empty result | Clear the filter using its visible reset action and return to the default period. |
| The development server stops | Use the verified production path: `pnpm run build`, `pnpm start`, and `http://127.0.0.1:8787`. |
| Live presentation time is shortened | Show map/customer priority, product evidence, then the architecture slide. |

## Recording shot list

1. Clean title frame: SMART Salice and “Synthetic operational intelligence for regional distribution.”
2. Full-screen product capture following the main path.
3. Architecture diagram from `README.md` or `docs/ARCHITECTURE.md`.
4. Final frame with the dedicated repository URL and “Built with Codex + GPT-5.6.”

Record at 1080p, use readable browser zoom, and verify that the uploaded video is public, has audible narration, and stays under three minutes.
