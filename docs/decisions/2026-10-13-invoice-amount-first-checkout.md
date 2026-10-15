# Owner decision: invoice amount before payment methods

The owner approved the proposed flow: “Yep im happy with thst, please ensure you
implement it like that.” This approves the invoice customer-flow change, not a
deployment or the R3 phase exit.

Show **Pay the full bill** as the main action and **Split the bill** as the
secondary action. Let the customer enter an optional receipt email before
preparing payment. Prepare one session for the chosen amount and share it across
card, Apple Pay and Google Pay. Do not prepare a full-amount session on page load.
Once a provider attempt exists, keep its amount and receipt email fixed.

For split invoices, atomically reserve a specific free share for each payer.
Persist that assignment with the payer's UUID before contacting Windcave.
Concurrent payers can reserve different shares; retries and reloads retain the
same share. Show the server's exact assigned amount before a wallet or card
submission, including any one-cent remainder.

On October 13 the owner reaffirmed that Codex must finish R3 before starting R5.
Claude owns R4. The approved invoice flow remains part of the outstanding R3 work.
