import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { finishSection } from "./common.mjs";
import {
	MARKER_FILES,
	getMarkerContent,
	renderMarkerContent,
} from "../lib/model-profile-renderer.mjs";

export function inspectProfiles(root, context) {
	const catalogPath = join(root, "model-catalog.json");
	if (!existsSync(catalogPath)) {
		context.warn("profiles", "missing_catalog", "model-catalog.json is not present");
		return finishSection(context, "profiles", { status: "missing_catalog" });
	}

	let catalog;
	try {
		catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
	} catch (error) {
		context.fail("profiles", "invalid_catalog_json", `model-catalog.json is invalid JSON: ${error.message}`);
		return finishSection(context, "profiles", { status: "invalid_catalog_json" });
	}

	const antigravity = catalog?.antigravity;
	if (!antigravity) {
		context.fail("profiles", "missing_antigravity_section", "model-catalog.json missing antigravity section");
		return finishSection(context, "profiles", { status: "missing_antigravity_section" });
	}

	const activeProfile = antigravity.activeProfile;
	if (!activeProfile || typeof activeProfile !== "string") {
		context.fail("profiles", "missing_active_profile", "antigravity.activeProfile is missing or not a string");
		return finishSection(context, "profiles", { status: "missing_active_profile" });
	}

	const profile = antigravity.profiles?.[activeProfile];
	if (!profile) {
		context.fail("profiles", "unknown_active_profile", `activeProfile '${activeProfile}' not found in antigravity.profiles`);
		return finishSection(context, "profiles", { activeProfile, status: "unknown_active_profile" });
	}

	if (profile.status === "pending") {
		context.fail("profiles", "active_profile_pending", `activeProfile '${activeProfile}' has pending status`);
		return finishSection(context, "profiles", { activeProfile, status: "active_profile_pending" });
	}

	const checkedFiles = [];
	for (const fileInfo of MARKER_FILES) {
		const filePath = join(root, fileInfo.path);
		if (!existsSync(filePath)) {
			context.fail("profiles", "missing_marker_file", `Source file '${fileInfo.path}' not found`);
			continue;
		}
		const content = readFileSync(filePath, "utf8");
		for (const markerId of fileInfo.markers) {
			const current = getMarkerContent(content, markerId);
			if (current === null) {
				context.fail("profiles", "missing_marker", `Marker '${markerId}' missing in ${fileInfo.path}`);
				continue;
			}
			const expected = renderMarkerContent(markerId, profile, activeProfile);
			if (current.replace(/\r\n/g, "\n").trim() !== expected.replace(/\r\n/g, "\n").trim()) {
				context.fail("profiles", "marker_drift", `Marker '${markerId}' in ${fileInfo.path} drifted from profile '${activeProfile}'`);
			}
		}
		checkedFiles.push(fileInfo.path);
	}

	return finishSection(context, "profiles", {
		activeProfile,
		profileStatus: profile.status,
		checkedFiles,
	});
}
