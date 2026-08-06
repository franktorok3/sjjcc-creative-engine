# Transfer notes

This repository (`franktorok3/sjjcc-creative-engine`) is the home for the **Google Form → Canva Brand Template Autofill → Basecamp** proof of concept.

## Status: complete

The PoC was extracted from `franktorok3/New-SJJCC-intake` branch `cursor/google-canva-basecamp-poc-b3c5` (PR #2) into this standalone app. The intake Membership Prospect Hub code was intentionally left behind.

What lives here:

- Next.js App Router webhook + test harness
- Canva Connect OAuth + brand template autofill
- Basecamp Message Board posting
- Google Apps Script form trigger (`docs/google-form-trigger.gs`)
- Field mapping (`config/form-to-canva.ts`) and quick-test docs

## Optional intake cleanup

If the old intake repo/branches still exist:

1. Close (do not merge) intake PR #2
2. Delete branch `cursor/google-canva-basecamp-poc-b3c5`
3. Delete staging branch `export/sjjcc-creative-engine` if present

## Source commit

Initial PoC land: `6564666`  
Vitest ESM fix: `0c5f87d`
