export type RuleMatchInput = {
	toAddress: string;
	fromAddress?: string | null;
	subject?: string | null;
	content?: string | null;
};

type MatchableRule = {
	pattern: string;
	matchField?: string | null;
	matchOperator?: string | null;
	matchValue?: string | null;
};

type ForwardRule = MatchableRule & {
	id: string;
	action: string;
	forwardTo?: string | null;
	keepCopy?: boolean | null;
	enabled?: boolean | null;
};

export function matchesRule(rule: MatchableRule, input: RuleMatchInput): boolean {
	const rawValue = (rule.matchValue || rule.pattern).trim();
	// "*" is the catch-all pattern used by catch-all and block-everything rules.
	if (rawValue === "*") return true;
	const normalizedRuleValue = normalizeRuleComparisonValue(rule.matchField, rawValue);
	if (!normalizedRuleValue) return false;

	const values = getRuleFieldValues(rule.matchField, input);
	return values.some((value) => {
		if (!value) return false;
		const normalizedValue = normalizeRuleComparisonValue(rule.matchField, value);
		if (!normalizedValue) return false;
		return compareRuleValue(rule.matchOperator, normalizedValue, normalizedRuleValue, rawValue);
	});
}

export function resolveMailboxForwardRule<TMailbox>(
	mailbox: TMailbox,
	rules: readonly ForwardRule[],
	input: RuleMatchInput,
	suppressForward = false,
) {
	if (suppressForward) return null;

	const rule = rules.find((candidate) =>
		candidate.enabled !== false
		&& candidate.action === "forward"
		&& !!candidate.forwardTo?.trim()
		&& matchesRule(candidate, input),
	);
	if (!rule?.forwardTo) return null;

	const keepCopy = !!rule.keepCopy;
	return {
		action: "forward" as const,
		forwardTo: rule.forwardTo.trim(),
		keepCopy,
		...(keepCopy ? { mailbox } : {}),
		ruleId: rule.id,
	};
}

function compareRuleValue(
	operator: string | null | undefined,
	value: string,
	ruleValue: string,
	rawRuleValue: string,
): boolean {
	switch (operator) {
		case "exact":
			return value === ruleValue;
		case "starts_with":
			return value.startsWith(ruleValue);
		case "ends_with":
			return value.endsWith(ruleValue);
		case "regex":
			return matchesRegex(value, rawRuleValue);
		default:
			return value.includes(ruleValue);
	}
}

/** An invalid operator-authored pattern must not stop inbound mail processing. */
function matchesRegex(value: string, pattern: string): boolean {
	try {
		return new RegExp(pattern, "i").test(value);
	} catch {
		return false;
	}
}

function normalizeRuleComparisonValue(field: string | null | undefined, value: string | null | undefined): string {
	if (!value) return "";
	if (field === "email" || field === "sender" || field === "recipient") {
		const address = value.match(/<\s*([^<>]+)\s*>/)?.[1] ?? value;
		return address.trim().toLowerCase();
	}
	return value.toLowerCase();
}

function getRuleFieldValues(field: string | null | undefined, input: RuleMatchInput) {
	if (field === "content") return [input.content];
	if (field === "title") return [input.subject];
	if (field === "sender") return [input.fromAddress];
	if (field === "recipient") return [input.toAddress];
	return [input.fromAddress, input.toAddress];
}
