/** Public multiplayer service for the separately hosted GitHub Pages client. */
import { Room } from "./room";
export { Room };
interface RelayEnv { ROOMS: DurableObjectNamespace; }
const ROOM_RE = /^[A-Za-z0-9_-]{1,64}$/;
export default {
  async fetch(request: Request, env: RelayEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/ws" || url.pathname.startsWith("/ws/")) {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("expected a websocket upgrade", { status: 426 });
      }
      const room = url.pathname.slice(3).replace(/^\/+/, "") || "main";
      if (!ROOM_RE.test(room)) return new Response("invalid room name", { status: 400 });
      return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
    }
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return Response.json({ game: "Novaris: Fleet Vanguard", status: "online", transport: "websocket", maxPlayers: 6 }, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
    }
    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<RelayEnv>;
