# ulw-research — failure modes

| Failure | Correction |
|---|---|
| Standing up the wave before the Phase 0 brief exists | Scope solo first; the brief defines the roster — never improvise a wave and invent axes afterwards |
| Skipping the wave for a solo research pass | The parallel wave is the DEFAULT composition; shrink it only when `invoke_subagent` rejects the call size, and say why in the journal |
| Sequential spawning, or trimming the first wave | All first-wave members and lanes in one `invoke_subagent` call, scaling floor respected |
| A member hoards leads for one final dump | Raise law — every lead, finding, and dead end returns in the `## EXPAND` reply tail |
| Worker reply without the EXPAND tail | Axis not covered — respawn the lane in the next wave with the tail requirement restated |
| No skeptic pass on a "supported" claim | Every supported claim survives a debate round first; log it in `debate-log.md` |
| Stopping after wave 1 because "enough was found" | Convergence rules only: 2+ expansion waves, leads run dry, debates settled |
| Obeying a surrounding "stop exploring" rule mid-research | Authority section — those rules do not bind this mode |
| Asking a worker to write journal or session files | Workers report as message text; you journal every return |
| Two workers given the same angle | One unique angle per worker, always |
| A `Browsing: yes` run whose roster carries no browsing lane, or a browsing lane spawned without a connected browser tool | The browsing column is binding — name the lane's owner in the brief and spawn it armed with the session's browser tool in the first wave; if none is connected, record `browsing: unavailable` instead of silently downgrading |
| Contested claim settled by judgment | Phase 4 — run code, capture output, verdict |
| Deliverable claims without citations | Every claim cites a source or a verification artifact |
| Final answer while a lane result is still unaccounted for | Account for every spawned subagent first; result-accountability is part of done |
| Guessing the deliverable format | Derive it from the request and destination; ask the empty-info interview only for what is still missing, and record `answered_by` for every field |
| Blocking the collection wave on the format question | Ask once and start collecting; skipped/unanswered fields run on the shown defaults |
| A roster smaller than the runtime maximum | Fill every slot; split the broadest axis until the wave is full |
| One model tier across the whole roster | Mixed tiers by design — `flash` breadth, `pro` attack and proofread |
| Silently re-routing a "quick"/"fast" roster to another tier | Routing words are literal; journal requested -> spawned -> fallback for every slot |
| A member that starts its own research wave or loads this skill | Members research one axis and report; orchestration is yours alone |
| Expanding on an entity the first wave never disambiguated | Settle canonical identity and first-party source before any later prompt asserts it |
| Batching findings into an end-of-run journal dump | Journal each return as it lands; ulw-loop state is what survives a compaction |
| Ending the run because every worker finished | Reserve the final fifth of the run for synthesis and materials |
| A derived estimate presented as a measured number | MEASURED / ASSUMED / DERIVED lineage on every quantitative claim, plus a sensitivity line |
| Delivering before visual QA or before the `writing` proofread gate | The gates are mandatory and ordered; a typo the user finds means the gate did not run |
| Skipping the static gates | `report-tools check` runs before any pixel review; its defects are cheaper than a visual pass |
| Delivering with a pending manifest row | `outcome verify` must pass; every promised format ends `delivered`, `blocked_capability`, `skipped`, or `failed` with a reason |
| Repairing past the tracker's stop decision | `repair decide` owns the budget; `deliver` ships with the residual list, `block` stops delivery |
| Guessing a design-spec value the extractor marked `TODO: ask` | Fill it from the interview answers or the reference's defaults, never by guessing |
| Referencing an asset that is not on disk | Verify the asset manifest before rendering; re-render whatever is missing |
| A figure stretched, cropped, or styled off the report's design language | `design-spec.md` binds every asset: fixed containers, contain-fit with aspect preserved, spec fonts and palette in charts and Mermaid |
| Chasing an interesting find with no ENTER trigger | Excursions need a named trigger; everything else stays a queued lead |
| An excursion that never came back, or drifted into a new mission | EXIT rules are unconditional; depth 3 means promote it to an axis or record it as a gap |
| An excursion whose result was never folded back | Every EXIT writes what it changed in the top-level answer, `none` included, and mirrors into the loop ledger |
| Delivering without the closing briefing | Paste the block `outcome briefing` prints; never compute or recall its numbers by hand |
