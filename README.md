# OmniArr - Every Arr unified

Self-hosted media discovery and download management for Jellyfin users.

<img width="4210" height="2560" alt="Screenshot 2026-10-13 at 09 45 47" src="https://github.com/user-attachments/assets/9c209c29-f357-4439-be2a-e7a2a7f0e2b1" />

OmniArr brings your favourite services together in one clean dashboard: browse
your Jellyfin library, discover movies and series, follow upcoming releases,
request downloads and monitor storage from a single place.

[![Docker image](https://img.shields.io/docker/v/wonderalice/omniarr?sort=semver&label=docker)](https://hub.docker.com/r/wonderalice/omniarr)
[![Docker pulls](https://img.shields.io/docker/pulls/wonderalice/omniarr)](https://hub.docker.com/r/wonderalice/omniarr)
[![License](https://img.shields.io/badge/license-private-lightgrey)](https://github.com/WonderAliceUwU/OmniArr)

If OmniArr is useful to you, you can support its development on [Ko-fi](https://ko-fi.com/WonderAliceUwU).

## What you get

- It connects with all your Jellyfin users, the login stays consistent.
- Integration with Sonarr and Radarr to manage your library.

  <img width="4212" height="2564" alt="Screenshot 2026-10-13 at 09 46 52" src="https://github.com/user-attachments/assets/be2ccf0f-1697-4191-9438-77e2415ef827" />

  <img width="4284" height="2536" alt="Screenshot 2026-10-13 at 10 43 21" src="https://github.com/user-attachments/assets/73d7bd96-3001-4b55-9679-875b644b3577" />


- A calendar tracking your new episodes and events.

  <img width="4214" height="2566" alt="Screenshot 2026-10-13 at 09 46 05" src="https://github.com/user-attachments/assets/c614b617-5ee5-437f-a4f0-30f2ac89a71b" />

- Every discovery and search you may need.

  <img width="4208" height="2562" alt="Screenshot 2026-10-13 at 09 47 49" src="https://github.com/user-attachments/assets/82766b80-fb0d-4ff2-b594-203e6b52828f" />

- A download manager to see what's cooking.
- Per-profile control of which sections each person sees (see [Profiles](#profiles)).

And many things more!

## Install with Docker Compose

Create a directory for OmniArr and add this `docker-compose.yml`:

```yaml
services:
  omniarr:
    image: wonderalice/omniarr:1.2.4
    container_name: omniarr
    restart: unless-stopped
    ports:
      - "8787:8787"
    environment:
      PORT: "8787"
      OMNIARR_DATA_DIR: /app/data
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
curl -O https://raw.githubusercontent.com/WonderAliceUwU/OmniArr/main/docker-compose.yml
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

The current release is available as:

```text
wonderalice/omniarr:1.2.4
wonderalice/omniarr:latest
```

Pin `1.2.4` in production for repeatable updates. Use `latest` only when you want
Compose to follow the newest published image.

## Build locally

To build and run your own image from source:

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

## Profiles

Open **Administration → Profiles** to see every Jellyfin profile. Selecting one
opens its settings:

- **Sections** are on/off switches for Search, Upcoming, Downloads, Wishlist,
  K-Drama, Anime, Library and each network. Everything is on by default and
  Home is always available. A hidden section disappears from the menu and the
  server refuses its requests for that profile. The administrator always sees
  everything.
- **Libraries** shows which Jellyfin libraries the profile can open. It is read
  from Jellyfin and cannot be changed here; manage it in Jellyfin.

Save with the check button of the Profiles card.

### Upcoming and library access

Upcoming comes from Sonarr and Radarr, which know nothing about Jellyfin
permissions. To keep each profile's calendar to what it can open, OmniArr asks
Jellyfin for the libraries a profile cannot open and leaves out the releases
that are stored in them.

Sonarr, Radarr and Jellyfin often mount the media folder under different paths
(for example `/shared/Library/Anime` for Sonarr and `/library/Anime` for
Jellyfin), so a release is matched to a library by the **name of the library
folder** found in the series or movie path. Keep that folder name the same in
all three apps. A release whose path does not contain the name of any library is
shown to everyone, and if Jellyfin cannot be reached the calendar is not
filtered.

## Tests

```bash
npm test
```

The tests run against small stand-ins for Jellyfin, Sonarr and Radarr
(`server/test/mock-services.ts`). To point a running OmniArr at them while
developing, start them with `node dist-server/server/test/mock-services.js` after
a build; it prints the three URLs, accepts any API key and offers a `full`
profile and a `limited` one that cannot open Anime or Anime Movies.

## Data and security

OmniArr keeps critical state under `OMNIARR_DATA_DIR` (by default
`/app/data` inside the container). The encrypted store is written to
`/app/data/omniarr.secure.json`.

Keep the data directory private, use a strong master password and provide the
TMDb token through the Administration area. It is stored encrypted with the
rest of the application configuration.

## License

OmniArr is currently distributed as a private project. See the repository for
the licensing status of your copy.
