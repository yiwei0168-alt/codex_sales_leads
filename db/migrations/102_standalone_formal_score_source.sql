create unique index if not exists lead_search_run_standalone_score_source_unique
  on lead_search_run ((metadata->>'standaloneScoreSourceCallId'))
  where metadata ? 'standaloneScoreSourceCallId';
