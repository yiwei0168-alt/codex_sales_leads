/** Business reads whose returned evidence has an existing local source checker.
 * Discovery and virtual Skill listing are handled separately. */
export const READ_EVIDENCE_TOOLS=['knowledge_search','knowledge_facts','knowledge_compare','knowledge_originals','vectorless_read',
 'memory_read','memory_history_search','memory_observation_search','skill_read','mail_read','customer_timeline'] as const;
export const hasReadEvidenceContract=(tool:string)=>READ_EVIDENCE_TOOLS.some(id=>id===tool);
