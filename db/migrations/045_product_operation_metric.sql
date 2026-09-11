-- Non-lead operations also need durable usage, including before a workspace exists.
create table if not exists product_operation_metric (
 id uuid primary key,
 user_id uuid not null references app_user(id) on delete cascade,
 stage text not null,
 status text not null check(status in ('running','completed','failed')),
 metrics jsonb not null default '{}',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists product_operation_metric_owner_time on product_operation_metric(user_id,created_at desc);
alter table product_operation_metric enable row level security;
alter table product_operation_metric force row level security;
drop policy if exists product_operation_metric_owner on product_operation_metric;
create policy product_operation_metric_owner on product_operation_metric using(user_id=app_current_user_id()) with check(user_id=app_current_user_id());
grant select,insert,update,delete on product_operation_metric to network_copilot_app;
