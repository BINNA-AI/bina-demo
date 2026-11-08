# BINA API v1

One contract for the Worker, the Admin and Customer prototypes (`shared/bina-repo.js`, `shared/bina-providers.js`),
the future Flutter app and the tests. Every business rule comes from `shared/bina-core.js` (BinaCore); the Worker
adds transport, auth and persistence only. Implementation: `worker/src/`. Tests: `worker/test/` (68 passing).

## 1. Conventions

- **Base path** `/api/v1`. JSON is UTF-8. Timestamps are ISO-8601 UTC.
- **Envelope** on every JSON response: `{ "ok": bool, "data": any|null, "error": ApiError|null, "request_id": "req_..." }`
  (`BinaCore.envelope`). `data` is `null` when `ok` is false. The same id is in the `X-Request-Id` header.
- **Errors** (`BinaCore.ERROR_CODES`, one HTTP status each):

| code | HTTP | meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | malformed JSON, wrong content type, unknown/read-only field, invalid value or ID |
| `UNAUTHORIZED` | 401 | missing/invalid Firebase token or Access JWT (`details.reason`: `missing`, `expired`, `claim:aud`, ...) |
| `FORBIDDEN` | 403 | authenticated but not allowed (not an admin, role, disabled account, origin not allowed) |
| `NOT_FOUND` | 404 | unknown resource or endpoint (405 + `Allow` header for a wrong method) |
| `CONFLICT` | 409 | stale `version`/`If-Match`, duplicate ID, dependencies, concurrent write |
| `IMPORT_CONFLICT` | 409 | import cannot commit: unresolved rows, catalogue changed since preview, expired preview |
| `MEDIA_NOT_READY` | 409 | the meaning's media is not usable / file not stored |
| `PAYLOAD_TOO_LARGE` | 413 | body or file over the route limit; resolve text over 500 chars |
| `UNSUPPORTED_MEANING` | 422 | provider returned an unknown (`invented:true`) or ineligible meaning |
| `RATE_LIMITED` | 429 | too many requests (`Retry-After`) |
| `INTERNAL` | 500 | unexpected error (no internals in the message) |
| `OPENAI_UNAVAILABLE` | 503 | OpenAI timeout, error, malformed output, not configured; mock mode with audio (`details.needs_text`) |

- **Auth types.** `public`; `customer` = `Authorization: Bearer <Firebase ID token>`; `admin` = Cloudflare Access
  (`Cf-Access-Jwt-Assertion`, injected by Access) + a row in `admins` (roles: `viewer` read, `content_reviewer`
  write, `project_lead` write + delete). Local `wrangler dev` only: customers `Bearer mock.<uid>`, admins act as
  `DEV_ADMIN_EMAIL` (see docs/SECURITY.md).
- **Optimistic concurrency:** send the item's `version` in the body or `If-Match: "<version>"`; a mismatch is 409
  with `{expected_version, current_version}`. Single-item responses carry `ETag: "<version>"`.
- **Catalogue version:** `catalogue_version` bumps whenever `BinaCore.catalogueFingerprint` of meanings, profiles
  or assets changes. Customer catalogues: `ETag: "cv-<n>"`; admin catalogue: `ETag: "v<n>"`; both answer 304 to
  `If-None-Match`.
- **Media URLs** are root-relative (`/api/v1/media/AVA_SALAM_001?v=1`); resolve them against the API origin and
  send the same credentials (bearer token for customers).
- **CORS:** exact origins from `ALLOWED_ORIGINS`; non-GET requests from other browser origins are refused (403).
- **Limits:** JSON 64 KB (`MAX_JSON_BYTES`), resolve audio 5 MB (`MAX_AUDIO_BYTES`, OpenAI accepts 25 MB),
  media upload 25 MB (`BinaCore.LIMITS.video_max_bytes`), import preview 8 MB (`MAX_IMPORT_BYTES`).

## 2. Canonical objects

**CoreMeaning**
```json
{ "meaning_id": "SALAM", "canonical_ar": "السلام عليكم", "canonical_en": "Peace be upon you", "category": "greeting",
  "enabled": true, "lifecycle": "active", "demo": true, "version": 1,
  "created_at": "2026-11-08T00:00:00Z", "updated_at": "2026-11-08T00:00:00Z", "updated_by": null }
```
`meaning_id` `^[A-Z][A-Z0-9_]{1,47}$`; `category` in `BinaCore.CATEGORIES`; `lifecycle` `draft|active|archived`.
Editable: `canonical_ar, canonical_en, category, enabled, lifecycle`.

**Flow1Profile** (Flow1Config)
```json
{ "meaning_id": "SALAM", "cv_class": "SALAM", "ar_audio_asset_id": "AUD_SALAM_AR_001", "en_audio_asset_id": "AUD_SALAM_EN_001",
  "enabled": true, "review_status": "approved", "version": 1, "created_at": "...", "updated_at": "...", "updated_by": null }
```
Editable: `cv_class, ar_audio_asset_id, en_audio_asset_id, enabled, review_status`. CV class unique (case-insensitive).

**Flow2Profile** (Flow2Config)
```json
{ "meaning_id": "SALAM", "semantic_hints": [{ "text": "سلام", "lang": "ar" }, { "text": "salam", "lang": "ms" }],
  "avatar_asset_id": "AVA_SALAM_001", "enabled": true, "review_status": "approved", "rights_status": "demo_only",
  "version": 1, "created_at": "...", "updated_at": "...", "updated_by": null }
```
Editable: `semantic_hints` (array of `{text, lang}` or the text form `"سلام | salam@ms"`), `avatar_asset_id, enabled,
review_status, rights_status`. Max 30 hints of 60 chars; alias collisions refused.

**MediaAsset** (admin only; provenance fields are kept as stored)
```json
{ "asset_id": "AVA_SALAM_001", "asset_type": "avatar_video", "language": null, "locale": null, "filename": "SALAM_avatar.mp4",
  "object_key": "media/AVA_SALAM_001.mp4", "mime_type": "video/mp4", "bytes": 164627, "duration_ms": 4280, "width": 960, "height": 540,
  "version": 1, "source": "TALKBIM_COLLAB_REFERENCE", "rights_status": "demo_only", "review_status": "approved", "enabled": true,
  "lifecycle": "active", "replaces_asset_id": null, "demo_asset": true, "production_approved": false, "mock": false,
  "missing_file": false, "created_at": "...", "updated_at": "...", "created_by": null, "updated_by": null,
  "codec": "h264", "fps": 25, "flags": ["DEMO_ASSET", "TALKBIM_COLLAB_REFERENCE", "PRODUCTION_APPROVED_FALSE"],
  "sign_language": "Saudi Sign Language (reference)", "source_file": "...", "source_label_ar": "السلام عليكم",
  "source_label_en": "As-salamu alaykum", "source_sha256": "6e2e...", "note": "..." }
```
A staged upload also has `"pending_for": {"meaning_id": "SALAM", "role": "FLOW2_AVATAR"}` until approved.
`lifecycle` `active|superseded|archived`; roles `FLOW1_AR_AUDIO | FLOW1_EN_AUDIO | FLOW2_AVATAR`.

**ResolveResult**
```json
{ "transcript": "السلام عليكم", "language": "ar", "provider": "MOCK", "simulated": true, "supported": true, "meaning_id": "SALAM",
  "display": { "ar": "السلام عليكم", "en": "Peace be upon you" },
  "avatar": { "asset_id": "AVA_SALAM_001", "url": "/api/v1/media/AVA_SALAM_001?v=1", "mime_type": "video/mp4", "version": 1, "mock": false, "demo_asset": true } }
```
NO_MATCH: `{ "transcript": "Where is the pharmacy?", "language": "en", "provider": "MOCK", "simulated": true,
"supported": false, "meaning_id": null, "reason": "no_match" }` (`reason`: `no_match | ambiguous | refused | empty |
no_catalogue`). `provider` is `MOCK` or `OPENAI`; `simulated` is `true` only for MOCK.

**Flow1Catalogue** (`BinaCore.buildFlow1Catalogue`): `{ "catalogue_version": 1, "items": [ { "meaning_id": "SALAM",
"cv_class": "SALAM", "text": { "ar": "...", "en": "..." }, "audio": { "ar": { "asset_id": "AUD_SALAM_AR_001",
"url": "/api/v1/media/AUD_SALAM_AR_001?v=1", "mime_type": "audio/mpeg", "mock": true }, "en": {...} | null },
"readiness": "ready" | "partial", "version": 1 } ] }`. Look up by CV class with `BinaCore.lookupFlow1`.

**CatalogueManifest** (`BinaCore.buildManifest`)
```json
{ "catalogue_version": 1, "updated_at": "2026-11-08T00:00:00Z", "counts": { "meanings": 21, "flow1_available": 6, "flow2_available": 15 },
  "items": [{ "meaning_id": "SALAM", "version": 1, "flow1_version": 1, "flow2_version": 1, "updated_at": "..." }] }
```

**ImportPreview** (`BinaCore.buildImportPreview`, wrapped)
```json
{ "batch_id": "IMP_DQVGVK5AG9JC9WAC", "filename": "BINA_Content_Catalogue.xlsx", "expires_at": "...", "catalogue_version": 1,
  "can_commit": true, "counts": { "apply": 1, "overwrite": 0, "skip": 0, "needs_resolution": 0, "blocked": 0 },
  "preview": { "summary": { "NEW": 1, "UPDATED": 0, "UNCHANGED": 0, "WARNING": 0, "CONFLICT": 0, "ERROR": 0 },
    "items": [{ "id": "Core_Meanings|TEA|2", "sheet": "Core_Meanings", "key": "TEA", "row": 2, "status": "NEW",
      "decision": "apply", "overridable": false, "issues": [], "changes": [], "values": {...}, "next": {...} }],
    "sheets": {...}, "missingSheets": [...], "unknownSheets": [], "blocking": [], "catalogue_version": 1 } }
```

**Feedback**
```json
{ "id": "FB_GTHAZL96SJ4S", "meaning_id": "SALAM", "flow": "flow2", "asset_id": "AVA_SALAM_001", "reason": "avatar_quality",
  "note": "Hands are cut off.", "input_text": null, "user_uid": "<firebase uid>", "status": "new", "assignee": null,
  "admin_note": null, "demo": false, "version": 1, "created_at": "...", "updated_at": "...", "updated_by": null }
```
`reason`: `wrong_meaning | wrong_ar_audio | wrong_en_audio | avatar_quality | avatar_wrong_sign | too_slow | other`;
`status`: `new | in_progress | resolved | dismissed`. `note` is the customer's text and is never overwritten.

**UnsupportedRequest**: `{ id, text, language, source, count, status (new|triaged|resolved|dismissed), last_reason,
linked_meaning_id, note, demo, version, first_seen_at, last_seen_at, updated_at, updated_by }`.

**UserProfile**: `{ uid, email, email_verified, display_name, provider, disabled, created_at, last_sign_in_at,
updated_at, profile: { preferred_language: "ar"|"en", paired_watch_id }, version }` (no credentials: Firebase owns them).

**AuditEntry**: `{ id, at, actor, action, object_type, object_id, before, after, note, request_id }`.

**ApiError**
```json
{ "ok": false, "data": null, "request_id": "req_98c7b7a35d2b48838bf276e1",
  "error": { "code": "UNSUPPORTED_MEANING", "message": "Provider returned an unknown Meaning ID",
    "details": { "meaning_id": "COFFEE", "invented": true, "provider": "OPENAI", "simulated": false, "transcript": "أبغى قهوة", "language": "ar" } } }
```

## 3. Routes

| Method | Path | Auth | Request | Response `data` | Notable errors |
|---|---|---|---|---|---|
| GET | `/health` | public | - | `{service:"bina-api", version, core_version, d1, r2, openai_mode, openai_configured, firebase_project_set, access_configured, auth_dev_mode, rate_limit_binding, status:{openai, customer_auth, admin_auth, d1, r2}, time}` (no secret values) | - |
| GET | `/catalogue/manifest` | customer | `If-None-Match` | CatalogueManifest (from `catalogue_cache`) | 401 |
| GET | `/flow1/catalogue` | customer | `If-None-Match` | Flow1Catalogue | 401 |
| POST | `/flow2/resolve` | customer | JSON `{text}` (1 to 500 chars) or multipart `audio` (one file, OpenAI format, <= `MAX_AUDIO_BYTES`) | ResolveResult (NO_MATCH is `ok:true, supported:false` and is logged to unsupported requests) | 400, 413, 422, 409 `MEDIA_NOT_READY`, 429, 503 |
| POST | `/feedback` | customer | `{flow, reason, meaning_id?, asset_id?, note? (<=500), input_text? (<=200)}` | Feedback (201; `user_uid` from the token) | 400, 429 |
| GET | `/me` | customer | - | UserProfile (created on first call) | 401, 403 |
| PATCH | `/me` | customer | `{display_name?, preferred_language?, paired_watch_id?, version?}` | UserProfile | 400, 409 (stale / watch owned by another account) |
| GET/HEAD | `/media/:asset_id` | customer or admin | `Range` | the file (200 / 206 / 416), `Content-Type` from the asset row | 404 (not public), 409 `MEDIA_NOT_READY` |
| GET | `/admin/catalogue` | admin read | `If-None-Match: "v<n>"` | `{meta:{environment, catalogue_version, fingerprint, updated_at}, meanings, flow1_profiles, flow2_profiles, assets}` (BinaCore state) | 304 |
| GET | `/admin/meanings` | admin read | `?lifecycle=&category=` | `{catalogue_version, count, items: CoreMeaning[]}` | |
| POST | `/admin/meanings` | admin write | `{meaning_id, canonical_ar, canonical_en, category?, enabled?, lifecycle?}` | CoreMeaning (201) | 400, 409 duplicate |
| GET | `/admin/meanings/:id` | admin read | - | `{meaning, flow1_profile, flow2_profile, readiness:{flow1, flow2}, dependencies, catalogue_version}` | 400, 404 |
| PATCH | `/admin/meanings/:id` | admin write | editable fields + `version?` | CoreMeaning | 400, 404, 409 |
| DELETE | `/admin/meanings/:id` | project_lead | `{version?}` | `{deleted}` | 409 (profiles, feedback, unsupported links: archive instead) |
| POST | `/admin/meanings/:id/archive` and `/restore` | admin write | `{version?}` | CoreMeaning | 404, 409 |
| PATCH | `/admin/meanings/:id/flow1` and `/flow2` | admin write | editable profile fields + `version?` (creates the profile, disabled + pending, when missing: 201) | Flow1Profile / Flow2Profile | 400 (CV class, alias collision, asset type), 404, 409 |
| GET | `/admin/flow1`, `/admin/flow2` | admin read | - | `{catalogue_version, count, items, readiness: {meaning_id: readiness}}` | |
| GET | `/admin/assets` | admin read | `?review_status=&asset_type=&lifecycle=` | `{catalogue_version, count, items: MediaAsset[], owners: {asset_id: {meaning_id, role}}}` | |
| POST | `/admin/media` | admin write | multipart `meaning_id, role, file, duration_ms?, width?, height?` | `{asset (pending), replaces_asset_id, catalogue_version}` (201) | 400 (type, magic bytes, MIME, name), 404, 413, 409 `MEDIA_NOT_READY` |
| POST | `/admin/assets/:id/approve` | admin write | `{version?}` | MediaAsset (old version becomes `superseded`; the profile now points to it) | 404, 409 |
| POST | `/admin/assets/:id/reject` | admin write | `{reason?, version?}` | MediaAsset (`rejected`, `archived`) | 409 (live file) |
| POST | `/admin/assets/:id/archive` | admin write | `{version?}` | MediaAsset | 409 (still linked) |
| POST | `/admin/profiles/:id/unlink` | admin write | `{role, version?}` | Flow1Profile / Flow2Profile | 400, 404 |
| GET | `/admin/coverage` | admin read | - | `{catalogue_version, environment, summary: BinaCore.summary, rows: BinaCore.coverage}` | |
| GET | `/admin/review-queue` | admin read | - | `{catalogue_version, count, items: BinaCore.reviewQueue}` | |
| POST | `/admin/import/preview` | admin write | `{filename, sheets: {SheetName: [[cell, ...], ...]}}` (raw grids read in the browser) | ImportPreview (201; batch stored, expires after `IMPORT_TTL_MINUTES`, default 30) | 400, 413 |
| POST | `/admin/import/commit` | admin write | `{batch_id, decisions?: {itemId: apply|overwrite|skip|needs_resolution|blocked}, edits?: [{sheet, row, field, value}]}` | `{committed:true, batch_id, counts, catalogue_version, changes}` | 400, 404, 409 `IMPORT_CONFLICT` (`details.reason`: `unresolved`, `catalogue_changed`, `expired`), 409 already committed |
| GET | `/admin/unsupported` | admin read | `?status=&limit=&offset=` | `{total, limit, offset, items: UnsupportedRequest[]}` | 400 |
| PATCH | `/admin/unsupported/:id` | admin write | `{status?, linked_meaning_id?, note?, version?}` | UnsupportedRequest (audited) | 400, 404, 409 |
| GET | `/admin/feedback` | admin read | `?status=&flow=&limit=&offset=` | `{total, limit, offset, items: Feedback[]}` | 400 |
| PATCH | `/admin/feedback/:id` | admin write | `{status?, assignee?, admin_note? or note?, version?}` | Feedback (audited) | 400, 404, 409 |
| GET | `/admin/audit` | admin read | `?object_type=&object_id=&before=&limit=` | `{limit, items: AuditEntry[] (newest first), next_before}` | |
| POST | `/admin/resolve-test` | admin write | as `/flow2/resolve` | ResolveResult + `trace {mode, simulated, models, catalogue_size, enum_constrained, normalized, provider_output, candidates, validation, timing_ms}`; on rejection the ApiError carries `details.trace`. Never logged as unsupported | as resolve |

## 4. Flow 2 pipeline

text or audio -> (audio) OpenAI transcription -> OpenAI mapping with `BinaCore.buildOpenAICatalogue` +
`openAIResolveSchema` + `OPENAI_RESOLVE_INSTRUCTIONS` (or `BinaCore.mockResolve` in mock mode) ->
**`BinaCore.validateResolve`** (meaning exists, active, Flow 2 enabled + approved, rights, avatar usable) -> avatar.
The mode is `OPENAI_MODE=mock|live`; live never falls back to mock. Details: docs/OPENAI_NOTES.md.
