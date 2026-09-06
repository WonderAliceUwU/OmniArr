# OmniArr

React + TypeScript frontend with a built-in Node backend for:

- Jellyfin-profile login with an `HttpOnly` session cookie
- master-password protected administration and server-side service settings
- Jellyfin, Sonarr, Radarr, qBittorrent and TMDb integration
- a single production process for Docker/TrueNAS

## Persistence

All critical state is persisted under `OMNIARR_DATA_DIR`.

By default inside the container that is:

```text
/app/data
```

The encrypted state file is:

```text
/app/data/omniarr.secure.json
```

That file contains:

- master-password verifier
- encryption salt
- server-managed encryption key and encrypted application settings

If you do not persist `/app/data`, you will lose:

- the master password
- all integration settings
- all saved configuration after restart, redeploy or image update

## Local Development

Single command:

```bash
npm run dev:all
```

That starts:

- Vite frontend
- Node API server

If you want them separately:

```bash
npm run dev:server
npm run dev
```

## Production

Build and serve:

```bash
npm run serve
```

Or separately:

```bash
npm run build
npm run start
```

The production server serves both the static frontend and the API on the same port.

## Docker

Build:

```bash
docker build -t omniarr .
```

Run with persistence:

```bash
docker run -d \
  --name omniarr \
  --restart unless-stopped \
  -p 8787:8787 \
  -e PORT=8787 \
  -e OMNIARR_DATA_DIR=/app/data \
  -e TMDB_BEARER_TOKEN=your_tmdb_bearer_token \
  -v /path/on/host/omniarr-data:/app/data \
  omniarr
```

## Docker Compose

There is a ready [docker-compose.yml](./docker-compose.yml).

Start it with:

```bash
docker compose up -d --build
```

The default compose file uses:

```text
./data:/app/data
```

For TrueNAS, replace `./data` with a persistent dataset path if you prefer bind mounts managed outside the app directory.

## TrueNAS Notes

Recommended app/container settings:

- Container port: `8787`
- Host port: your choice, commonly `8787`
- Storage mount: persistent dataset -> `/app/data`
- Restart policy: `unless-stopped`

Recommended environment variables:

- `PORT=8787`
- `OMNIARR_DATA_DIR=/app/data`
- `TMDB_BEARER_TOKEN=...` if you want TMDb configured at deploy time

Example host dataset mount:

```text
/path/to/omniarr-data -> /app/data
```

That dataset is the piece that must survive updates and image replacements.

## First Boot

On first boot there is no default password.

You create the master password in the UI. It protects the Administration area; viewers sign in from the profile screen using their own Jellyfin password.

After that, OmniArr stores only the verifier and encrypted settings in `/app/data/omniarr.secure.json`.
