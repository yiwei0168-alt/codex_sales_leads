alter table contact_verification_run drop constraint if exists contact_verification_run_target_count_check;
alter table contact_verification_run
  add constraint contact_verification_run_target_count_check check (target_count between 1 and 1000);
