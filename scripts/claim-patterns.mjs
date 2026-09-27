// Canonical capability-claim patterns — single source for both guards:
//   awt-guard.mjs       (PreToolUse advisory)
//   stop_claim_guard.mjs (Stop/SubagentStop blocking)
// Add or retire a phrase HERE once; both guards pick it up.
// GUARD_PACK note: stop_claim_guard.mjs is canonically synced from lazyforensic —
// when syncing that file, sync this module with it.
export const CAPABILITY_CLAIM_SOURCES = [
	// Korean
	'즉시\\s*사용\\s*가능',
	'바로\\s*사용\\s*가능',
	'이제\\s*사용\\s*가능',
	'즉시\\s*실행\\s*가능',
	'바로\\s*쓸\\s*수',
	'정상\\s*작동(?!\\s*하지)(?!\\s*여부)', // 제외: 정상 작동하지 않는 / 작동 여부
	'모두\\s*정상\\s*작동',
	'전부\\s*정상',
	'완벽히?\\s*동일(?!한가)', // 제외: 완벽히 동일한가? (의문문)
	'완전히?\\s*동일',
	'완벽하게?\\s*(작동|호환)',
	// English
	'immediately\\s*(usable|available)',
	'ready\\s*to\\s*use',
	'usable\\s*now',
	'works?\\s*(now|perfectly|flawlessly)',
	'fully\\s*(supported|verified|compatible|identical|functional)',
	'verified\\s*(and\\s*)?(working|complete|correct)',
];

export const CAPABILITY_CLAIM_RE = new RegExp(`(?:${CAPABILITY_CLAIM_SOURCES.join('|')})`, 'i');
