# FreshBooks Data Extraction – Project Guide

## Overview
- Two apps: `backend` (Express + LocalTunnel) and `Frontend` (Vite + React).
- Flow: user hits backend `/auth` → FreshBooks OAuth → backend exchanges code → redirects to frontend with `access`, `refresh`, `account`, `business_id`, `business_uuid` query params → frontend stores tokens and calls backend `/api/*` extraction endpoints.
- Backend can also run a LocalTunnel so FreshBooks can call the callback URL when you are not on a public host.

## Prerequisites
- Node.js 18+ and npm.
- FreshBooks API app with `CLIENT_ID`, `CLIENT_SECRET`, and scopes matching `SCOPE` in `.env`.
- For public callback: internet access (LocalTunnel, ngrok, etc.).

## Environment
- Root `.env` is not used; each app has its own:
  - `backend/.env`  
    - `CLIENT_ID`, `CLIENT_SECRET`, `SCOPE` (space-delimited).  
    - `REDIRECT_URI` (public URL ending in `/callback`, e.g., `https://freshbookapi.loca.lt/callback`).  
    - `PORT` (defaults 5050), `FRESHBOOKS_API` (defaults `https://api.freshbooks.com`).  
    - Optional defaults for `ACCOUNT_ID`, `BUSINESS_ID`, `BUSINESS_UUID`, `ACCESS_TOKEN`, `REFRESH_TOKEN`.
  - `Frontend/.env.local`  
    - `VITE_CLIENT_ID`, `VITE_CLIENT_SECRET` (match backend).  
    - `VITE_BACKEND` (e.g., `http://localhost:5050` or tunnel URL).  
    - `VITE_REDIRECT_URI` (must match backend `REDIRECT_URI`).  
    - `VITE_API_BASE` (usually `https://api.freshbooks.com`).
- Keep secrets out of git; rotate if they leak.

## Install
```bash
# Backend deps
cd backend
npm install

# Frontend deps
cd ../Frontend
npm install
```

## Run (local dev)
Two terminals:
```bash
# Terminal 1 – backend + tunnel
cd backend
npm start
# Starts Express on :5050 and opens LocalTunnel at https://freshbookapi.loca.lt

# Terminal 2 – frontend
cd ../Frontend
npm run dev -- --host --port 5173
# Open http://localhost:5173
```
Notes:
- If Chrome shows `ERR_CONNECTION_REFUSED` on `localhost:5173`, start the frontend dev server (above).
- If LocalTunnel is slow, install it once (`npm i localtunnel` already in deps) or use another tunnel (cloudflared/ngrok).

## OAuth / Login
1) Click “Login & Authorize” in the frontend (or open `${BACKEND}/auth`).  
2) FreshBooks prompts login/consent and redirects to `${REDIRECT_URI}`.  
3) Backend exchanges `code` → redirects to `${FRONTEND_URL}?access=...&refresh=...&expires=...` (frontend auto-saves tokens).  
4) Pick a business from “Get Business List” → “Update Business” to set account/business IDs for extraction.

## Key backend endpoints
- `GET /auth` → redirects to FreshBooks OAuth.
- `GET /callback` → handles OAuth code, stores tokens, redirects to frontend with query params.
- `GET /api/business-map` → list businesses (account_id, business_id, business_uuid).
- `GET /api/whoami` → current user profile.
- `GET /api/test-endpoints` → smoke-test multiple FreshBooks endpoints; returns status strings.
- `GET /api/extract` → paginated fetch for types: invoices, expenses, payments, bills, estimates, credit_notes, bill_payments, billable_items, other_income, taxes, clients, projects, time_entries, journal_entries, ledger_accounts, chart_of_accounts, etc. Supports `start_date`, `end_date`, `account_id`, `business_id`, `business_uuid`.
- `POST /api/update-tokens` → set access/refresh + ids; syncs `.env`.
- `POST /api/reset-session` → clear tokens from memory (and ids if provided).
- `GET /api/generate-journal` → builds a simple journal summary (invoices/expenses/payments/bills).

## Frontend usage
- After login:  
  - “Get Business List” → select business → “Update Business”.  
  - “Test Endpoints” to see which endpoints have data/scope.  
  - Choose date range + endpoint, then “Extract Summary” or line-item sheets (Invoices/Bills/Expenses/Estimates).  
  - Download CSV or view raw JSON.
- The app stores tokens and IDs in `localStorage`; “Logout” clears them.

## Common issues
- `ERR_CONNECTION_REFUSED localhost:5173` → frontend dev server not running; start `npm run dev`.
- Tunnel slow/unreliable → try another tunnel or stay on localhost by setting `VITE_BACKEND=http://localhost:5050` and `REDIRECT_URI=http://localhost:5050/callback` (no tunnel needed).
- 403 “insufficient_scope” → re-authorize with the required scopes in `SCOPE`.
- Empty data → ensure `business_id`, `account_id`, and `business_uuid` are set (update business after login).

## Useful commands
- Backend logs: `cd backend && npm start`
- Frontend dev: `cd Frontend && npm run dev -- --host --port 5173`
- Change backend port: set `PORT` in `backend/.env` and update proxy in `Frontend/vite.config.js` if needed.

