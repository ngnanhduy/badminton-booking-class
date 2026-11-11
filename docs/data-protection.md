# Personal data protection

How the app handles students' personal data, and how that maps to Vietnam's
**Law on Personal Data Protection (Law No. 91/2025/QH15)** and its implementing **Decree
356/2025/ND-CP**, both in force since 1 January 2026.

> This document describes technical and organisational measures. It is not legal advice. Have
> someone familiar with the law review your setup before relying on it, especially the
> impact-assessment and breach-notification duties described below.

## What personal data is processed

| Data | Where | Stored as |
| --- | --- | --- |
| Zalo name | `bookings.name_enc` | AES-256-GCM ciphertext |
| Phone number or email | `bookings.contact_enc` | AES-256-GCM ciphertext |
| Make-up session note (free text) | `bookings.makeup_enc` | AES-256-GCM ciphertext |
| Lookup indexes | `bookings.contact_hash`, `bookings.name_hash` | HMAC-SHA256 (one-way, keyed) |
| Chosen slots, week | `bookings.slot1..3`, `week_label` | Plain text (not personal data on their own) |
| Consent record | `bookings.consent_version`, `consent_at` | Plain text |
| Admin email and name (staff only) | `users.email_enc`, `users.name_enc` | AES-256-GCM ciphertext |
| Admin email lookup index | `users.email_hash` | HMAC-SHA256 (one-way, keyed) |
| Admin password | `users.password_hash` | scrypt hash (N=2^15, r=8, random salt) |
| Role, creation and last sign-in time | `users.role`, `created_at`, `last_login_at` | Plain text |
| Admin sessions | `sessions.id` | SHA-256 of the cookie token (the token itself is never stored) |

Students don't have accounts. No sensitive personal data is collected. The browser stores the
Zalo name (to pre-fill it next time) and the chosen language and theme. Signed-in admins also
have a strictly necessary session cookie. There are no tracking cookies.

## Measures and how they map to the law

| Requirement | How the app meets it |
| --- | --- |
| **Consent** must be voluntary, informed, specific to a purpose, and expressed by an action. Silence does not count. | The consent checkbox is unticked by default and states the purpose, the data and the retention period. It links to the full notice at `/quyen-rieng-tu`. The API rejects any booking without `consent: true`, and stores the consent time and notice version with each booking. Editing a booking requires re-confirming consent. |
| **Notice** to the data subject | `/quyen-rieng-tu` covers the controller, data collected, purpose, legal basis, security, retention, sharing and rights. |
| **Purpose limitation and minimisation** | Only name, contact and the optional note are collected, and only for scheduling and identity verification. |
| **Rights** of access, correction, deletion and withdrawal of consent | `/sua-lich` lets a student look up, edit or permanently delete their booking using their phone or email (`POST /bookings/lookup`, `POST /bookings`, `POST /bookings/delete`). Other requests go through the controller contact. |
| **Storage limitation** | Bookings are deleted automatically `RETENTION_DAYS` (default 180) after their last update, and expired admin sessions are removed. The job runs at startup and every 12 hours; `npm run retention:purge -w backend` purges bookings on demand. Remove admin accounts that are no longer needed on the admin page. |
| **Access control** | Bookings in bulk are only available to signed-in admins (or `ADMIN_TOKEN`). The role is checked on the server for every request, not just hidden in the UI. Passwords are scrypt-hashed; sign-in is rate-limited per IP and accounts lock for 15 minutes after 5 wrong passwords. Account creation, password resets and deletions are audited. |
| **Security: encryption, access control, logging** | Field-level AES-256-GCM, with each value bound to its row and column through authenticated data (AAD). Keys live outside the database, in `.env`. Lookups use HMAC blind indexes, so nothing is decrypted to find a row. The admin API requires a token. Rate limits apply (10 lookups or deletes per 10 minutes per IP), and Helmet sets security headers. Logs never contain request bodies. |
| **Accountability**: record of processing | The `audit_logs` table records every create, update, view, delete, admin list, export, purge, sign-in (including failed ones and lockouts) and account change. Each entry has the time, the actor type and the actor's pseudonymous user id (`actor_id`), never an email or name. |
| **Data in transit** | Deploy behind HTTPS (see the README). The API refuses browser origins not listed in `CORS_ORIGINS`. |

## Your responsibilities as the controller

These are organisational duties that code can't fulfil for you:

1. **Protect the keys.** Back up `ENCRYPTION_KEY`, `BLIND_INDEX_KEY` and `ADMIN_TOKEN` in a
   password manager. If the encryption key is lost, the data can't be recovered. If it leaks,
   rotate it (see below). Never commit `backend/.env`.
2. **Restrict database access.** Anyone with database access sees only ciphertext. Still, use strong
   passwords and don't expose PostgreSQL to the internet. The Docker setup binds to 127.0.0.1.
3. **Handle exports carefully.** `npm run export:bookings` writes decrypted data to
   `backend/exports/`. Delete these files when you're done; each export is logged.
4. **Breaches.** If personal data is leaked or accessed without authorisation, the law requires
   notifying the competent authority (the Ministry of Public Security's data protection unit) and,
   where required, the affected students. Check the current deadline and procedure. Decree 13
   required 72 hours.
5. **Impact assessment (DPIA).** The law requires a personal-data processing impact assessment
   dossier. Household businesses and micro-enterprises are exempt, and small businesses and
   start-ups can opt out for 5 years. Check which applies to your class.
6. **Hosting location.** The recommended setup (Supabase and Render in Singapore, see
   [deployment.md](deployment.md)) stores and processes the data outside Vietnam. That counts as a
   **cross-border transfer** of personal data, which has its own assessment and dossier duties
   under the PDP Law. Field encryption means Supabase and Render only ever hold ciphertext (the
   keys live only in your app's environment variables). That reduces the risk, but it doesn't
   remove the legal duty. Hosting on a server in Vietnam avoids the cross-border question
   entirely; the same Docker image runs on any Vietnamese VPS.
7. **Supabase Data API.** Migrations enable Row Level Security on every table (including the admin
   `users` and `sessions` tables) and revoke the `anon` and `authenticated` roles' access, so the tables can't be
   read through Supabase's public REST API. Don't add RLS policies or re-grant access to those
   roles.
8. **Choose admins carefully.** Admins can see every student's contact details. Keep the list
   short, use strong unique passwords (a password manager), send temporary passwords privately,
   and review **Quản trị → Quản trị viên** from time to time.
9. **Update the notice** when you change what you collect or why. Bump `PRIVACY_POLICY_VERSION` so
   new consents record the new version.

## Key rotation

1. Generate a new key: `npm run keys:generate -w backend` (it prints new values when `.env`
   already exists).
2. In `backend/.env`, move the current key into `ENCRYPTION_OLD_KEYS` (for example
   `1:OLDKEY...`), set the new `ENCRYPTION_KEY`, and increase `ENCRYPTION_KEY_ID` (for example to
   `2`).
3. Restart the API. New and updated data uses key 2, and old data still decrypts with key 1.
   Remove the old key once all old bookings have been purged or re-saved.

`BLIND_INDEX_KEY` can't be rotated this way, because existing lookups would stop matching. Treat
it as long-lived.
