# Monday sales check

A small internal sales portal, built as a sample: one weekly figure per market, the partner file that completes it,
and two simulated roles that the server enforces on every request.

- Product lines and formats come from a public brand catalog. **Every account, quantity, invoice and file is fictional.**
- The page makes no AI call. The two or three answers it shows were prepared offline; their text only picks claim
  kinds and fact ids, and `src/core.js` writes every number, name and date (`validateAnswer` rejects anything else).

## What the code does

- `src/core.js`: reads partner workbooks, a retailer till export and a market panel extract; matches each line to the
  catalog on line + strain + format (a bare strain name is held, never guessed); skips re-sent invoices; nets credit
  notes; drops customer columns from till exports before storage; keeps two tickets at 01:30 on the fall-back night;
  decides whether a week is pending, provisional or ready from the coverage each file declares.
- Roles: `scopedDataset` is the only door to data. Files outside a role's markets are never read, so the state view,
  account detail, row lookup, prepared answers and CSV export cannot return them.
- `worker.js`: serves the page and a read-only API on Cloudflare Workers.
- `tools/make_data.py`: generates `src/data.js` and the sample workbook from one set of synthetic rows.

## Tests

```
node --test tests/*.test.js
```

GitHub Actions runs the same command on every push. Deployment is done from a separate machine; this repository
holds no deploy key or other secret.
