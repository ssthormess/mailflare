export async function allowLoginAttempt(env: CloudflareEnv, request: Request): Promise<boolean> {
	if (!env.LOGIN_RATE_LIMIT) return true;
	// cf-connecting-ip is platform-set on Workers; self-hosted sits behind a
	// reverse proxy, so fall back to the proxy-set x-forwarded-for first hop.
	const ip =
		request.headers.get("cf-connecting-ip")?.trim() ||
		request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		"unknown";
	try {
		const outcome = await env.LOGIN_RATE_LIMIT.limit({ key: ip });
		return outcome.success;
	} catch (error) {
		console.warn("Login rate limiter unavailable", error);
		return true;
	}
}
