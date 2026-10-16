-- Account-local customer timeline and list sources; no new table-write grants.
create or replace function lock_skill_timeline_sources(customer_ids uuid[], include_all boolean) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid; locked_ids uuid[]; message_ids uuid[]; locked_count integer;
begin
 actor=public.app_current_user_id();
 if actor is null or include_all is null or customer_ids is null or cardinality(customer_ids)>100
  or array_position(customer_ids,null) is not null
  or cardinality(customer_ids)<>(select count(distinct value) from unnest(customer_ids) as value) then
  raise exception 'Invalid Skill timeline lock request';
 end if;
 if not include_all and cardinality(customer_ids)=0 then return 0; end if;
 -- Lists include all customers in their country counts. The owner FK fences new customers.
 if include_all then perform id from public.app_user where id=actor for update;
 else perform id from public.app_user where id=actor for share; end if;
 if not found then raise exception 'Skill timeline owner unavailable'; end if;
 select coalesce(array_agg(id order by id),'{}'::uuid[]) into locked_ids from public.mailbox_customer
 where user_id=actor and (include_all or id=any(customer_ids));
 if not (customer_ids <@ locked_ids) then raise exception 'Skill timeline customer unavailable'; end if;
 if not include_all and cardinality(locked_ids)<>cardinality(customer_ids) then raise exception 'Skill timeline customer unavailable'; end if;
 perform id from public.mailbox_customer where user_id=actor and id=any(locked_ids) order by id for update;
 get diagnostics locked_count=row_count;
 if locked_count<>cardinality(locked_ids) then raise exception 'Skill timeline customer unavailable'; end if;
 -- Customer UPDATE locks fence new links through their composite FK.
 perform customer_id,message_id from public.mailbox_customer_message where user_id=actor and customer_id=any(locked_ids)
 order by customer_id,message_id for share;
 select coalesce(array_agg(distinct message_id order by message_id),'{}'::uuid[]) into message_ids
 from public.mailbox_customer_message where user_id=actor and customer_id=any(locked_ids);
 -- Message UPDATE locks fence new notes through their composite FK.
 perform id from public.mailbox_message where user_id=actor and id=any(message_ids) order by id for update;
 perform message_id from public.mailbox_timeline_note where user_id=actor and message_id=any(message_ids) order by message_id for share;
 return locked_count;
end $$;
revoke all on function lock_skill_timeline_sources(uuid[],boolean) from public,network_copilot_app,network_copilot_skill_collector;
grant execute on function lock_skill_timeline_sources(uuid[],boolean) to network_copilot_app;
