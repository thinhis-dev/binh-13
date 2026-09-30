# Free Hosting for a One-Time Binh 13 Game with Two Players

Research date: 2026-09-30, 23:22 (Asia/Bangkok).

## Answer

Yes. The simplest free option is to run the game on your own computer and share it through a Cloudflare Quick Tunnel. A Quick Tunnel gives you a temporary public `https://<random>.trycloudflare.com` address. It needs no account, no domain, and no money, and it passes WebSocket traffic. Your computer must stay on during the game.

If you do not want to keep your computer on, Render's free web service is the second option. It needs more code changes, so it is not worth the work for one game.

## Project facts that affect the choice

- The server (`apps/server`) is a long-running Node process with Socket.io and a SQLite file (`better-sqlite3`). Serverless hosts such as Vercel and Netlify cannot run it.
- The CORS origin is fixed to `http://localhost:5173` in `apps/server/src/server.ts`.
- The server does not serve the built web app. The web app and the server run as two processes.
- In the browser, `apps/web/src/lib/socket.ts` uses `VITE_SOCKET_URL`. If the value is an empty string, the socket connects to the same address as the page.
- If `JWT_SECRET` is not set, the server uses `dev-secret`. For one private game, this is acceptable.

## Option comparison

| Option | Cost | Code changes | Limits |
|---|---|---|---|
| Local run + Cloudflare Quick Tunnel | Free, no account | Two lines in `vite.config.ts` | Your PC must stay on. The URL changes on each start. No uptime guarantee. |
| Render free web service | Free, account needed | Server must serve the web build, CORS must change | Sleeps after 15 minutes without traffic. Cold start takes about one minute. SQLite data is lost on each restart. |
| Fly.io, Railway | Trial credit or paid | Similar to Render | Not free long-term. |
| Vercel, Netlify | Free | Not possible | No long-running Socket.io server. |

## Recommended steps (Quick Tunnel)

1. Install `cloudflared` (it is not installed now):

```bash
curl -L -o cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
```

2. In `apps/web/vite.config.ts`, let Vite accept the tunnel host and forward Socket.io traffic to the server:

```ts
server: {
  port: 5173,
  allowedHosts: ['.trycloudflare.com'],
  proxy: {
    '/socket.io': { target: 'http://localhost:8080', ws: true },
    '/api': { /* keep the existing entry */ },
  },
},
```

3. Start the game with an empty socket URL, so that the browser connects through the same tunnel address. Values in the shell take priority over `apps/web/.env`.

```bash
VITE_SOCKET_URL= pnpm dev
```

4. In a second terminal, open the tunnel:

```bash
cloudflared tunnel --url http://localhost:5173
```

5. Send the printed `trycloudflare.com` address to your friend. Both of you open that address and play.

6. After the game, stop both terminals with Ctrl+C.

Because the page and the socket use the same address, the fixed CORS origin does not block the game.

## Sources

- [Cloudflare Docs: Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
- [Cloudflare Tunnel in 2026](https://recca0120.github.io/en/2026/04/14/cloudflare-tunnel-2026/)
- [Render Docs: Deploy for Free](https://render.com/docs/free)
- [Render changelog: WebSocket messages keep free services active](https://render.com/changelog/free-web-services-now-remain-active-while-receiving-websocket-messages)

## Unresolved questions

- I did not test the steps on this machine. Vite 6 blocks unknown host names in dev mode, so `allowedHosts` is required. Make sure that the empty `VITE_SOCKET_URL` overrides the `.env` value. If it does not, set the value to an empty string in `apps/web/.env` for the game.
- Cloudflare closes idle WebSockets after an undocumented timeout. The client auto-reconnect behavior during a game is not verified.
