/**
 * Steam provider — verifies a session ticket against the Steamworks Web API.
 *
 * The client gets an encrypted app ticket from the local Steam client (see
 * electron/steam.cjs) and sends it as a hex string. Only Valve can tell us
 * whether it is genuine, so this is a real network call; it fails closed.
 *
 * Requires the STEAM_WEB_API_KEY and STEAM_APP_ID secrets. When either is
 * missing the provider reports unavailable rather than silently trusting the
 * ticket, so a misconfigured deploy cannot be used to forge a Steam identity.
 */

const AUTH_URL = "https://api.steampowered.com/ISteamUserAuth/AuthenticateUserTicket/v1/";

export const steamProvider = {
  id: "steam",

  async verify(ticket, env) {
    if (typeof ticket !== "string" || !/^[0-9a-fA-F]+$/.test(ticket)) return null;
    if (!env.STEAM_WEB_API_KEY || !env.STEAM_APP_ID) return null;

    const url = new URL(AUTH_URL);
    url.searchParams.set("key", env.STEAM_WEB_API_KEY);
    url.searchParams.set("appid", env.STEAM_APP_ID);
    url.searchParams.set("ticket", ticket);

    let body;
    try {
      const res = await fetch(url.toString());
      if (!res.ok) return null;
      body = await res.json();
    } catch {
      return null;
    }

    const params = body?.response?.params;
    if (!params || params.result !== "OK" || !params.steamid) return null;
    // vacbanned / publisherbanned are advisory; we record the id either way and
    // leave banning to our own `accounts.banned` flag.
    return { uid: String(params.steamid) };
  },
};
