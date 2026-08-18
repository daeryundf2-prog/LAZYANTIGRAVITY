#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const command = args[0] || "help";

function printHelp() {
	console.log(`
Ultra-Research & Insane-Search CLI Helper

Usage:
  node scripts/ultra-research.mjs <command> [options]

Commands:
  decompose "<topic>"                  Decompose research topic into orthogonal 3-wave subagent questions
  insane-query "<keyword>"             Generate 12-channel search queries (REST, RSS, Operators, APIs)
  validate-ledger <ledger.json>        Verify that all claims in ledger satisfy 2+ domain & counter-search locks
  help                                 Show this help message
`);
}

function decomposeTopic(topic) {
	if (!topic || !topic.trim()) {
		console.error("Error: Topic is required for decomposition.");
		process.exit(1);
	}
	const clean = topic.trim();
	const waves = {
		topic: clean,
		waves: [
			{
				wave: 1,
				role: "Architecture & Specification Scout",
				model: "flash",
				focus: "Official specifications, RFCs, release notes, primary documentation",
				queries: [
					`"${clean}" RFC specification official documentation`,
					`site:github.com "${clean}" README.md release notes`,
					`site:developer.mozilla.org OR site:docs.python.org OR site:go.dev "${clean}"`
				]
			},
			{
				wave: 2,
				role: "Real-World Benchmark & Implementation Scout",
				model: "flash",
				focus: "Empirical benchmarks, production case studies, memory/latency tradeoffs",
				queries: [
					`"${clean}" benchmark performance comparison latency throughput`,
					`"${clean}" production case study postmortem`,
					`site:huggingface.co/papers OR site:arxiv.org "${clean}"`
				]
			},
			{
				wave: 3,
				role: "Adversarial Falsification & Edge Case Scout",
				model: "flash",
				focus: "Known bugs, gotchas, failure modes, counter-evidence",
				queries: [
					`"${clean}" issue bug limit failure gotcha`,
					`site:news.ycombinator.com OR site:reddit.com "${clean}" problem flaw`,
					`"${clean}" vs alternative why not`
				]
			}
		]
	};
	console.log(JSON.stringify(waves, null, 2));
}

function generateInsaneQueries(keyword) {
	if (!keyword || !keyword.trim()) {
		console.error("Error: Keyword is required.");
		process.exit(1);
	}
	const kw = keyword.trim();
	const channels = {
		keyword: kw,
		channels: {
			advancedOperators: [
				`"${kw}" filetype:pdf (paper OR report OR specification)`,
				`intitle:"${kw}" (benchmark OR evaluation OR architecture)`,
				`site:github.com inpath:releases "${kw}"`
			],
			jinaReader: [
				`https://r.jina.ai/https://en.wikipedia.org/wiki/${encodeURIComponent(kw)}`,
				`https://r.jina.ai/https://github.com/topics/${encodeURIComponent(kw)}`
			],
			jsonApis: [
				`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(kw)}&tags=story`,
				`https://www.reddit.com/r/programming/search.json?q=${encodeURIComponent(kw)}&restrict_sr=1`
			],
			academicAndRegistry: [
				`https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(kw)}&max_results=5`,
				`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(kw)}&size=5`
			]
		}
	};
	console.log(JSON.stringify(channels, null, 2));
}

function validateClaimLedger(ledgerPath) {
	const absPath = resolve(process.cwd(), ledgerPath);
	if (!existsSync(absPath)) {
		console.error(`Error: Ledger file not found at ${absPath}`);
		process.exit(1);
	}
	try {
		const raw = readFileSync(absPath, "utf8");
		const ledger = JSON.parse(raw);
		const claims = Array.isArray(ledger.claims) ? ledger.claims : Array.isArray(ledger) ? ledger : [];
		
		const results = [];
		let passCount = 0;

		for (const c of claims) {
			const domains = new Set(
				(c.sources || []).map((s) => {
					try {
						return new URL(s).hostname;
					} catch {
						return s;
					}
				})
			);
			const hasMultiDomain = domains.size >= 2;
			const hasCounterSearch = Boolean(c.counterSearchPerformed);
			const hasPrimary = Boolean(c.primarySource);
			const isLocked = hasMultiDomain && hasCounterSearch && hasPrimary;

			if (isLocked) passCount++;
			results.push({
				claimId: c.id || c.claim,
				claim: c.claim,
				independentDomains: Array.from(domains),
				multiDomainPass: hasMultiDomain,
				counterSearchPass: hasCounterSearch,
				primarySourcePass: hasPrimary,
				gateStatus: isLocked ? "LOCKED_PASS" : "REJECTED_TO_ANNEX"
			});
		}

		console.log(JSON.stringify({
			totalClaims: claims.length,
			passedClaims: passCount,
			rejectedClaims: claims.length - passCount,
			allPass: passCount === claims.length,
			claims: results
		}, null, 2));
	} catch (err) {
		console.error(`Error validating ledger: ${err.message}`);
		process.exit(1);
	}
}

switch (command) {
	case "decompose":
		decomposeTopic(args.slice(1).join(" "));
		break;
	case "insane-query":
		generateInsaneQueries(args.slice(1).join(" "));
		break;
	case "validate-ledger":
		validateClaimLedger(args[1] || "");
		break;
	case "help":
	case "--help":
	case "-h":
	default:
		printHelp();
		break;
}
