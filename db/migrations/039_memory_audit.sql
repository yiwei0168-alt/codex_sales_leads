create table if not exists user_memory_audit (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references app_user(id) on delete cascade,
 memory_id uuid not null,
 operation text not null check(operation in ('INSERT','UPDATE','DELETE')),
 changed_fields text[] not null,
 before_state jsonb, after_state jsonb,
 created_at timestamptz not null default clock_timestamp()
);
create index if not exists user_memory_audit_owner on user_memory_audit(user_id,created_at desc,id desc);
alter table user_memory_audit enable row level security;
alter table user_memory_audit force row level security;
drop policy if exists user_memory_audit_owner on user_memory_audit;
create policy user_memory_audit_owner on user_memory_audit
 using(user_id=app_current_user_id()) with check(user_id=app_current_user_id());
grant select,insert on user_memory_audit to network_copilot_app;

-- No title, body, embedding or arbitrary context is copied into historical audit.
create or replace function audit_private_memory_change() returns trigger language plpgsql as $$
declare previous jsonb; following jsonb; changed text[]; key text;
begin
 if TG_OP <> 'INSERT' then
  previous := jsonb_build_object('kind',OLD.kind,'status',OLD.status,'usageScope',OLD.usage_scope,
    'marketCodes',OLD.market_codes,'channelRoles',OLD.channel_roles,'contentCharacters',char_length(OLD.content));
 end if;
 if TG_OP <> 'DELETE' then
  following := jsonb_build_object('kind',NEW.kind,'status',NEW.status,'usageScope',NEW.usage_scope,
    'marketCodes',NEW.market_codes,'channelRoles',NEW.channel_roles,'contentCharacters',char_length(NEW.content));
 end if;
 changed := '{}';
 if TG_OP='UPDATE' then
  foreach key in array array['title','content','kind','status','usage_scope','market_codes','channel_roles','context','embedding'] loop
   if (to_jsonb(OLD)->key) is distinct from (to_jsonb(NEW)->key) then changed:=array_append(changed,key); end if;
  end loop;
  if cardinality(changed)=0 then return NEW; end if;
 else changed:=array[TG_OP]; end if;
 insert into user_memory_audit(user_id,memory_id,operation,changed_fields,before_state,after_state)
 values(case when TG_OP='DELETE' then OLD.user_id else NEW.user_id end,
   case when TG_OP='DELETE' then OLD.id else NEW.id end,TG_OP,changed,previous,following);
 if TG_OP='DELETE' then return OLD; end if;
 return NEW;
end $$;
drop trigger if exists private_memory_audit on user_outreach_memory;
create trigger private_memory_audit after insert or update or delete on user_outreach_memory
 for each row execute function audit_private_memory_change();
