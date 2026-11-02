import { getClientIp } from "./client-ip";

export async function allowLoginAttempt(env: CloudflareEnv, request: Request): Promise<boolean> {
	if (!env.LOGIN_RATE_LIMIT) return true;
	// Key the limit by the resolved client IP. Without a per-client key every
	// visitor lands in one shared "unknown" bucket and scanners can lock out
	// legitimate logins; trusting raw forwarding headers would be worse — a
	// client could rotate them to leave the bucket entirely.
	const ip = getClientIp(request) ?? "unknown";
	try {
		const outcome = await env.LOGIN_RATE_LIMIT.limit({ key: ip });
		return outcome.success;
	} catch (error) {
		console.warn("Login rate limiter unavailable", error);
		return true;
	}
}
