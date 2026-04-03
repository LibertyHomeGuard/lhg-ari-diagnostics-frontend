# LHG ARI Diagnostics Frontend

React + Vite frontend for the ARI Diagnostics system, deployed via AWS Amplify.

## Local Development

### Prerequisites
- Node.js installed

### Setup

1. Clone the repo:
   ```bash
   git clone <repo-url>
   cd lhg-ari-diagnostics-frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment:
   ```bash
   cp .env.example .env
   ```
   The `.env` file is pre-configured to proxy API requests to EC2 via Vite. No changes needed for local dev.

4. Start the dev server:
   ```bash
   npm run dev
   ```
   App runs at `http://localhost:5173`.

### How the API proxy works (local dev)
Requests to `/api/...` are proxied through Vite to the EC2 backend (`vite.config.ts`), avoiding CORS issues. This proxy only runs during `npm run dev` and does not affect production.

---

## Deploying Frontend Changes

1. Make your changes locally and test them.

2. Commit your changes:
   ```bash
   git add .
   git commit -m "your message"
   ```

3. Push to the main branch (triggers Amplify auto-deploy):
   ```bash
   git push origin main
   ```

Amplify auto-deploys in 3-5 minutes. Done.

---

## Production Configuration

In the **AWS Amplify Console → App settings → Environment variables**, set:

| Variable | Value |
|---|---|
| `VITE_API_URL` | `http://<your-ec2-ip>:8001` |

This tells the production build where to find the backend API.
