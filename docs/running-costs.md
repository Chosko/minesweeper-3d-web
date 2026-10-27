# Running costs

What Pelion Games costs to keep running, what its games earn, and how the two
partners keep their contributions even. The figures live in a Google Sheet and
**nowhere else in this repository** -- this document records the structure, the
derivations and the routine, so the sheet can be maintained and extended without
reverse-engineering it from its own formulas.

This document is shared by the three game repos (IsThisFreedom, NeonSiege and
Minesweeper3D). Each repo carries its own copy, kept byte-identical, because an
agent cannot follow a link across repositories. A change is made in all three.

**Sheet:** <https://docs.google.com/spreadsheets/d/1MeWQKG95VFwoVTRWFbEb-PIvOl8yoz24CIjKLuyGfqI/edit>

## Reaching the sheet

| Who | How |
| --- | --- |
| A person | The link above, or Drive: *Pelion Games* -> *Budget* -> **Pelion Games — running expenses**. |
| Claude, to read | Drive connector, `read_file_content` with file id `1MeWQKG95VFwoVTRWFbEb-PIvOl8yoz24CIjKLuyGfqI`. Returns every tab as text. No browser, one call. |
| Claude, to write | The Sheets API as the service account -- see "Writing to the sheet". The Drive connector cannot do it: `update_file` changes the title and the parent folder and nothing else. |
| Claude, to file an invoice | Whoever can create the file does it; the service account cannot -- see "Invoices". |

The workbook sits in the `Budget` folder
(<https://drive.google.com/drive/folders/1LtgqaFbK-Q2ZfcB-kF8L7lyLE_STPYRX>)
inside the Pelion Games Drive folder
(<https://drive.google.com/drive/folders/1H27Ap-BydfZcDwpAa8KW0Sd_Jrylporm>),
beside an `Invoices` folder.

**Access is by named account only.** The Pelion Games folder is shared with
the two partners' Google accounts and the `claude-pelion` service account, and
`Budget` inherits that. Link sharing stays off: an "anyone with the link" grant
on any folder above the sheet makes it editable by every account that has the
link -- other service accounts included -- so a script that works is no proof
it is using the right credentials.

Reading the sheet is one cheap call and writing it is a scripted one. **The live
workbook is the only copy** -- there is no generator and no rebuild path, so an
edit that breaks a formula is a real loss, and a structural change is worth
saying out loud here before it is made.

## The organisation and the funding model

Pelion Games has two partners, **Chosko** (Ruben) and **Pelle**. Costs and
earnings belong to a project:

| Project | Meaning |
| --- | --- |
| `NeonSiege` | Costs and earnings of that game. |
| `IsThisFreedom` | Costs and earnings of that game. |
| `Minesweeper3D` | Costs and earnings of that game. |
| `Pelion` | Organisation-wide costs that belong to no single game. |

**Each partner pays costs from their own pocket**, up to a committed amount per
partner (`Funding!B`). There is no shared pot and no company account. A single
payment is never split between partners: whoever paid it is recorded in
`Paid by`. The 50/50 split is matched **over time**: when the gap between the
partners' contributions grows, one partner transfers money to the other, and that
transfer is a row in `Transfers`.

## Writing to the sheet

Writing uses a Google service account,
`claude-pelion@claudejobhunter.iam.gserviceaccount.com`. Its key sits at
`%USERPROFILE%\.pelion\credentials.json`, outside every game repo and never
checked in. The workbook is shared with the account as editor. Use the system
`python -I`, which has `google-api-python-client` and `google-auth` installed:

```python
import os
from google.oauth2 import service_account
from googleapiclient.discovery import build

creds = service_account.Credentials.from_service_account_file(
    os.path.expandvars(r"%USERPROFILE%\.pelion\credentials.json"),
    scopes=["https://www.googleapis.com/auth/spreadsheets"])
svc = build("sheets", "v4", credentials=creds, cache_discovery=False)
```

Things that bite:

- **The service account has no storage quota**, so it can read and edit
  existing files but `files.create` fails with `storageQuotaExceeded`. It
  cannot upload an invoice or create a sheet or a Doc. File *creation* stays
  with the Drive connector (which acts as the user) or the operator.
- **The sheet's locale is Italian.** Typed amounts are `47,88`, not `47.88`, and
  dates `16/09/2026`. A value that does not match lands as text and the row's
  derived columns return `#VALUE!` rather than failing loudly.
- **Write numbers and dates raw.** `valueInputOption: "RAW"` with a JSON number
  bypasses locale parsing; dates go in as serial days since 1899-12-30 and the
  column's `yyyy-mm-dd` format renders them. Text and formulas go in a second
  call with `USER_ENTERED`.
- **Formulas take the sheet's separator.** This workbook stores `;`, not `,`.
  Mirror what is already in the cell rather than assuming the API normalises.
- **Do not overwrite the derived columns.** Every row inside a table, empty ones
  included, already carries its formulas. Write only the white input columns and
  let the grey ones compute.
- **Writing `""` with `RAW` wipes the cell's number format and background.**
  Clear values with `values.clear` or `batchClear`, or reapply the formats in
  the same change.
- **Input tabs are Sheets tables without column types.** A column type
  (`DOUBLE`, `DATE`) resets the cell number format on every `updateTable` that
  sends `columnProperties`, not only on the column being changed. The cell format
  is the only thing describing a column: amounts `#,##0.00` (the column mixes
  currencies), EUR columns `#,##0.00 "€"`, dates `yyyy-mm-dd`.
- **Dropdowns are plain cell data validation pointing at `Lists`.** `addTable`
  refuses a dropdown column type that points at a range, so a dropdown is never
  a column type.
- **Charts overlay the cells beneath them rather than reserving them.** Keep data
  away from the Dashboard chart anchors (`A36`, `D36`, `H36`, `H59`, `H80`) and
  the areas they cover -- see "Dashboard charts". A chart's `headerCount` counts
  from the first row of the range, so a range that starts at the data eats its
  first row and names the series after its value.

## The tabs

| Tab | Holds | You type into it |
| --- | --- | --- |
| `Dashboard` | Derived figures only | No |
| `Subscriptions` | One row per committed service | Yes |
| `Ledger` | One row per charge that happened | Yes |
| `Transfers` | One row per transfer between partners | Yes |
| `Funding` | One row per partner: commitment and what is left | Commitment and notes |
| `Earnings – NeonSiege`, `Earnings – IsThisFreedom`, `Earnings – Minesweeper3D` | One row per payout, one tab per project | Yes |
| `Earnings` | All project earnings stacked, derived | No |
| `Lists` | Dropdown sources, shares, FX rates | Rates, occasionally |

A run-rate and a spend total are different questions and need different shapes.
"What do we burn per month" needs one row per service; two rows for the same
service would double the run-rate. "What have we paid" needs one row per charge;
one row for a yearly service would hide the other eleven months. Money coming in
and money moving between partners are further questions, so each has its own tab.

Grey columns are derived (italic in the column lists below). Typing over one
silently breaks that row, and the break is invisible from the Dashboard --
corrections go in the white columns.

**Colour follows the direction of the money: red leaves, green arrives.** Money
out is red; money in (earnings, funding contributed) is green. A figure that goes
negative turns red wherever it sits. The scale is direction, not arithmetic sign:
every cost is stored as a positive number. Gradients go only on columns
comparable across rows -- never on `Amount`, which mixes currencies, and never on
a secondary column such as `Net EUR`.

## Subscriptions

| Col | Field | Notes |
| --- | --- | --- |
| A | Service | Blank in column A excludes the row from the run-rate. |
| B | Project | Dropdown, from `Lists!A`. |
| C | Vendor | |
| D | Category | Dropdown, from `Lists!F`. |
| E | Plan | |
| F | Status | Dropdown. **Only `Active` counts toward the run-rate.** |
| G | Billing cycle | Dropdown. `One-off` contributes nothing -- see below. |
| H | Amount | Gross, in the billing currency -- VAT included. For a usage-billed service, the ceiling -- see below. |
| I | Currency | Dropdown, from `Lists!J`. |
| J | *FX to EUR* | Looked up from `Lists!J:K`; overwrite to pin a row. |
| K | *Amount EUR* | `H * J` |
| L | VAT % | The rate **already included** in the gross Amount. Blank is fine. |
| M | *Net EUR* | `K / (1 + L)`. With L blank, equals the gross. |
| N | *Monthly EUR* | `K / months-in-cycle`, zero unless Status is `Active`. Gross, not net. |
| O | *Annual EUR* | `N * 12` |
| P | Start date | |
| Q | Next renewal | The date to act on before it charges. Blank once the row has an End date. |
| R | End date | The day the subscription stopped. Blank while it runs. |
| S | Paid by | Dropdown, from `Lists!C`. |
| T | Notes | |

**A plan change ends one row and starts another.** The old row keeps its
figures and gets Status `Cancelled`, its End date and a blank Next renewal; the
new plan is a new row whose Start date is the same day. Editing the old row in
place would lose what was committed before the change.

**The run-rate deliberately follows the gross.** What leaves the bank account is
the VAT-inclusive figure, and a run-rate that reported the net would understate
an Italian-VAT subscription by the VAT rate. `VAT %` and `Net EUR` exist because
the two figures answer different questions.

**A blank VAT cell is a claim about the evidence, not a claim of zero.** Fill it
only where a document states the rate. A rate inferred from "Italy charges 22%"
reads later as a figure taken off a document. Where a vendor's document shows no
VAT line, the cell stays blank and Notes say why.

**Watch which side of the VAT line a vendor's published price sits on.** A
vendor that quotes plans excluding VAT -- Anthropic does -- needs the VAT added
into Amount: the Claude Pro list price is 18 € plus 22% VAT per month, or 180 €
plus 22% VAT a year on the annual plan (<https://claude.com/pricing>, viewed from
Italy), so the row carries the VAT-inclusive figure and `VAT %` 22%.

**A usage-billed service records its ceiling, not last month's invoice.** The
run-rate answers *what does this commitment cost if we actually use it*, so the
Amount is the full-usage cost, and Notes say the cell is a ceiling. What was
really paid stays in the Ledger, which is where the two numbers are meant to
disagree. **The same rule covers an introductory price:** once the renewal price
is known, the Amount is the renewal price; both figures stay visible, the
commitment in Subscriptions and what was paid in the Ledger.

`One-off` deliberately has no month count in `Lists!N`. The lookup fails, the
`IFERROR` returns zero, and a one-off purchase cannot inflate the monthly
run-rate. A one-off belongs in the Ledger; it belongs in Subscriptions only if it
renews.

## Ledger

| Col | Field | Notes |
| --- | --- | --- |
| A | Date | Date the money moved. Drives every by-month and by-period total. On a `Pending` row, the date the charge is expected. |
| B | Project | Dropdown, from `Lists!A`. `Pelion` for organisation-wide costs. |
| C | Service | Matches the Subscriptions row by convention, not by formula. |
| D | Vendor | The party paid. For an Asset Store purchase, the asset publisher. |
| E | Category | Dropdown, from `Lists!F`. What the Dashboard's by-category table sums on. |
| F | Description | |
| G | Amount | Gross, in the charged currency. |
| H | Currency | Dropdown. |
| I | *FX to EUR* | Same lookup as Subscriptions; overwrite to pin the rate of the day. |
| J | *Amount EUR* | `G * I` |
| K | VAT % | The rate **already included** in the gross Amount. Blank is fine. |
| L | *Net EUR* | `J / (1 + K)`. With K blank, equals the gross. |
| M | Paid by | Dropdown, from `Lists!C`. Feeds the partner balance. |
| N | Status | Dropdown, from `Lists!R`: `Paid` or `Pending`. |
| O | Period from | The service window the charge covers, not the charge date. |
| P | Period to | Lets an annual charge be attributed across the year it buys. |
| Q | Invoice / receipt | Drive link, Gmail permalink, or blank -- see "Invoices". |
| R | Notes | |

The categories in `Lists!F` come from the studio's budget reports: Art,
Software, Music, SFX, Hardware, QA, Localization, Marketing, Platform Fee,
Legal, Business, Events.

**`Status` does not change any total.** Every Dashboard figure sums `Amount EUR`
over whatever rows exist, so a `Pending` row counts as spend the moment it is
typed. The column is a reminder, not a filter. A pending charge that should stay
out of the spend figures is not entered yet.

**A `0,00 €` row does not mean a free month.** A vendor that postpones invoicing
until accrued costs reach a threshold (Hetzner does) produces zero rows that
mean *nothing was charged yet*, not *nothing was used*. The Ledger is a cash
record and is right either way, but the row's Notes must say which.

Where an invoice states its period more coarsely than a date pair allows, record
the widest range the invoice supports and put its exact wording in Notes. A
guessed day boundary reads later as a recorded fact.

## Transfers

One row per transfer of money from one partner to the other. A transfer settles
the partner balance; it is not a cost and does not enter spend.

| Col | Field | Notes |
| --- | --- | --- |
| A | Date | |
| B | From | Dropdown, from `Lists!C`. |
| C | To | Dropdown, from `Lists!C`. |
| D | Amount | |
| E | Currency | Dropdown. |
| F | *FX to EUR* | Same lookup as everywhere else. |
| G | *Amount EUR* | `D * F` |
| H | Notes | |

`From` equal to `To` is highlighted red, not rejected. Fix the row.

## Funding

One row per partner. It tracks each partner's commitment against what they have
contributed; it says nothing about equity.

| Col | Field | Notes |
| --- | --- | --- |
| A | Partner | |
| B | Committed EUR | The sum the partner has committed to put in from their own pocket. |
| C | *Contributed EUR* | The partner's effective contribution, from `Dashboard!I9:J9`. |
| D | *Remaining EUR* | `B - C` |
| E | Notes | |
| F | Reimbursed to family EUR | Chosko's own tracking, typed by hand. Blank for a partner who does not track it. |
| G | *To reimburse EUR* | `C - F`; blank while F is blank. |

`Contributed EUR` is derived, so the Ledger's `Paid by` and the `Transfers` tab
are the only places a contribution is recorded. A figure typed here as well would
be a second copy that drifts.

**Chosko pays from the family account and reimburses it from Chosko's own.** Every
payment, the Claude share included, leaves the family account, and transfers
received land there, so what the family is owed is the effective contribution
less what has been paid back. `F` and `G` sit after Notes because they concern
Chosko alone; nothing else in the workbook reads them.

## Earnings

One tab per game project -- `Earnings – NeonSiege`, `Earnings – IsThisFreedom`,
`Earnings – Minesweeper3D` -- one row per payout.

| Col | Field | Notes |
| --- | --- | --- |
| A | Date | |
| B | Platform | Dropdown, from `Lists!H`: Steam, Google Play, Google AdMob, Other. |
| C | Description | |
| D | Amount | In the payout currency. |
| E | Currency | Dropdown. |
| F | *FX to EUR* | Same lookup as everywhere else. |
| G | *Amount EUR* | `D * F` |
| H | Received by | Dropdown, from `Lists!C`. |
| I | Notes | |

An earning is paid to one partner and split 50/50 through `Transfers` when the
partners settle it. **Earnings do not enter the partner balance**; they feed the
by-project net and the break-even figures only.

The `Earnings` tab is derived: one formula in `A2` stacks every project tab and
adds a `Project` column, sorted by date.

```
=LET(ns;'Earnings – NeonSiege'!A2:I; itf;'Earnings – IsThisFreedom'!A2:I;
  ms;'Earnings – Minesweeper3D'!A2:I;
  all;VSTACK(HSTACK(ARRAYFORMULA(IF(LEN(INDEX(ns;;1));"NeonSiege";""));ns);
             HSTACK(ARRAYFORMULA(IF(LEN(INDEX(itf;;1));"IsThisFreedom";""));itf);
             HSTACK(ARRAYFORMULA(IF(LEN(INDEX(ms;;1));"Minesweeper3D";""));ms));
  IFERROR(SORT(FILTER(all;INDEX(all;;2)<>"");2;TRUE);""))
```

**Adding a project:**

1. Add it to `Lists!A` above `Pelion`, which stays the last project.
2. Duplicate an earnings tab, rename it and its table
   (`Earnings<Project>Table`), and add one name to the `LET` and one `HSTACK`
   line.
3. Give the Dashboard's by-project block one more row before `Total`: each row
   reads its name from `Lists!A` by position, so the rows follow the list
   order. Extend the `Total` sums, the conditional-format ranges on columns
   `C:F` and the by-project chart's ranges to match. Row 19 is the only free
   row before the by-category block, so the next project after it needs an
   `insertDimension`, which moves every block and chart anchor below.

## Lists

| Col | Holds |
| --- | --- |
| A | Projects |
| C | Partners |
| D | Share of spend, per partner -- 50/50, the basis of the fair share |
| F | Expense categories |
| H | Earning platforms |
| J, K | Currency and its rate to EUR |
| M, N | Billing cycle and its months |
| P | Subscription status |
| R | Ledger status |

## Dashboard

Derived on every read; nothing here is stored.

| Block | Range | Source |
| --- | --- | --- |
| Headline | `B4:B11` | Monthly run-rate, annual run-rate, committed for the rest of this year, spent all time / this year / last 30 days, spent net of VAT, earned. |
| By project | `A13:F18` | Run-rate, spent, earnings, net, to break even, and a total row. |
| By category | `A20:D33` | `SUMIF` over `Subscriptions!D` and `Ledger!E`. |
| Partner balance | `H5:J11` | See below. |
| Fund | `H14:K17`, runway `I18` | Committed, contributed and remaining per partner, and the total; runway is remaining over the monthly run-rate, in months. |
| By month, last 12 | `H20:L33` | Spent, net of VAT, earnings, and the monthly run-rate repeated on every row as the charts' reference line. |
| Charts | `A36:L56`, `H59:L97` | See "Dashboard charts" below. |
| Remaining commitment by month | `A58:E167` | Chart helper table, see below. |
| How-to notes | `M2:M14` | |

**Partner balance** has columns `I` (Chosko) and `J` (Pelle):

| Row | Figure | Derivation |
| --- | --- | --- |
| 6 | Paid | `Ledger!J` where `Paid by` is the partner |
| 7 | Transfers sent | `Transfers!G` where `From` is the partner |
| 8 | Transfers received | `Transfers!G` where `To` is the partner |
| 9 | Effective contribution | paid + sent - received |
| 10 | Fair share | share (`Lists!D`) x total spend |
| 11 | Difference | effective contribution - fair share |

`H12` reads *"X owes Y n €"* or *Balanced*. The amount is half the gap between
the two effective contributions, so a single transfer of it balances the books.

### Dashboard charts

The charts mirror the Second Run workbook's Dashboard, so the two read alike:
red for money out, green for money in, the same chart types and sizes.

| Anchor | Chart | Data |
| --- | --- | --- |
| `A36` | Spent and earned per month vs run-rate: red columns for spend, green for earnings, a dashed red run-rate line | `H20:L32` |
| `D36` (+70 px) | Spent to date by category, doughnut | `A21:A32`, `C21:C32` |
| `H36` (+175 px) | Monthly run-rate by category, doughnut | `A21:A32`, `B21:B32` |
| `H59` | Remaining commitment, actual then projected | `A59:E167` |
| `H80` | Spent and earned to date by project: red and green columns | `A13:A17`, `C13:D17` |

**Remaining commitment** is the funding-model counterpart of a fund balance:
what is left of each partner's commitment, month by month. The helper table at
`A58:E167` starts at the month of the earliest Ledger date and runs up to 108
months, ending at the first month whose projected total is zero. Every row after
it returns blank, which is what ends the chart's axis there, so the chart keeps
fitting the projection as the run-rate changes. Columns `D` and `E` hold one
partner each, named from `I5:J5`:

- up to the current month, *actual*: committed (`Funding!B`) less the effective
  contribution to that month end -- Ledger `Paid by` spend plus transfers sent,
  less transfers received, each filtered on its date;
- after it, *projected*: the partner's remaining (`Funding!D`) less the monthly
  run-rate times the partner's share (`Lists!D`) per month ahead, floored at zero.

`B` (*Total (actual)*) and `C` (*Total (projected)*) sum the two partners and
meet at the current month: a solid green line that stops there, then a dashed
grey one. The per-partner lines are drawn whole, without the actual/projected
split, because the commitments are individual and one partner can run out before
the other; the total carries the split, so four lines stay readable where six
would not. The projection draws down at the full run-rate and keeps today's
split; it does not model one partner covering the other once a commitment is
exhausted.

Anything added to the Dashboard stays clear of `A36:L56` and `H59:L97`. A new
chart's range starts at its table's header row.

Run-rate and spend will not agree, and should not. Run-rate is forward-looking
and assumes today's commitments hold; spend is what happened. A yearly charge
makes them diverge sharply in the month it lands.

## Claude subscriptions

Chosko's Claude Max 20x plan is billed to Chosko and tracked in the Second Run
workbook, a separate project's sheet
(id `1h5iHbqxOt2csxSPPqCipSBRg9qcoiOwlaiBlTGQ4mms`, documented in
`E:\projects\job-hunter-cli\docs\running-costs.md`). Pelion Games covers as much
of it as Pelle's own Claude plan costs:

- one `Subscriptions` row for the Pelion share, with the billing cycle and list
  price of Pelle's plan, and one `Ledger` row per billing period, both with
  Project `Pelion` and Paid by `Chosko`;
- the Second Run workbook nets that amount out of the Max charges it records.

**The share's rows are the only record of it in this workbook.** The Max itself
is billed to Chosko monthly and never appears here; the netting in Second Run
keeps the two workbooks from counting the share twice.

Pelle's own Claude plan (Claude Max 5x, 90 € plus 22% VAT a month at the Italian
list price) is a separate `Pelion` subscription paid by Pelle, one `Ledger` row
per invoice.

**The share follows Pelle's plan.** When Pelle's plan changes, the share's
`Subscriptions` row changes on the same day the same way, and a credit for unused
time on Pelle's invoice is mirrored on the share's `Ledger` row, so the two
partners' Claude spend stays equal.

## Invoices

Documents live in the `Invoices` folder beside the sheet. The `Invoice /
receipt` column links whichever exists: the vendor's PDF as issued, or a Doc
transcribing the receipt email when the email is the only evidence. A blank cell
is a legitimate value -- the row's Notes then say why.

**Name the file `Vendor_YYYY-MM-DD_identifier.pdf`**, where Vendor is the
**issuer of the document**. An Asset Store purchase is invoiced by Unity, so the
file is `Unity_...` even when the Ledger's Vendor is the asset publisher. Where
the vendor's own filename already carries all three parts, keep it.

**Getting a PDF from Gmail into Drive.** The Gmail connector exposes an
attachment's filename and id but not its bytes, and the service account cannot
create files, so use Gmail's **Add to Drive** from the message in the browser,
then move and rename the file with the Drive connector's `update_file` -- it
changes a file's parent and name, which is the writing that connector allows.

## Workflow

**Upkeep is manual and belongs to the partners.** They add rows from statements
and invoices. Nothing polls, nothing scrapes, nothing runs on a schedule -- an
expense record that quietly drifts is worse than one that is obviously stale.

Claude's role is bounded on purpose:

| Task | How |
| --- | --- |
| Read the sheet, answer a question about spend | Drive connector, `read_file_content`. No browser. |
| Add a row on request, fix one formula | Sheets API as the service account, surgically. |
| Change the structure | Sheets API `batchUpdate`, in place, then update this document in the same change -- in all three game repos. |

A structural change is made *on the live workbook*. Insert or delete columns with
`insertDimension` / `deleteDimension` so Sheets carries every dependent formula
with them; rewriting a range by hand is what silently breaks the Dashboard.

## Constraints

- **No figures in this repository.** The sheet is the only place an amount
  lives. This document names services, vendors, categories and billing cycles --
  never amounts of actual charges, never their dates. The one exception is a
  vendor's published list price, cited as a pricing fact.
- **FX rates are manual**, in `Lists!J:K`. A live rate restates history every
  time it moves, and an expense record must not do that.
- **A missing FX rate fails silently.** The lookup on a blank rate cell returns
  zero rather than an error, so a foreign-currency row computes `Amount EUR` of
  zero and contributes nothing, with nothing visibly wrong on the row. Fill the
  rate for a currency *before* entering the first amount in it.
- **Base currency is EUR.**
- **The workbook has no backup and no generator.** Take a copy before a
  structural change large enough to be worth fearing.
