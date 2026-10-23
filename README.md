# coldcalltracker

[![CI](https://github.com/Josh-Lamb-Systems/coldcalltracker/actions/workflows/ci.yml/badge.svg)](https://github.com/Josh-Lamb-Systems/coldcalltracker/actions/workflows/ci.yml)

A simple application to track cold calling metrics over time. Callers tap
four tally counters while they're on the phone (in the spirit of
[tallycount.app](https://tallycount.app/)), and the stats page shows how the
funnel converts by day, week and month.

| Counter | Counts |
| --- | --- |
| **Dials** | calls you made |
| **Owners Reached** | business owners you actually spoke to |
| **Booking Attempts** | owners you tried to book |
| **Appointments Booked** | successful bookings |

## Features

- **Calling sessions.** Start a session, tap away, end it. The first tap
  starts a session if none is running, and you can run several a day. Sessions
  left open with no taps for 2 hours end on their own at the last tap.
  Sessions where nothing was counted are discarded.
- **Counters** with − / + buttons, keyboard shortcuts (`1`–`4` add,
  `Shift` + `1`–`4` subtract), and a ⋮ menu to set or reset a value. Each card
  shows the live conversion rate and today's progress toward your daily goal.
- **Live sync** between devices: tap on your phone and your laptop updates.
  Taps show up instantly and are saved in the background. If the connection
  drops they're retried until they get through.
- **Team logins.** Every caller has their own account, created by an admin.
  Everyone signed in can see the whole team's stats.
- **Daily goals** that each caller sets for themselves.
- **Stats** for any range (today through all time), for the whole team or one
  caller: totals, funnel, conversion-rate trend, activity charts (with a goal
  line for a single caller), leaderboard, breakdown table and session list.
  Everything exports to CSV. Callers can edit or delete their own sessions.

Conversion rates:

| Rate | Formula |
| --- | --- |
| Contact rate | owners reached ÷ dials |
| Attempt rate | booking attempts ÷ owners reached |
| Booking rate | appointments booked ÷ booking attempts |
| Dial to booking | appointments booked ÷ dials |

## Run it with Docker

Every push to `main` publishes an image to
`ghcr.io/josh-lamb-systems/coldcalltracker` (see
[Published images](#published-images)). On a server you only need
`docker-compose.yml` and `.env.example` in a folder:

```sh
cp .env.example .env   # set PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD (8+ characters)
docker compose pull    # fetch the published image
docker compose up -d
```

Run the same `pull` and `up -d` to update. From a checkout of this repo,
`mise run up` builds the image from source instead.

The app runs at <http://localhost:8090>. Everything is stored in `./data`
(a bind mount): the SQLite database, PocketBase's logs and any backups.

### Add your callers

1. Open the PocketBase dashboard at <http://localhost:8090/_/> and sign in
   with `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD`.
2. Go to **Collections → users → New record**. Enter an email, a password and
   the caller's **name**, which is what the team sees on the leaderboard.
3. Send them their login. They can set their goals and change their password
   on the **Goals** page.

There's no public sign-up. PocketBase won't delete a caller who has sessions,
which keeps the team's history intact. To lock someone out, change their
password instead.

### Configuration

Set these in `.env`; `docker compose` reads them.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8090` | Port on the host. |
| `IMAGE_TAG` | `latest` | Image to run: `latest`, a release such as `1.2.3`, or `sha-<commit>`. |
| `PB_ADMIN_EMAIL`, `PB_ADMIN_PASSWORD` | – | Dashboard login, created or updated on every start. If unset, the container log prints a one-time link to create the first admin. |
| `SESSION_IDLE_MINUTES` | `120` | Open sessions with no taps for this long are ended automatically. |
| `PUID`, `PGID` | `1000` | Owner of `./data` on the host (`id -u`, `id -g`). PocketBase runs as this user rather than root (`PUID=0` keeps root). |

### Putting it on the internet

- Put it behind a reverse proxy with HTTPS (Caddy, Traefik, nginx, …). Live
  sync uses server-sent events on `/api/realtime`. If you use nginx, turn off
  `proxy_buffering` for that path.
- In the dashboard under **Settings → Application**, set the Application URL.
  Behind a proxy, also enable **IP proxy headers** (e.g. `X-Forwarded-For`) so
  logs and rate limits see real client IPs. **Rate limiting**, on the same
  page, turns on PocketBase's built-in rate limiter.
- **Settings → Backups** creates and schedules backups into `./data/backups`.

## Local development

Requires [mise](https://mise.jdx.dev/), which installs the pinned Node and
PocketBase versions. The Docker build installs the same versions from
`mise.toml`.

```sh
mise install
mise run admin you@example.com a-long-password   # local dashboard login
mise run dev                                     # PocketBase :8090 + Vite :5173
```

Open <http://localhost:5173> for the app with hot reload. Use
<http://localhost:8090/_/> to add a caller you can sign in as. Local data
lives in `./pb_data`.

`mise.lock` pins the download URL and checksum of each tool, which mise
verifies on install. After changing a version in `mise.toml`, run `mise lock`
to refresh it.

| Task | What it does |
| --- | --- |
| `mise run dev` | PocketBase and the Vite dev server together |
| `mise run test` | Unit tests and API tests (each API test file starts its own PocketBase) |
| `mise run check` | Type-check the Svelte/TypeScript code |
| `mise run build` | Build the frontend into `pb_public/` |
| `mise run up` / `down` / `logs` | Docker Compose |

## Published images

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs the type check and
tests on every push and pull request. It then builds the image for
`linux/amd64` and `linux/arm64` and pushes it to the GitHub Container
Registry:

| Event | Tags published |
| --- | --- |
| Push to `main` | `latest`, `sha-<commit>` |
| Tag `v1.2.3` | `1.2.3`, `1.2`, `latest`, `sha-<commit>` |
| Pull request | none (checks that the image builds) |

To cut a release: `git tag v1.0.0 && git push origin v1.0.0`. Dependabot
keeps the workflow's pinned actions up to date.

## How it's built

- **[PocketBase](https://pocketbase.io/)** (Go + SQLite) serves the API, the
  realtime events, the admin dashboard and the built frontend from one binary.
  - `pb_migrations/` holds the schema and API rules. Callers can read the
    whole team's sessions but change only their own, and only an admin can
    create accounts.
  - `pb_hooks/` adds the routes callers use to start, tap, edit and end
    sessions. Each runs in a transaction with server time, so taps from
    several devices are never lost. A retried tap is recognised by its op id
    and counted once. It also runs the cron job that ends idle sessions.
- **Svelte 5 + Vite** single-page app in `web/`.
  `web/src/lib/tally.svelte.ts` handles optimistic taps, retries and live
  sync. Charts are plain SVG.
- **Time zones:** stats use the viewer's own time zone. A session counts
  toward the day it started, and weeks start on Monday.
