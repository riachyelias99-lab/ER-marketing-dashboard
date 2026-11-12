// Small, readable test data builders. Default contact = a clean agency lead.
import { EXPECTED_STAGES } from '../pipeline/config.mjs';

export const SP = 'sp';
export const stageId = name => `s${EXPECTED_STAGES.indexOf(name) + 1}`;

let seq = 0;
export function makeContact(overrides = {}) {
  const id = overrides.id ?? `c${++seq}`;
  return {
    id, contactName: `person ${id}`, email: `${id}@example.com`, phone: null, companyName: null,
    source: 'Referral', tags: ['dash-project'], dateAdded: '2026-09-04T10:00:00.000Z', ...overrides,
  };
}

export function makeOpp(overrides = {}) {
  const id = overrides.id ?? `o${++seq}`;
  const { stage, ...rest } = overrides;
  return {
    id, name: `Deal ${id}`, monetaryValue: 5000, pipelineId: SP,
    pipelineStageId: stageId(stage ?? 'Qualified Opt In'), status: 'open', source: null, contactId: null, ...rest,
  };
}

export function makeRaw({ contacts = [], opps = [], stages = EXPECTED_STAGES } = {}) {
  return {
    pipelines: [
      { id: SP, name: 'Sales Pipeline', stages: stages.map((name, i) => ({ id: `s${i + 1}`, name })) },
      { id: 'other', name: 'Someone Else Pipeline', stages: [{ id: 'x1', name: 'New' }] },
    ],
    contacts,
    opportunities: opps,
    totals: { contacts: contacts.length, opportunities: opps.length },
  };
}
