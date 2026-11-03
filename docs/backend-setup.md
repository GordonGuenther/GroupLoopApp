# Backend setup

The GroupLoop backend is a self-hosted [Supabase](https://supabase.com/docs/guides/self-hosting/docker) stack running in Docker. `backend/setup.sh` installs it into `backend/supabase/`. Developers and users who self-host run the same script and choose a variant.

## Variants

| Variant   | Services                                                   | Use it for                        |
|-----------|------------------------------------------------------------|-----------------------------------|
| `dev`     | Postgres, Auth, REST, Realtime, API gateway, Studio dashboard | Developing GroupLoop              |
| `minimal` | Postgres, Auth, REST, Realtime, API gateway                | Self-hosting your own backend     |

Supabase services the app does not use (Storage, Edge Functions, imgproxy, the Supavisor pooler) are disabled in both variants.

## Requirements

- Docker Engine with the Compose plugin
- `git`, `curl`, `openssl`, `jq`
- At least 4 GB RAM

On Debian/Ubuntu and RHEL/Fedora, the script installs missing packages and Docker for you (with `sudo`). On other systems, including macOS, install them yourself and pass `--skip-deps`.

## Set up

```bash
sh backend/setup.sh
```

The script asks for the variant and then for the URLs of your backend (press Enter to keep the defaults for a local setup). It generates all secrets and pulls the Docker images, which takes a few minutes.

Non-interactive:

```bash
sh backend/setup.sh --variant minimal -y          # self-hosting, default URLs
sh backend/setup.sh --variant dev --skip-deps -y  # development, tools already installed
```

| Option                     | Effect                                                        |
|----------------------------|---------------------------------------------------------------|
| `--variant dev\|minimal`   | Skip the variant question. Without a terminal or with `-y`, `minimal` is used. |
| `-y`, `--yes`              | Accept all defaults, no prompts                               |
| `--skip-deps`              | Don't install system packages or Docker                       |
| `-h`, `--help`             | Show usage                                                    |

The script stops if `backend/supabase/` already exists.

## Run

All commands use Supabase's `run.sh`:

```bash
sh backend/supabase/run.sh start     # start the stack
sh backend/supabase/run.sh stop      # stop it
sh backend/supabase/run.sh status    # show running services
sh backend/supabase/run.sh logs auth # follow logs of one service
sh backend/supabase/run.sh secrets   # show passwords and API keys
```

The API gateway listens on `http://localhost:8000`. In the `dev` variant, Studio is available at the same address; log in with the dashboard username and password from `run.sh secrets`.

The app connects with the gateway URL and the publishable key (`SUPABASE_PUBLISHABLE_KEY` from `run.sh secrets`). Never put the secret key into the app.

## Self-hosting on a server

- During setup, enter your public URLs, e.g. `https://api.example.com` for `SUPABASE_PUBLIC_URL`, and your domain for `PROXY_DOMAIN`.
- For HTTPS, enable Supabase's Caddy override before starting: `sh backend/supabase/run.sh config add caddy`.
- Only the gateway (and the proxy) should be reachable from the internet.
- Back up `backend/supabase/.env` and the database. Losing `.env` means losing the keys all app installations use.

See Supabase's [self-hosting guide](https://supabase.com/docs/guides/self-hosting/docker) for details.

## Start over

```bash
sh backend/supabase/run.sh stop
sudo rm -rf backend/supabase   # database files are owned by the container user
sh backend/setup.sh
```

This deletes all data and generates new keys.

## Good to know

- `backend/supabase/` is generated and gitignored. It contains the secrets (`.env`) and the database files.
- The Supabase version is pinned in `backend/setup.sh` (`SUPABASE_REF`).
- GroupLoop's service selection lives in `backend/compose/` and is enabled through `COMPOSE_FILE` in `backend/supabase/.env` (`sh backend/supabase/run.sh config`).
- Supabase's `update.sh` has not been tested with GroupLoop's compose files yet.
