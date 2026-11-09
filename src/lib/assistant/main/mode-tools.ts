import type { AgentMode } from './mode-prompts';

const quick = new Set(`knowledge_search knowledge_facts knowledge_status knowledge_library_list knowledge_revision_list knowledge_originals memory_read memory_history_search memory_observation_search vectorless_start vectorless_search vectorless_browse vectorless_read vectorless_aggregate vectorless_filter vectorless_v3_candidates customer_timeline company_assessment_read company_correspondence_list relationship_list contacts_candidate_list mailbox_knowledge_list company_search company_read mail_history mail_read`.split(' '));
const research = new Set(`lead_workflow relationship_analyze contacts_lookup contacts_verify_evaluate contacts_verify_publish company_research evidence_collect role_correct company_score score_review company_score_publish market_plan`.split(' '));
// Script and scheduled arbitrary instructions can escape mode limits through nested work.
const indirect = new Set(['skill_script','schedule_create','schedule_control']);
export function modeAllowsTool(mode: AgentMode | undefined, id: string): boolean {
  // Wrappers recheck every leaf through the ordinary dispatcher and same mode.
  if(id==='workflow_read'||id==='programmatic_read'||id==='programmatic_tools')return true;
  if(id==='mailbox_message_list')return true; // Same-account local metadata; dispatcher and replay guards still apply.
  if (!mode || mode==='deep') return true; // Historical jobs retain their original contract.
  if (mode==='quick') return quick.has(id)||id==='knowledge_compare';
  return !research.has(id)&&!indirect.has(id);
}
