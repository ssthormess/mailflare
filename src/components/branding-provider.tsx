"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { BrandingContextValue } from "./branding-provider-types";
import { DEFAULT_BRANDING, fetchBranding } from "./branding-provider-utils";

const BrandingContext = createContext<BrandingContextValue | null>(null);

export function BrandingProvider({ children }: { children: React.ReactNode }) {
	const [branding, setBranding] = useState(DEFAULT_BRANDING);
	const [brandingLoaded, setBrandingLoaded] = useState(false);

	async function refreshBranding() {
		const nextBranding = await fetchBranding();
		setBranding(nextBranding);
		setBrandingLoaded(true);
		if (document.title === "Mailflare" || document.title === branding.appName) {
			document.title = nextBranding.appName;
		}
	}

	useEffect(() => {
		void refreshBranding();
	}, []);

	const iconUrl = branding.hasCustomIcon
		? `/api/branding/icon?v=${branding.iconVersion ?? "0"}`
		: "/icon-96.png";

	return (
		<BrandingContext.Provider value={{
			...branding,
			iconUrl,
			brandingLoaded,
			refreshBranding,
		}}>
			{children}
		</BrandingContext.Provider>
	);
}

export function useBranding() {
	return useContext(BrandingContext) ?? {
		...DEFAULT_BRANDING,
		iconUrl: "/icon-96.png",
		brandingLoaded: false,
		refreshBranding: async () => undefined,
	};
}
