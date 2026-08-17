alter table mailbox_message alter column content_ciphertext set not null;

do $$ begin
  alter table mailbox_message add constraint mailbox_message_plaintext_cleared_check
    check (subject = '' and body_text = '' and sender = '[]'::jsonb and recipients = '[]'::jsonb);
exception when duplicate_object then null;
end $$;
