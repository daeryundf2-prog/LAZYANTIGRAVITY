/**
 * confine-path.mjs — Lazy 공통 경로 격리 참조 구현 (Node ESM)
 *
 * 규칙 (모든 Lazy 레포 동일):
 *   1. lstat 기반 symlink/reparse point 거부
 *   2. realpath canonicalize
 *   3. 해소 경로가 허용 root 내부인지 검증
 *   4. TOCTOU 방지: 사용 시점에도 no-follow 재검증 권장
 *
 * imported manifest의 경로는 권한 부여가 아니라 데이터다.
 */
import fs from "node:fs";
import path from "node:path";

export class PathConfinementError extends Error {}

function isInside(resolved, root) {
	const rel = path.relative(root, resolved);
	return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function hasSymlinkComponent(candidate, root) {
	let current = candidate.isAbsolute() ? path.parse(candidate).root : process.cwd();
	for (const part of candidate.isAbsolute()
		? path.relative(path.parse(candidate).root, candidate).split(path.sep)
		: candidate.split(path.sep)) {
		current = path.join(current, part);
		try {
			if (fs.lstatSync(current).isSymbolicLink()) return true;
		} catch {
			return false; // 마지막 컴포넌트 미존재 허용 — 중간만 검사
		}
	}
	return false;
}

export function confinePath(p, allowedRoot, { mustExist = false } = {}) {
	const root = fs.realpathSync(allowedRoot);
	if (!fs.statSync(root).isDirectory()) {
		throw new PathConfinementError(`허용 root가 디렉터리가 아닙니다: ${root}`);
	}
	const cand = path.isAbsolute(p) ? path.normalize(p) : path.join(root, p);
	if (hasSymlinkComponent(cand, root)) {
		throw new PathConfinementError(`symlink 컴포넌트 포함 경로 거부: ${p}`);
	}
	let resolved;
	try {
		resolved = fs.realpathSync(cand);
	} catch {
		resolved = path.resolve(cand);
		if (mustExist) {
			throw new PathConfinementError(`경로가 존재하지 않습니다: ${resolved}`);
		}
	}
	if (!isInside(resolved, root)) {
		throw new PathConfinementError(
			`허용 root 밖 경로 거부: ${resolved} (root: ${root})`);
	}
	return resolved;
}

export function openNoFollow(p, allowedRoot) {
	const resolved = confinePath(p, allowedRoot, { mustExist: true });
	const O_NOFOLLOW = fs.constants?.O_NOFOLLOW ?? 0;
	return fs.openSync(resolved, fs.constants.O_RDONLY | O_NOFOLLOW);
}
