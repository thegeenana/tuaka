# TuaKa

*See every payment until it's paid.*

TuaKa (Twi: "pay the debt") is a loan amortization calculator. Set any three of **principal, rate, term and payment** and it solves the fourth, then shows every payment, year by year, to the penny.

## What's here

| Path | What it is |
| --- | --- |
| `packages/engine` | `@tuaka/engine` — pure, deterministic calculation engine (TypeScript + decimal.js). No clock, no I/O, no floating point. |
| `apps/web` | React + Vite installable web app (PWA). Runs the engine in a Web Worker; saves the scenario in the browser. |

## Engine principles

- **Money and rates are decimal strings**, never JS numbers.
- **Solve for any one variable**: payment and principal by closed form, term by logarithm, rate by bisection.
- **Rounding is explicit**:
  - `half_up` (default) / `half_even` — payment and each month's interest rounded to the penny, as a lender bills. The final payment is resized to clear the balance.
  - `none` — full precision, rounded only for display, as most calculators do.
- **Every result carries `engineVersion` and an `inputHash`** (SHA-256 of the canonical input), so any number can be traced back to exactly what produced it.

### Reference test

`packages/engine/test/reference.test.ts` reproduces the original calculator screen (100,000 at 5% over 30 years from Aug 2024) row by row, to the penny, in `none` mode. That screen keeps the payment at 536.8216…, which is why full years total 6,441.86 rather than 12 × 536.82 = 6,441.84.

## Getting started

```bash
corepack enable          # provides pnpm
pnpm install
pnpm dev                 # http://localhost:5173
pnpm check               # lint + typecheck + test + build
```

Requires Node 22+.

## Roadmap

1. ~~Engine: fixed-rate solve-for-any, rounding, calendar, golden tests~~
2. ~~Calculator UI, no backend~~
3. Modifiers: expenses, prepayments and recurring extra payments, up-front costs + APR, rate steps
4. Accounts and persistence: sign-in, PostgreSQL, save/share, CSV/PDF export
5. Adjustable rates and UK features: index data, caps, early repayment charges, overpayment allowance
6. Side-by-side comparison of offers

*Illustration only, not financial advice.*
