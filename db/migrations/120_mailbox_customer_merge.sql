alter table mailbox_customer add column if not exists merged_into uuid;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='mailbox_customer_merge_owner_fk') then
  alter table mailbox_customer add constraint mailbox_customer_merge_owner_fk foreign key(user_id,merged_into) references mailbox_customer(user_id,id);
 end if;
end $$;
