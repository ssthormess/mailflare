"use client";

export function LoadingSpinner({ className = "" }: { className?: string }) {
	return (
		<progress
			aria-label="Loading"
			className={`loading-spinner ${className}`}
		/>
	);
}
