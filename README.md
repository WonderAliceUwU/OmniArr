# OmniArr

Self-hosted media discovery and download management for Jellyfin users.

OmniArr brings your favourite services together in one clean dashboard: browse
your Jellyfin library, discover movies and series, follow upcoming releases,
request downloads and monitor storage from a single place.

[![Docker image](https://img.shields.io/docker/v/wonderalice/omniarr?sort=semver&label=docker)](https://hub.docker.com/r/wonderalice/omniarr)
[![Docker pulls](https://img.shields.io/docker/pulls/wonderalice/omniarr)](https://hub.docker.com/r/wonderalice/omniarr)
[![License](https://img.shields.io/badge/license-private-lightgrey)](https://github.com/WonderAliceUwU/omniarr)

If OmniArr is useful to you, you can support its development on [Ko-fi](https://ko-fi.com/WonderAliceUwU).

## What you get

- Jellyfin profile login with an `HttpOnly` session cookie.
- A protected administration area with encrypted service settings.
- Browsing for movies, series, anime and K-dramas.
- Integrations for Jellyfin, Sonarr, Radarr, qBittorrent and TMDb.
- Download progress, completed items, calendar and storage monitoring.
- One production Node process serving the frontend and API.
- Docker images published for `linux/amd64` and `linux/arm64`.

## Install with Docker Compose

Create a directory for OmniArr and add this `docker-compose.yml`:

```yaml
services:
  omniarr:
    image: wonderalice/omniarr:1.0
    container_name: omniarr
    restart: unless-stopped
    ports:
      - "8787:8787"
    environment:
      PORT: "8787"
      OMNIARR_DATA_DIR: /app/data
      TMDB_BEARER_TOKEN: ${TMDB_BEARER_TOKEN:-}
    volumes:
      - ${OMNIARR_DATA_DIR:-./data}:/app/data
```

Then start the container:

```bash
docker compose pull
docker compose up -d
```

Open `http://localhost:8787` and create the master password during the first
boot. Configure the Jellyfin, Sonarr, Radarr and qBittorrent connections from
the Administration area.

The Compose file in this repository is ready to use as-is:

```bash
curl -O https://raw.githubusercontent.com/WonderAliceUwU/omniarr/main/docker-compose.yml
docker compose up -d
```

Set `OMNIARR_DATA_DIR` to a host dataset when you want the data outside the
current directory. For example, on TrueNAS:

```bash
export OMNIARR_DATA_DIR=/path/to/omniarr-data
docker compose up -d
```

The `/app/data` mount is required. It contains the encrypted application state,
including the master-password verifier and saved integration settings. Removing
the mount loses that state when the container is replaced.

## Docker image tags

The first public release is available as:

```text
wonderalice/omniarr:1.0
wonderalice/omniarr:latest
```

Pin `1.0` in production for repeatable updates. Use `latest` only when you want
Compose to follow the newest published image.

## Build and publish

To publish a multi-architecture image to Docker Hub:

```bash
docker login
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t wonderalice/omniarr:1.0 \
  -t wonderalice/omniarr:latest \
  --push \
  .
```

To build locally without publishing:

```bash
docker build -t omniarr:local .
docker run --rm -p 8787:8787 -v "$PWD/data:/app/data" omniarr:local
```

## Local development

Requirements: Node.js 22 or newer and npm.

```bash
npm ci
npm run dev:all
```

The production build can be checked with:

```bash
npm run lint
npm run build
```

## Data and security

OmniArr keeps critical state under `OMNIARR_DATA_DIR` (by default
`/app/data` inside the container). The encrypted store is written to
`/app/data/omniarr.secure.json`.

Keep the data directory private, use a strong master password and provide the
TMDb token through an environment variable instead of committing it to source
control.

## License

OmniArr is currently distributed as a private project. See the repository for
the licensing status of your copy.
