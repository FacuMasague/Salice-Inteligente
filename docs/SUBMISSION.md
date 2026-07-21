# Hackathon submission pack

## Short description

SMART Salice is a local operational-intelligence workspace for a fictional regional pet-supply distributor. It connects sales, collections, customers, products, routes, goals, and office follow-ups in one auditable workflow. Instead of stopping at a dashboard, a user can move from a decline, opportunity, or overdue balance to the underlying customer, product, or document—then record the human decision that follows.

The hackathon edition is safe and reproducible: every record is deterministic fictional data, the application makes no live ERP request, and no credential is required. Analytical facts are stored separately from notes, promises, reviews, and goals. Central metric definitions keep invoices, credit notes, comparison periods, and report filters consistent.

The technical differentiator is explainability. Collection risk (C), commercial opportunity (O), and visit priority (P) remain separate. Product recommendations expose evidence across 33 readable dimensions, confidence, and peer adoption; route planning exposes time, distance, and feasibility. Users can drill from aggregate results to exact synthetic documents without relying on an opaque prediction.

Codex with GPT-5.6 helped audit and isolate the architecture, replace private connectivity with deterministic demo generation, translate and polish the product, strengthen invariant-based tests, and prepare the release. The human owner retained responsibility for business rules, privacy boundaries, scope, and final product decisions.

## Technical innovation summary

SMART Salice combines an immutable analytical layer with a mutable operational layer. Deterministic local generation makes the complete demo reproducible, while signed movement rules and centralized metric contracts keep multiple reports reconcilable. The application connects decision support to action: transparent C/O/P scoring, explainable product vectors, evidence-backed recommendations, document-level receivables, route feasibility, and an auditable human follow-up history all share one navigation model.

The innovation is not a larger black box. It is a traceable chain from signal to source evidence to human action, with missing data represented honestly.

## Elevator pitch

“Regional distribution teams often work from an ERP, several dashboards, spreadsheets, maps, and personal notes. They can see what happened, but the next action—and the reason for it—gets lost.

SMART Salice brings those pieces into one operational loop. A user can spot a high-priority fictional customer, see exactly how collection risk and commercial opportunity were calculated, drill into the sales and receivable documents, inspect an explainable product recommendation, plan a feasible visit, and save the follow-up in an auditable history.

The hackathon build runs entirely on deterministic synthetic data. There is no live ERP connection, credential, or private record. Analytical facts stay separate from human-entered notes, promises, reviews, and goals.

Codex with GPT-5.6 helped us isolate the architecture, build the safe demo generator, translate and polish the experience, convert fragile snapshot tests into durable invariants, and validate the complete release. The result is not an opaque AI demo—it is a reliable, explainable decision system that a real distribution office can understand and act on.”

## Likely judge questions

### Is the data real?

No. Every record and result in this edition is fictional and deterministically generated. It is not transformed or anonymized company data.

### Where is AI used?

Codex with GPT-5.6 was the engineering and product-development collaborator. It supported architecture audit, local-data isolation, implementation, translation, testing, validation, and submission preparation. The runtime recommendations are intentionally deterministic and explainable rather than marketed as an AI prediction.

### What did the human decide?

The human owner defined the problem, privacy boundary, metric meaning, score separation, acceptable scope, product behavior, and release decisions. In particular, the owner required synthetic-only data and rejected live credentials, opaque scoring claims, and hackathon scope inflation.

### Why not keep everything in one database?

Analytical facts and human operations have different ownership and reset behavior. Rebuilding a sales snapshot must not erase a payment promise or review action, and editing a note must not alter a sales result.

### How do you prevent inconsistent reports?

Signed movements, date windows, report universes, labels, and ratios are centralized in shared metric definitions. Tests check invariants across the synthetic dataset rather than pinning all expectations to one private snapshot.

### Are C, O, and P machine-learning scores?

No. C is collection risk, O is commercial opportunity, and P is a transparent 58/42 visit-priority rule. They remain visible and separate.

### What makes recommendations explainable?

Each product has 33 dimensions derived from catalog properties. A recommendation shows the matching evidence, confidence, and comparable-customer adoption instead of only returning a rank.

### What happens when source detail is missing?

The UI marks it unavailable. The system never fabricates a line item, classification, or mapping just to complete a chart.

### What would productionization require?

Authentication, roles, multiuser concurrency, an approved private integration, deployment controls, monitoring, and field/mobile design. Those are roadmap items, not claims in this submission.

## Video plan

- Duration: 2:40 maximum, leaving margin below the three-minute limit.
- Format: public YouTube video with audible English narration.
- Story: problem → priority signal → customer/document evidence → explainable product recommendation → operational action → architecture/Codex contribution.
- Capture: 1080p, desktop browser, readable zoom, no terminals or private desktop content.
- Final frame: product name, dedicated repository, synthetic-data statement, and Codex + GPT-5.6 credit.

The exact sequence and fallback routes are in [DEMO_SCRIPT.md](DEMO_SCRIPT.md).

## Required submission notes

The official [OpenAI Open Model Hackathon page](https://openai.devpost.com/) and [rules](https://openai.devpost.com/rules) govern the submission. Based on the published Work and Productivity requirements, complete the following in Devpost:

- English project description and required form fields
- Public YouTube demo under three minutes, with audio explaining the Codex/GPT-5.6 use
- Accessible source repository, or required judge access if kept private
- Codex Session ID obtained through `/feedback`
- Clear disclosure of what Codex contributed and what decisions remained human
- Working project or accessible demonstration path

Deadline: July 21, 2026 at 5:00 PM Pacific Time (9:00 PM in Argentina). Recheck the Devpost countdown immediately before submission.
