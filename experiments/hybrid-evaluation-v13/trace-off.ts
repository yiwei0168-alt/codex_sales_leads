import {resolve} from 'node:path';
// Evaluation process only, loaded before graph imports. No .env/production change.
process.env.LANGSMITH_TRACING='false';
process.env.LANGCHAIN_TRACING_V2='false';
process.env.LANGCHAIN_TRACING='false';

// Isolated candidate experiment only; production default remains v4.
process.env.HYBRID_PROGRAM_CONTEXT_VERSION='v7';

process.env.HYBRID_COMPACT_CATALOG='1';

process.env.HYBRID_INTERPRETER_PROFILE='deep';

process.env.HYBRID_KNOWLEDGE_DISCOVERY='1';

process.env.HYBRID_PROGRAM_SEGMENT_PLANNING='1';
process.env.KNOWLEDGE_STORAGE_ROOT=resolve('.local-runtime/hybrid-knowledge-originals-v2/files');
