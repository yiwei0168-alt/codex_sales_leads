-- Hide a conversation without discarding durable task, approval and provider receipts.
alter table assistant_conversation drop constraint if exists assistant_conversation_status_check;
alter table assistant_conversation add constraint assistant_conversation_status_check
  check (status in ('active', 'archived', 'deleted'));
