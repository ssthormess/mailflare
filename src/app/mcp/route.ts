import { getEnv } from "@/lib/cloudflare";
import { authenticateMcpRequest } from "@/lib/mcp/auth";
import { createMailflareMcpHandler } from "@/lib/mcp/server";
import { allowAgentRequest } from "@/lib/agent/rate-limit";

async function handle(request: Request) {
	const url = new URL(request.url);
	// The Node server builds request.url from its listen address
	// (0.0.0.0:3000), so derive the public host/origin from the
	// forwarded/host headers set by the reverse proxy (Tailscale Serve).
	const publicHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
	const publicProto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(/:$/, "");
	const publicOrigin = `${publicProto}://${publicHost}`;
	const origin = request.headers.get("Origin");
	if (origin && origin !== publicOrigin && origin !== url.origin) return new Response("Invalid origin", { status: 403 });
	const env = getEnv();
	if (env.APP_URL && publicHost !== new URL(env.APP_URL).host) return new Response("Invalid host", { status: 403 });
	const principal = await authenticateMcpRequest(env, request);
	if (!principal) return new Response("Unauthorized", { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
	if (!await allowAgentRequest(env, `mcp:${principal.keyId}`)) return new Response("Rate limit exceeded", { status: 429 });
	const handler = createMailflareMcpHandler(env, principal, publicOrigin, request.headers.get("Authorization") ?? "");
	try { return await handler.fetch(request); }
	finally { await handler.close(); }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
