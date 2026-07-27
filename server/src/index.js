/**
 * Worker entrypoint: account/profile REST API plus the matchmaking +
 * WebRTC-signaling WebSocket.
 *
 * The two halves are deliberately separate. Accounts, stats and leaderboards
 * are stateless HTTP over D1 (they need cross-player queries and must survive
 * restarts); matchmaking is a single global Durable Object holding live sockets.
 */
import { Matchmaker } from "./matchmaker.js";
import {
  handleLogin, handleRefresh, handleLink, handleLinkCode, handleRedeemLinkCode,
} from "./api/auth.js";
import { handleGetMe, handlePutLoadout, handlePutName } from "./api/me.js";
import { handleLeaderboard } from "./api/leaderboard.js";
import { corsHeaders } from "./api/http.js";

export { Matchmaker };

const ROUTES = {
  "POST /auth/login": handleLogin,
  "POST /auth/refresh": handleRefresh,
  "POST /auth/link": handleLink,
  "POST /auth/link-code": handleLinkCode,
  "POST /auth/redeem-link-code": handleRedeemLinkCode,
  "GET /me": handleGetMe,
  "PUT /me/loadout": handlePutLoadout,
  "PUT /me/name": handlePutName,
  "GET /leaderboard": handleLeaderboard,
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (url.pathname === "/health") {
      return new Response("ok", {
        headers: { "content-type": "text/plain", ...corsHeaders(request) },
      });
    }

    const handler = ROUTES[`${request.method} ${url.pathname}`];
    if (handler) return handler(request, env);

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }

      const id = env.MATCHMAKER.idFromName("global");
      const stub = env.MATCHMAKER.get(id);
      const cf = request.cf || {};
      const headers = new Headers(request.headers);
      headers.set("X-Geo-Lat", cf.latitude != null ? String(cf.latitude) : "");
      headers.set("X-Geo-Lon", cf.longitude != null ? String(cf.longitude) : "");
      headers.set("X-Geo-Colo", cf.colo != null ? String(cf.colo) : "");
      headers.set("X-Geo-Country", cf.country != null ? String(cf.country) : "");

      // Clone the upgrade request so the WebSocket handshake is preserved.
      return stub.fetch(new Request(request, { headers }));
    }

    return new Response("Not found", {
      status: 404,
      headers: corsHeaders(request),
    });
  },
};
