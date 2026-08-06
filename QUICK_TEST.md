# Creative PoC — Quick Test (Google Form → Canva → Basecamp)

Thin proof of architecture. Not a production workflow system.

**Expected result:** Submit the Google Form and within seconds/minutes a new editable Canva design is generated and a Basecamp message appears linking to that design.

---

## 1. Required environment variables

Copy from `.env.example` into `.env.local` (never commit secrets):

```bash
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
GOOGLE_FORM_WEBHOOK_SECRET=replace-with-long-random-string

# Canva Connect
CANVA_CLIENT_ID=
CANVA_CLIENT_SECRET=
CANVA_REDIRECT_URI=http://localhost:3000/api/canva/callback
CANVA_BRAND_TEMPLATE_ID=
CANVA_ACCESS_TOKEN=          # optional if using /api/canva/connect
CANVA_REFRESH_TOKEN=         # optional if using /api/canva/connect
# CREDENTIAL_ENCRYPTION_KEY= # recommended for local encrypted token store

# Basecamp
BASECAMP_ACCESS_TOKEN=
BASECAMP_ACCOUNT_ID=
BASECAMP_MESSAGE_BOARD_ID=
BASECAMP_USER_AGENT=SJJCC-Creative-PoC (you@example.com)
```

---

## 2. Canva developer portal configuration

1. Open [Canva Developer Portal](https://www.canva.com/developers/integrations/) → your Connect API integration.
2. Copy **Client ID** and generate/save **Client secret** → `CANVA_CLIENT_ID` / `CANVA_CLIENT_SECRET`.
3. Add Authentication redirect URL(s) matching `CANVA_REDIRECT_URI`.
4. Enable scopes (see §4).

---

## 3. Canva redirect URL

Local:

```text
http://localhost:3000/api/canva/callback
```

Deployed (example):

```text
https://YOUR_HOST/api/canva/callback
```

Must match Developer Portal redirect URLs exactly.

---

## 4. Canva scopes

Minimum for this PoC:

```text
asset:read asset:write
brandtemplate:content:read brandtemplate:meta:read
design:content:read design:content:write design:meta:read
profile:read
```

Request the same scopes during OAuth (`/api/canva/connect`).

---

## 5. Obtain the Brand Template ID

1. Authenticate (env tokens **or** visit `/api/canva/connect`).
2. `GET /api/test/canva/templates`
3. Copy the desired template `id` → `CANVA_BRAND_TEMPLATE_ID`.

---

## 6. Inspect the template dataset

```bash
curl -s "$APP/api/test/canva/template-dataset" | jq
```

Use the returned field names/types. Update `config/form-to-canva.ts` so Google Form question titles map to **real** Canva dataset keys. Do not guess (`HEADLINE`, etc. are placeholders).

---

## 7. Google Apps Script installation

See `docs/google-form-trigger.gs` header comments:

1. Open the Form’s response Sheet  
2. Extensions → Apps Script  
3. Paste the script  
4. Set Script Properties: `APP_HOST`, `GOOGLE_FORM_WEBHOOK_SECRET`  
5. Run `setupTrigger()`  
6. Authorize  
7. Submit a test Form response  

---

## 8. Basecamp configuration

1. Register/use an integration at [launchpad.37signals.com/integrations](https://launchpad.37signals.com/integrations) (OAuth 2.0).
2. Obtain `BASECAMP_ACCESS_TOKEN`.
3. Set `BASECAMP_ACCOUNT_ID` (from Basecamp account URL / authorization.json).
4. Set `BASECAMP_MESSAGE_BOARD_ID` for the target message board.
5. Set `BASECAMP_USER_AGENT` to identify the integration + contact email.

If `BASECAMP_ACCESS_TOKEN` is missing, the API returns `BASECAMP_AUTH_REQUIRED` — it will **not** fake success.

Flat create route used:

```text
POST https://3.basecampapi.com/{ACCOUNT_ID}/message_boards/{MESSAGE_BOARD_ID}/messages.json
```

---

## 9. Test commands

Start the app:

```bash
pnpm dev
```

Export helpers:

```bash
export APP=http://localhost:3000
export SECRET=your-GOOGLE_FORM_WEBHOOK_SECRET
```

### Ordered verification (stop on first failure)

**TEST 1 — Canva authentication** (also covered by templates route):

```bash
# If no tokens yet:
open "$APP/api/canva/connect"
# Then:
curl -s "$APP/api/test/canva/templates" | jq '.authenticated, .user'
```

**TEST 2 — Template visibility**

```bash
curl -s "$APP/api/test/canva/templates" | jq '.templates'
```

**TEST 3 — Dataset**

```bash
curl -s "$APP/api/test/canva/template-dataset" | jq '.datasetFields, .mappingIssues'
```

**TEST 4 — Autofill** (edit `data` keys after TEST 3):

```bash
curl -s -X POST "$APP/api/test/canva/autofill" \
  -H 'Content-Type: application/json' \
  -d '{"title":"TEST Creative Draft","data":{"YOUR_FIELD":"test value"}}' | jq
```

**STOP and record:** template ID, available fields, autofill job ID, design ID, Canva URL.

**TEST 5 — Basecamp auth**

```bash
curl -s "$APP/api/test/basecamp" | jq
```

**TEST 6 — Basecamp TEST message**

```bash
curl -s -X POST "$APP/api/test/basecamp" \
  -H 'Content-Type: application/json' \
  -d '{"canvaDesignUrl":"PASTE_CANVA_URL","promotionName":"TEST promotion"}' | jq
```

**TEST 7 — Webhook simulation**

```bash
curl -s -X POST "$APP/api/form-submit" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $SECRET" \
  -d '{
    "source":"google_form",
    "submittedAt":"2026-08-06T12:00:00.000Z",
    "fields":{
      "What is the name of the promotion?":["Summer Splash"],
      "Promotion description":["Family open house"],
      "Event date":["2026-08-20"],
      "Event time":["10:00 AM"],
      "Location":["Main Lobby"],
      "Registration URL":["https://example.com/register"]
    }
  }' | jq
```

**TEST 8 — Real Google Form** — submit one response; confirm Apps Script → endpoint → Canva → Basecamp.

---

## 10. Expected result

> I submit the Google Form and within seconds/minutes a new editable Canva design is generated and a Basecamp message appears linking to that design.

---

## Token persistence warning (Vercel)

Local OAuth tokens are stored encrypted in `.data/canva-tokens.enc` (gitignored).

**On Vercel, the local filesystem is ephemeral and not shared across instances.** Do not rely on it for production OAuth token persistence — use an external store (DB / KV / secrets). Env-provided `CANVA_ACCESS_TOKEN` + `CANVA_REFRESH_TOKEN` work for short tests if you refresh them manually when expired.

---

## Field mapping file

`config/form-to-canva.ts` — edit after inspecting the live dataset. Unmapped Form fields are ignored. Unknown Canva field names fail clearly.
