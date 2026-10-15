# Payment rules — how money lands on an invoice (P25.2 §5.4)

*Owner-approvable decision record. Written before the code, because the plan asks the question before the
answer is written in PHP: how a partial payment maps to an invoice, what happens to an overpayment, who may
record a manual payment, and what evidence it needs. The rules are enforced in `api/v2/routes/invoices.php`
and `api/v2/lib/money.php`, and the reconciliation is asserted in `tests/run.php`. If this document and the
code ever disagree, the tests are the referee and this file is wrong.*

## 0. What this is — and what it is not

This is **manual tracking**: money that arrived by cash, bank transfer, cheque or online transfer is
recorded by a person. **No payment gateway is connected, claimed, or implied** — the method names say how
the money physically moved, nothing more. Currency is PKR, in whole rupees.

## 1. Allocation — one payment row, one invoice

- A payment maps to exactly one invoice (`invoice_id`). Money for two invoices is two rows; nothing is
  split automatically.
- The **balance identity** is the rule the reconciliation test asserts, for every fixture:

  `invoice total = Σ(non-reversed payments) + balance`  —  and `credit = max(0, Σ − total)`.

- Payment rows are never deleted and never edited after they are taken. Corrections are **reversals**
  (§5). A ledger that can silently change is not a ledger.

## 2. Partial payments

- Any amount from one rupee up to the outstanding balance may be recorded, as often as it arrives.
- The invoice reads `partial` until the payments reach the total, then `paid`.

## 3. Overpayments — refused once, recorded when confirmed

An amount above the outstanding balance is **first refused**, with the balance named — that is v2.1's typo
guard, kept (the common case really is a mistyped zero). If the extra is meant, the person confirms it
(`"credit": true` in the request; a confirm box in the console) and the money is **recorded as it arrived**:

- the invoice reads `overpaid`, with the credit (`paid − total`) shown as a figure;
- the excess is never hidden by clamping the balance to zero, and never silently applied to another
  invoice (allocating a credit elsewhere is a future feature and is not claimed here);
- refusing to record money that arrived would push a clerk to enter a smaller number or to book it on the
  wrong invoice — both falsify the ledger. So: confirm, then record.

## 4. Zero and negative amounts are not payments

- A payment of zero is refused ("Enter the amount you received"). A negative payment is refused: money
  flows one way in this ledger, and a correction is a reversal (§5), never a negative row.

## 5. Reversals — the only correction

- `DELETE /invoices/{id}/payments/{payment}` reverses a payment: the row **stays**, marked with
  `reversed_at` and `reversed_by`, the reason goes to the audit trail, and a reversed row never counts
  toward the balance. Reversing twice is refused.
- Receipt numbers are never reused: the invoice's counter is monotonic, so a reversed payment leaves a
  visible gap in the receipt sequence rather than two payments sharing one number.

## 6. Who may record a payment — and what evidence it needs

- The roles carrying v2.1's `pay_add` may record one (`pay_delete` for a reversal) — no new permission
  names. A Manager's entry **waits for the Master** exactly as other writes do (the approval queue).
- The person on the receipt (`created_by`) is the **verifier**: the one who took the money and checked it
  arrived. The audit trail records who recorded it and, on a reversal, who undid it and why.
- Evidence per payment:

  | Field | Rule |
  |---|---|
  | `date` | the day the money moved (`paid_on`), not the day it was typed |
  | `amount` | whole rupees, more than zero |
  | `method` | one of `cash` · `bank` · `cheque` · `online` — how it physically arrived |
  | `ref` | **required for `bank`, `cheque` and `online`**: the slip, cheque or transfer number |
  | `note` | free text; for `cash` this is where the evidence lives when there is no slip |

## 7. Status is derived, never typed

`unpaid` · `partial` · `paid` · `overpaid` are computed from the payment rows on **every read**. No request
can set them; no screen shows one the rows do not support. The v2.1 tracker's own vocabulary (`track`:
`unpaid`/`partial`/`paid`/`after_delivery`) is kept as a derived mapping, with `overpaid` mapping to
`paid` there — the old screen has no word for credit and must not be shown one it cannot say.

## 8. What a test must prove (`tests/run.php`, in the gate)

1. **Reconciliation** — the balance identity holds for a fixture set including partial, over-, zero and
   reversed payments: `total = Σ(non-reversed) + balance`, `credit = max(0, Σ − total)`, and the status is
   the rows' (`unpaid`/`partial`/`paid`/`overpaid`).
2. **Entry rules** — zero and negative amounts are refused; an overpayment is refused unconfirmed and
   recorded confirmed; `bank`/`cheque`/`online` without a `ref` are refused; `cash` without one is not.
3. **Reversal maths** — a reversed row drops out of the sum, restores the balance, and never re-enters.
