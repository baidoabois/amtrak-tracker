# Amtrak Train Tracker

A MERN-stack app that tracks live Amtrak trains and sends email notifications for delays and disruptions.

## Project Structure

```
amtrak-tracker/
├── backend/    Express + MongoDB + Node-cron
└── frontend/   React + Vite + Tailwind CSS
```

## Prerequisites

- Node.js >= 18 (tested on v24)
- MongoDB running locally (`mongod`) or a MongoDB Atlas URI

## Setup

### 1. Backend

```bash
cd backend
cp .env.example .env
# Edit .env — set MONGODB_URI, JWT_SECRET, and email credentials
npm install
npm run dev
```

Runs on `http://localhost:5000`

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:3000` — proxies `/api` to the backend automatically.

## Environment Variables (backend/.env)

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Long random string for JWT signing |
| `EMAIL_HOST` | SMTP host (e.g. smtp.gmail.com) |
| `EMAIL_PORT` | SMTP port (587 for TLS) |
| `EMAIL_USER` | Your email address |
| `EMAIL_PASS` | App password (not your real password for Gmail) |
| `EMAIL_FROM` | Display name + email for outgoing mail |

## How It Works

1. On startup the backend fetches live Amtrak data from `maps.amtrak.com` and decrypts it using the same AES-128-CBC scheme the official Amtrak train map uses (public key from `RoutesList.v.json`, PBKDF2-SHA1 key derivation).
2. The poller runs every 2 minutes, compares train states against the previous snapshot, and emails any subscribed users when a train first becomes delayed (≥15 min) or disrupted.
3. Users can subscribe to specific train numbers from the Live Board or their Dashboard.

## Admin Account

The first user you create will be a regular user. To make an admin, connect to MongoDB and update the `role` field:

```js
db.users.updateOne({ email: "your@email.com" }, { $set: { role: "admin" } })
```

Admins get access to `/admin` — a full train table plus status breakdown charts.
