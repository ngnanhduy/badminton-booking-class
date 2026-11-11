# Deployment guide: Supabase + Render + domain

The recommended free setup:

| Piece | Service | Cost | Notes |
| --- | --- | --- | --- |
| Database | **Supabase** (PostgreSQL), region **Singapore** | Free plan | Free projects can be paused after a period of inactivity (see step 5) |
| App (API + website) | **Render** web service from the `Dockerfile`, region **Singapore** | Free plan | Sleeps after 15 min idle, and the next visit takes about 1 minute to wake it |
| Address | `https://<name>.onrender.com` | Free | HTTPS included; add a custom domain any time |

Everything runs as **one container**: the API serves the website and `/api/v1` on the same
domain, so there's no CORS setup or second deployment.

> Free tiers change often. The limits above were checked in November 2026. Confirm them on
> Render's and Supabase's pricing pages before relying on them.

---

## 1. Create the Supabase database

1. Sign up at [supabase.com](https://supabase.com) and create a **New project**:
   - Region: **Southeast Asia (Singapore)**, the closest to Vietnam.
   - Set a strong database password and save it in your password manager.
2. Open **Connect** (top bar) and copy the **Session pooler** connection string. It looks like:
   ```
   postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
   ```
   Use the *session pooler*, not the direct connection: the direct host is IPv6-only, and Render
   connects over IPv4. Replace `[YOUR-PASSWORD]`, URL-encoding special characters (`@` → `%40`,
   `#` → `%23`, `/` → `%2F`).
3. Optionally, for the strongest TLS setting: **Database → Settings → SSL Configuration →
   Download certificate**. Keep the `.crt` file for step 3.

The app creates its tables and runs migrations automatically on first start. One migration
enables **Row Level Security** and revokes access for Supabase's `anon` and `authenticated` roles.
Supabase's public Data API therefore can't read the bookings, and only your backend can.

**Try it locally first:** put the connection string into `backend/.env` as `DATABASE_URL`, then
run `npm run dev`. The tables then appear in Supabase's **Table Editor**, where you can browse
them. Personal-data columns show as ciphertext there, as intended.

## 2. Put the code on GitHub

Render deploys from a Git repository.

1. Install Git: `winget install --id Git.Git -e` (restart the terminal afterwards).
2. Create a **private** repository on [github.com](https://github.com/new).
3. In the project folder:
   ```sh
   git init
   git add .
   git commit -m "Badminton booking app"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
   `.gitignore` keeps `backend/.env`, the local database and exports out of the repository. Check
   with `git status` before the first commit that no `.env` file is listed.

## 3. Deploy on Render

1. Sign up at [render.com](https://render.com) with your GitHub account.
2. **New → Blueprint**, then pick your repository. Render reads [`render.yaml`](../render.yaml):
   one free Docker web service in Singapore, health-checked at `/api/v1/health`.
3. Render asks for the secret values:

   | Key | Value |
   | --- | --- |
   | `DATABASE_URL` | The Supabase session pooler string from step 1 |
   | `ENCRYPTION_KEY`, `BLIND_INDEX_KEY`, `ADMIN_TOKEN` | **The same values as in your `backend/.env`**. Data encrypted with one key can't be read with another. |
   | `CORS_ORIGINS` | `https://<service-name>.onrender.com` (and later your custom domain, comma-separated) |
   | `CONTROLLER_CONTACT` | How students reach you about their data (Zalo number or email) |
   | `PUBLIC_URL` | `https://<service-name>.onrender.com`, the exact address people open, without a trailing slash. With https, admin session cookies are `Secure`. |

4. Optionally, to verify the database certificate: in the service go to **Environment → Secret
   Files**, add `supabase-ca.crt` with the content of the certificate from step 1, then set
   `DATABASE_SSL=verify` and `DATABASE_CA_CERT=/etc/secrets/supabase-ca.crt`.
5. Click **Apply**. The first build takes a few minutes. Your app is then live at
   `https://<service-name>.onrender.com`. Every `git push` to `main` redeploys it automatically.

**Without the Blueprint:** choose New → Web Service → your repo → Runtime **Docker**, Instance
**Free**, Region **Singapore**, Health check path `/api/v1/health`, then add the environment
variables from the table above.

## 4. Create your admin account

Only admins sign in (students book without an account). The admin page is at `/quan-tri`, also
reachable from **Quản trị / Admin** in the footer. It has bookings with contacts, CSV export,
class settings, and the admin accounts.

Render's free plan has no shell, so create the first admin **from your computer**, against the
Supabase database:

1. Make sure `backend/.env` has the same `DATABASE_URL`, `ENCRYPTION_KEY` and `BLIND_INDEX_KEY`
   as Render.
2. Run:
   ```sh
   npm run admin:create -w backend -- --email you@example.com --name "Your Name"
   ```
   It prints a **temporary password** once. Save it in your password manager.
3. Open `https://<service-name>.onrender.com/dang-nhap`, sign in, then change the password in
   the avatar menu under **Đổi mật khẩu**.

More admins: on **Quản trị → Quản trị viên**, enter an email and name. The app shows a temporary
password once; send it to them privately. The same page resets a password (the account is signed
out everywhere) and deletes accounts. You can't delete yourself or the last admin.

**Forgot your password?** Another admin can reset it, or run
`npm run admin:create -w backend -- --email you@example.com --reset` locally.

Security:

- Passwords are hashed with scrypt.
- 10 sign-in attempts per IP every 15 minutes, and an account locks for 15 minutes after 5 wrong
  passwords.
- The session is an `httpOnly`, `SameSite=Lax` cookie, `Secure` with the `__Host-` prefix when
  `PUBLIC_URL` is https, and expires after `SESSION_TTL_HOURS` (default 72).
- Only hashes of session tokens are stored. Admin emails and names are encrypted like bookings.
- `ADMIN_TOKEN` keeps working for scripts (`Authorization: Bearer …`).

## 5. Get a domain

| Option | Cost | Effort | Good for |
| --- | --- | --- | --- |
| `<name>.onrender.com` | Free | None, included | Starting right away |
| **`.id.vn` / `.biz.vn`** (Vietnam) | Free: VNNIC waives fees for eligible new registrations | Register through an accredited Vietnamese registrar | A real Vietnamese domain: `.id.vn` for individuals, `.biz.vn` for businesses |
| `<name>.eu.org` | Free, never expires | Volunteer-run; manual approval can take weeks | A free domain you control |
| `<name>.is-a.dev` | Free | Pull request on GitHub; for developer projects, check their rules | Personal or dev projects |

About `.id.vn` / `.biz.vn`: Circular 149/2026/TT-BTC extends the registration and maintenance fee
waiver to **3 years**, for one new domain per eligible holder, for registrations from
**1 January 2027 to 31 December 2030**. As reported, `.id.vn` is for Vietnamese citizens (with an
age condition for the free offer) and `.biz.vn` is for businesses. Confirm the exact eligibility
with the registrar or VNNIC before registering. Avoid "free domain" offers like the old Freenom
`.tk`/`.ml`, which no longer exist.

### Connect a custom domain to Render

1. Render → your service → **Settings → Custom Domains → Add**, then enter for example
   `datlich.yourname.id.vn`.
2. At your domain's DNS provider, add the record Render shows. For a subdomain this is
   `CNAME datlich → <service-name>.onrender.com`.
3. Render verifies the record and issues the HTTPS certificate automatically.
4. Add the new address to `CORS_ORIGINS` (for example
   `https://<service-name>.onrender.com,https://datlich.yourname.id.vn`).
5. Set `PUBLIC_URL` to the new address. Admin sign-in rejects write requests from other origins,
   so share that one address.

## 6. Keep it awake (optional)

The free Render service sleeps after 15 minutes without visits, and the first visit afterwards
waits about a minute. A free uptime monitor (for example UptimeRobot) that calls
`https://<your-app>/api/v1/health` every 10–14 minutes avoids this:

- One always-on free service uses about 720 of the 750 free hours per month, so it fits once.
  Don't run a second always-on free service.
- The health check also queries the database, which keeps the Supabase project active.

## 7. After deploying

- **Back up the keys** (`ENCRYPTION_KEY`, `BLIND_INDEX_KEY`). They exist only in your `.env`,
  your password manager and Render's settings.
- **Each week:** change the week label on **Quản trị → Cài đặt lớp**. Alternatives are the
  `settings` table in Supabase's Table Editor, or `PUT /api/v1/admin/settings` with your
  `ADMIN_TOKEN`.
- **Export decrypted data:** run `npm run export:bookings -w backend` locally, with `DATABASE_URL`
  pointing at Supabase in `backend/.env`.
- **Hosting location:** Supabase and Render in Singapore store and process the data outside
  Vietnam. Under the PDP Law that's a cross-border transfer; see
  [data-protection.md](data-protection.md).

## Other free options (if Render doesn't suit you)

- **Koyeb:** one free web service (512 MB RAM), Docker support, Frankfurt or Washington only (far
  from Vietnam). It scales to zero after 1 hour idle.
- **Google Cloud Run:** a generous free monthly allowance, Docker-native and scales to zero, but it
  requires a billing account (card).

## Running the container yourself

Docker isn't needed for Render, which builds the image for you. To run it on your own machine or
a VPS:

```sh
docker compose up --build            # http://localhost:3000, settings from backend/.env
```
