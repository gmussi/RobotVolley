/**
 * Matchmaking + WebRTC signaling Worker.
 * Forwards WebSocket clients to a single global Matchmaker Durable Object.
 */
import { Matchmaker } from "./matchmaker.js";

export { Matchmaker };

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

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

      return stub.fetch(new Request(request.url, {
        method: request.method,
        headers,
      }));
    }

    return new Response("Not found", {
      status: 404,
      headers: corsHeaders(request),
    });
  },
};
