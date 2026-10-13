'use strict';
const PLANNED_RUNS = 10;
function reliabilitySummary(evidence) {
  const successful = evidence.runs.filter(run => run.roundTripPassed);
  const initialReports = successful.filter(run => run.cli.initialCompletedAck).length;
  const nudgeAttempts = evidence.runs.filter(run => run.cli?.nudgeUsed).length;
  const completed = evidence.runs.length === PLANNED_RUNS && evidence.runs.every((run, index) => run.index === index + 1) && !evidence.stoppedReason;
  return {
    plannedRuns: PLANNED_RUNS,
    attemptedRuns: evidence.runs.length,
    initialReports,
    reportsWithinNudgeBudget: successful.length,
    nudgeAttempts,
    nudgedRecoveries: successful.filter(run => run.cli.nudgeUsed).length,
    complete: completed,
    reportingThresholdsMet: completed && evidence.selectedConfigsUnchanged === true && initialReports >= 9 && successful.length === PLANNED_RUNS,
  };
}
module.exports = { PLANNED_RUNS, reliabilitySummary };
