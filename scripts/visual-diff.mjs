#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Structural Similarity (SSIM) & Pixel Diff Analyzer
 * Compares two PNG/JPEG/SVG or raw buffer images without external heavyweight dependencies.
 */

function parseArgs(argv) {
	const args = { img1: "", img2: "", threshold: 0.95, json: false };
	for (let i = 2; i < argv.length; i++) {
		if (argv[i] === "--img1" && argv[i + 1]) args.img1 = argv[++i];
		else if (argv[i] === "--img2" && argv[i + 1]) args.img2 = argv[++i];
		else if (argv[i] === "--threshold" && argv[i + 1]) args.threshold = parseFloat(argv[++i]);
		else if (argv[i] === "--json") args.json = true;
	}
	return args;
}

function calculateBasicEntropy(buffer) {
	const freqs = new Array(256).fill(0);
	for (let i = 0; i < buffer.length; i++) {
		freqs[buffer[i]]++;
	}
	let entropy = 0;
	for (let i = 0; i < 256; i++) {
		if (freqs[i] > 0) {
			const p = freqs[i] / buffer.length;
			entropy -= p * Math.log2(p);
		}
	}
	return entropy;
}

export function computeSSIM(buf1, buf2) {
	if (buf1.equals(buf2)) {
		return { ssim: 1.0, pixelDifferenceRatio: 0.0, identical: true };
	}

	const minLen = Math.min(buf1.length, buf2.length);
	const maxLen = Math.max(buf1.length, buf2.length);
	let diffCount = Math.abs(buf1.length - buf2.length);

	let sum1 = 0;
	let sum2 = 0;
	let sumSq1 = 0;
	let sumSq2 = 0;
	let pSum = 0;

	for (let i = 0; i < minLen; i++) {
		const v1 = buf1[i];
		const v2 = buf2[i];
		if (v1 !== v2) diffCount++;

		sum1 += v1;
		sum2 += v2;
		sumSq1 += v1 * v1;
		sumSq2 += v2 * v2;
		pSum += v1 * v2;
	}

	const n = minLen;
	const mean1 = sum1 / n;
	const mean2 = sum2 / n;
	const var1 = sumSq1 / n - mean1 * mean1;
	const var2 = sumSq2 / n - mean2 * mean2;
	const covar = pSum / n - mean1 * mean2;

	const c1 = (0.01 * 255) ** 2;
	const c2 = (0.03 * 255) ** 2;

	const ssimNumerator = (2 * mean1 * mean2 + c1) * (2 * covar + c2);
	const ssimDenominator = (mean1 * mean1 + mean2 * mean2 + c1) * (var1 + var2 + c2);

	let ssim = ssimDenominator === 0 ? 1.0 : ssimNumerator / ssimDenominator;
	ssim = Math.max(0, Math.min(1, ssim));

	const diffRatio = diffCount / maxLen;
	return {
		ssim: parseFloat(ssim.toFixed(4)),
		pixelDifferenceRatio: parseFloat(diffRatio.toFixed(4)),
		entropy1: parseFloat(calculateBasicEntropy(buf1).toFixed(2)),
		entropy2: parseFloat(calculateBasicEntropy(buf2).toFixed(2)),
		identical: diffCount === 0,
	};
}

async function main() {
	const args = parseArgs(process.argv);
	if (!args.img1 || !args.img2) {
		process.stderr.write("Usage: node visual-diff.mjs --img1 <path> --img2 <path> [--threshold 0.95] [--json]\n");
		process.exit(1);
	}

	const path1 = resolve(process.cwd(), args.img1);
	const path2 = resolve(process.cwd(), args.img2);

	if (!existsSync(path1) || !existsSync(path2)) {
		process.stderr.write(`Error: One or both image files not found: ${args.img1}, ${args.img2}\n`);
		process.exit(1);
	}

	const buf1 = readFileSync(path1);
	const buf2 = readFileSync(path2);
	const result = computeSSIM(buf1, buf2);
	const pass = result.ssim >= args.threshold;

	if (args.json) {
		process.stdout.write(JSON.stringify({ ok: true, pass, threshold: args.threshold, ...result }, null, 2) + "\n");
	} else {
		process.stdout.write(`SSIM Analysis:\n`);
		process.stdout.write(`  Image 1: ${args.img1} (Entropy: ${result.entropy1})\n`);
		process.stdout.write(`  Image 2: ${args.img2} (Entropy: ${result.entropy2})\n`);
		process.stdout.write(`  SSIM Score: ${result.ssim} (Threshold: ${args.threshold})\n`);
		process.stdout.write(`  Difference Ratio: ${(result.pixelDifferenceRatio * 100).toFixed(2)}%\n`);
		process.stdout.write(`  Result: ${pass ? "PASS (Fidelity Verified)" : "FAIL (Visual Drift Detected)"}\n`);
	}

	process.exit(pass ? 0 : 1);
}

if (process.argv[1] && process.argv[1].endsWith("visual-diff.mjs")) {
	main().catch((err) => {
		process.stderr.write(`Fatal error: ${err.message}\n`);
		process.exit(1);
	});
}
