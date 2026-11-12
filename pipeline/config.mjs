// All business constants in one place (spec §7–§10). Change a threshold here, nowhere else.

export const AGENCY_PIPELINE_NAME = 'Sales Pipeline';
export const AGENCY_TAG = 'dash-project';
export const EXPECTED_STAGES = [
  'Qualified Opt In', 'Disqualified', 'Booked call', 'Closed',
  'Cancelled', 'No Show', 'Follow Up', 'Lost',
];

export const VALUE_OUTLIER_MULTIPLIER = 5;   // A7: value > 5× median of non-zero values
export const MIN_LEADS_FOR_ADVICE = 20;      // small-sample rule
export const ADVICE_BAND = 0.25;             // ±25% around the pooled average
export const DROP_FAIL_SHARE = 0.20;         // B3
export const REMOVAL_WARN_SHARE = 0.40;      // B5
export const NEW_BADGE_DAYS = 7;

export const STAGE_GROUPS = {
  moving: ['Qualified Opt In', 'Booked call', 'Follow Up'],
  won: ['Closed'],
  dead: ['Disqualified', 'Cancelled', 'No Show', 'Lost'],
};
export const OPEN_STAGES = STAGE_GROUPS.moving;
export const DECIDED_STAGES = [...STAGE_GROUPS.won, ...STAGE_GROUPS.dead];

// "Reached at least" funnel (spec §9). Steps without `stages` are counted from leads/deals.
export const FUNNEL_STEPS = [
  { key: 'lead', label: 'Lead' },
  { key: 'pipeline', label: 'Entered pipeline' },
  { key: 'qualified', label: 'Qualified', stages: EXPECTED_STAGES.filter(s => s !== 'Disqualified') },
  { key: 'booked', label: 'Booked a call', stages: ['Booked call', 'Cancelled', 'No Show', 'Follow Up', 'Closed', 'Lost'] },
  { key: 'attended', label: 'Attended the call', stages: ['Follow Up', 'Closed', 'Lost'] },
  { key: 'won', label: 'Won', stages: ['Closed'] },
];

/**
 * Shared data shapes (see plan "Shared data shapes"):
 * Deal          { id, name, stage, status, value: number|null, originalValue: number|null, valueIgnored: boolean }
 * Lead          { id, name, email, source, deal: Deal|null }
 * RemovedRecord { id, name, maskedEmail, source, rule, reason, firstCaught: string|null }
 * IgnoredValue  { id, dealName, source, stage, value, reason, firstCaught: string|null }
 * WaterfallStep { rule, label, reason, removed, remaining }
 */
