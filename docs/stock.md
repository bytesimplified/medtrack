# Stock management

`src/stock/ledger.ts` records refills and count corrections as append-only
`StockTransaction` rows. A refill is positive; an adjustment may add or remove
stock and requires a reason. Adjustments that would make the ledger negative
are rejected. Each command accepts an operation ID so a retry cannot duplicate
the same change.

The current balance is the sum of the stock ledger. The forecast replays all
saved schedule versions over the next 366 medicine-local dates, including
effective dates, schedule end dates, and pauses. The projected stock-out date is
the first date on which the planned dose quantity exceeds the remaining balance.
The low-stock badge appears when estimated supply is at or below the medicine's
`lowStockDays` threshold; a threshold of zero disables the badge.

Forecasts are estimates from the routine currently saved in this browser. They
do not account for unrecorded doses, future routine changes, or stock a person
has not recorded. Archived medicines and medicines without upcoming doses have
no supply estimate.
