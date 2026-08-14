# PHASE 11 — Billing + Usage Architecture

**Status:** Implemented in repository (awaiting human review)  
**Branch:** `cursor/phase-11-billing-usage-c4aa`  
**Production:** Unchanged — no deploy, no Stripe, no payments, no production migration apply

---

## Goal

Billing data model and estimated monthly fee views for AscendOS:

- **€20 / organization / month** (`2000` cents)
- **€2 / active membership / month** (`200` cents)

No payment provider. No Stripe. No invoices sent.

---

## Schema

| Table                    | Role                                                             |
| ------------------------ | ---------------------------------------------------------------- |
| `billing_config`         | Single-row pricing (cents, EUR)                                  |
| `org_billing_accounts`   | Per-org status / billing email / nullable `provider_customer_id` |
| `org_subscriptions`      | Plan + prices + period                                           |
| `org_subscription_items` | `base` + `seat` line items                                       |
| `org_invoices`           | Placeholder model only                                           |

Seats = `COUNT(memberships WHERE status = 'active')` (authoritative).

---

## RPCs

- `billing_get_config` / `billing_estimate_monthly_cents` / `billing_count_active_seats`
- `org_admin_get_billing` / `org_admin_get_usage` — active org only
- `platform_list_billing` — platform admin overview
- `ensure_org_billing` — bootstrap on org create + backfill

---

## UI

- `/admin/billing` — Organization Admin (estimated fee + org usage)
- `/platform-admin/billing` — Platform Admin overview table

---

## Out of scope

- Stripe / payments / tax / PDF invoices
- Phase 12 second production organization
- Autopilot / carousel / AI keys changes
