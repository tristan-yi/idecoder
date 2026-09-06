import type {
  AgentProposal,
  ReviewSession,
  ReviewVerdict,
  SessionReport,
} from "./types";

export type Tally = {
  reviewed: number;
  plantedTotal: number;
  caught: number;
  missed: number;
  falseAlarms: number;
  acceptedDefective: number;
  cleanAccepted: number;
};

/**
 * Local tally shown while a session is in progress. `caught` leans on the
 * keyword heuristic; the end-of-session grade can revise it.
 */
export function tally(
  proposals: AgentProposal[],
  verdicts: ReviewVerdict[],
): Tally {
  const byId = new Map(proposals.map((p) => [p.id, p]));
  let plantedTotal = 0;
  let caught = 0;
  let falseAlarms = 0;
  let acceptedDefective = 0;
  let cleanAccepted = 0;

  for (const verdict of verdicts) {
    const proposal = byId.get(verdict.proposalId);
    if (!proposal) continue;

    if (proposal.planted) {
      plantedTotal += 1;
      if (verdict.caughtHeuristic) caught += 1;
      if (verdict.decision === "accept") acceptedDefective += 1;
    } else if (verdict.decision === "accept") {
      cleanAccepted += 1;
    } else {
      falseAlarms += 1;
    }
  }

  return {
    reviewed: verdicts.length,
    plantedTotal,
    caught,
    missed: plantedTotal - caught,
    falseAlarms,
    acceptedDefective,
    cleanAccepted,
  };
}

export function scenarioProgress(session: ReviewSession) {
  const run = session.lastRun;
  if (!run) return { passing: 0, total: session.scenarios.length, hasRun: false };
  return {
    passing: run.scenarios.filter((s) => s.pass).length,
    total: run.scenarios.length || session.scenarios.length,
    hasRun: true,
  };
}

/** Used when the model is unavailable so a session can still be closed out. */
export function localReport(session: ReviewSession): SessionReport {
  const counts = tally(session.proposals, session.verdicts);
  const strengths: string[] = [];
  const improvements: string[] = [];

  if (counts.caught > 0) {
    strengths.push(
      `Named the planted defect in ${counts.caught} of ${counts.plantedTotal} suggestions that had one.`,
    );
  }
  if (counts.cleanAccepted > 0) {
    strengths.push(
      `Accepted ${counts.cleanAccepted} clean suggestion${counts.cleanAccepted === 1 ? "" : "s"} without inventing a problem.`,
    );
  }
  if (counts.missed > 0) {
    improvements.push(
      `Missed ${counts.missed} planted defect${counts.missed === 1 ? "" : "s"}. Read the diff against the neighbouring handlers before deciding.`,
    );
  }
  if (counts.acceptedDefective > 0) {
    improvements.push(
      `Accepted ${counts.acceptedDefective} suggestion${counts.acceptedDefective === 1 ? "" : "s"} that carried a defect.`,
    );
  }
  if (counts.falseAlarms > 0) {
    improvements.push(
      `Pushed back on ${counts.falseAlarms} suggestion${counts.falseAlarms === 1 ? "" : "s"} that were actually fine.`,
    );
  }

  return {
    generatedAt: Date.now(),
    plantedTotal: counts.plantedTotal,
    caught: counts.caught,
    missed: counts.missed,
    falseAlarms: counts.falseAlarms,
    reviewedTotal: counts.reviewed,
    grades: [],
    summary:
      counts.reviewed === 0
        ? "No suggestions were reviewed in this session."
        : `Reviewed ${counts.reviewed} suggestion${counts.reviewed === 1 ? "" : "s"} and caught ${counts.caught} of ${counts.plantedTotal} planted defects.`,
    strengths,
    improvements,
  };
}
