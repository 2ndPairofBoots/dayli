# Dayli GitHub Pages Hub

This folder is deployed as a static GitHub Pages site.

## Routes

- Main hub (landing): `/dayli/`
- Manifold bot app: `/dayli/manifoldmanabot/`

## Manifold app account flow

- Open `/dayli/manifoldmanabot/` and use Account Setup.
- Enter display name, email, and Manifold API key.
- Click Create & Connect to verify the key against Manifold /v0/me directly from the browser.
- Account details are stored in browser localStorage for this site.
- Use Disconnect to remove the local account and API key from browser storage.

## What the Manifold app shows

- Recent bets from `logs/bets/place_bet_event.csv`
- Recent strategy decisions from `logs/strategies/strategy_event.csv`
- Portfolio snapshots from `logs/portfolio/portfolio_event.csv`
- Recent errors from `logs/errors/error_event.csv`

## Publish flow

The workflow in `.github/workflows/pages.yml` deploys this folder on pushes to `main`.

It also copies `backend/logs/*` into `frontend/logs/*` during the workflow run.

## Local preview

Open `frontend/index.html` in a browser, or serve this folder with any static server.
