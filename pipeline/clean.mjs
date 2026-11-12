// One call that turns raw GHL data into the cleaned result the rest of the pipeline uses.
import { applyRemovalRules } from './rules.mjs';
import { buildLeads } from './annotate.mjs';

/**
 * @param {boolean} [opts.raw] Stage 1 preview: decide scope (A1) only, clean nothing.
 * @returns CleanResult (see plan "Shared data shapes")
 */
export function cleanData(rawData, ctx, { raw = false } = {}) {
  const removal = applyRemovalRules(rawData, ctx, { scopeOnly: raw });
  const { leads, ignoredValues, annotations } = buildLeads(removal.kept, ctx, { raw });
  const contactIds = new Set(rawData.contacts.map(c => c.id));
  annotations.orphanDeals = rawData.opportunities
    .filter(o => o.pipelineId === ctx.pipelineId && !contactIds.has(o.contactId)).length;
  return {
    leads,
    removed: removal.removed,
    removedA1Count: removal.removedA1Count,
    scopeCount: removal.scopeCount,
    waterfall: removal.waterfall,
    ignoredValues,
    annotations,
  };
}
