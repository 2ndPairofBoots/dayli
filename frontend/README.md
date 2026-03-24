# Dayli GitHub Pages Dashboard

This folder is deployed as a static GitHub Pages site.

## What it shows

- Recent bets from `logs/bets/place_bet_event.csv`
- Recent strategy decisions from `logs/strategies/strategy_event.csv`
- Portfolio snapshots from `logs/portfolio/portfolio_event.csv`
- Recent errors from `logs/errors/error_event.csv`

## Publish flow

The workflow in `.github/workflows/pages.yml` deploys this folder on pushes to `main`.

It also copies `backend/logs/*` into `frontend/logs/*` during the workflow run.

## Local preview

Open `frontend/index.html` in a browser, or serve this folder with any static server.
