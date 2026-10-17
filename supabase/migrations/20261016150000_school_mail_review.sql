-- School email is a proposal until an authenticated adult saves it.
-- No importer, model output or browser write can approve a review.
alter table public.captures add column if not exists review_required boolean not null default false;
drop index if exists public.captures_email_message_idx;
create unique index captures_email_message_idx on public.captures(household_id, source_key) where kind = 'email';

create or replace function public.school_mail_can_review(p_household uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
    and not exists(select 1 from public.family_members where auth_user_id=auth.uid()
      and lower(coalesce(role_label,'')) in ('child','kid'))
    and exists(select 1 from public.household_members where household_id=p_household
      and user_id=auth.uid() and status='active' and role in ('owner','admin','member'));
$$;
revoke all on function public.school_mail_can_review(uuid) from public, anon;
grant execute on function public.school_mail_can_review(uuid) to authenticated, service_role;

create table public.school_mail_reviews (
  capture_id uuid primary key references public.captures(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  status text not null check(status in ('processing','failed','ready','saved','dismissed')),
  proposal jsonb not null default '{"items":[],"gaps":[]}',
  processing_token uuid,
  updated_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  result jsonb
);
alter table public.school_mail_reviews enable row level security;
create policy school_mail_review_read on public.school_mail_reviews for select to authenticated
  using (public.school_mail_can_review(household_id));
revoke all on public.school_mail_reviews from anon, authenticated;
grant select on public.school_mail_reviews to authenticated;
grant all on public.school_mail_reviews to service_role;

-- School mail contains full source messages: never expose it to a paired display.
drop policy if exists captures_owner on public.captures;
create policy captures_owner on public.captures for select to authenticated using (
  auth.uid()=user_id and (kind<>'email' or public.school_mail_can_review(household_id)));
drop policy if exists captures_household_read on public.captures;
create policy captures_household_read on public.captures for select to authenticated using (
  household_id is not null and case when kind='email' then public.school_mail_can_review(household_id)
    else public.users_share_household(auth.uid(),user_id) end);
drop policy if exists captures_household_review on public.captures;
create policy captures_household_review on public.captures for update to authenticated
  using (not review_required and public.school_mail_can_review(household_id))
  with check (not review_required and public.school_mail_can_review(household_id));

create or replace function public.ensure_inbound_token(p_household uuid)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare token text;
begin
  if not public.school_mail_can_review(p_household) then raise exception 'An adult household account is required' using errcode='42501'; end if;
  update public.households set inbound_token=coalesce(inbound_token,left(gen_random_uuid()::text,8)||right(gen_random_uuid()::text,8)) where id=p_household returning inbound_token into token;
  return token;
end $$;
revoke all on function public.ensure_inbound_token(uuid) from public,anon;
grant execute on function public.ensure_inbound_token(uuid) to authenticated;

create or replace function public.school_mail_overview(p_enable boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare hh uuid; token text; people jsonb; messages jsonb;
begin
  select household_id into hh from public.household_members where user_id=auth.uid() and status='active'
    and role in ('owner','admin','member') order by created_at limit 1;
  if hh is null or not public.school_mail_can_review(hh) then
    return jsonb_build_object('householdId',null,'address',null,'members','[]'::jsonb,'messages','[]'::jsonb);
  end if;
  if p_enable then token:=public.ensure_inbound_token(hh);
  else select inbound_token into token from public.households where id=hh; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name) order by f.display_order),'[]'::jsonb) into people
    from public.family_members f where f.member_type='core' and exists(select 1 from public.household_members m
      where m.household_id=hh and m.user_id=f.user_id and m.status='active' and m.role<>'display');
  select coalesce(jsonb_agg(to_jsonb(msg) order by msg."createdAt" desc),'[]'::jsonb) into messages from (
    select c.id,c.subject,c.source_label as "sourceLabel",c.created_at as "createdAt",
      left(c.raw_text,60000) as "sourceText",coalesce(r.status,case when c.review_required then 'processing' else 'legacy' end) as status,
      r.proposal,r.result,case when c.status='failed' then 'Could not read this email. Try again.' else null end as error
    from public.captures c left join public.school_mail_reviews r on r.capture_id=c.id
    where c.household_id=hh and c.kind='email' order by (r.status='ready') desc nulls last,c.created_at desc limit 40
  ) msg;
  return jsonb_build_object('householdId',hh,'address',case when token is not null then token||'@symphony-os.com' end,'members',people,'messages',messages);
end $$;
revoke all on function public.school_mail_overview(boolean) from public,anon;
grant execute on function public.school_mail_overview(boolean) to authenticated;

-- A renewable processing lease prevents parallel deliveries from invoking AI twice.
create or replace function public.claim_school_mail_review(p_capture uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.captures; r public.school_mail_reviews; lease uuid:=gen_random_uuid();
begin
  select * into c from public.captures where id=p_capture for update;
  if not found or c.kind<>'email' or c.household_id is null then raise exception 'Not a school email'; end if;
  if c.status='extracted' and not c.review_required then return null; end if; -- already imported by the old path
  select * into r from public.school_mail_reviews where capture_id=p_capture;
  if found and (r.status in ('ready','saved','dismissed') or (r.status='processing' and r.updated_at>now()-interval '5 minutes')) then return null; end if;
  insert into public.school_mail_reviews(capture_id,household_id,status,processing_token)
    values(c.id,c.household_id,'processing',lease)
    on conflict(capture_id) do update set status='processing',processing_token=lease,updated_at=now();
  update public.captures set review_required=true,status='pending',error=null where id=c.id;
  return lease;
end $$;
revoke all on function public.claim_school_mail_review(uuid) from public,anon,authenticated;
grant execute on function public.claim_school_mail_review(uuid) to service_role;

create or replace function public.finish_school_mail_review(p_capture uuid,p_lease uuid,p_proposal jsonb,p_failed boolean default false)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not p_failed and (jsonb_typeof(p_proposal->'items') is distinct from 'array' or jsonb_array_length(p_proposal->'items')>80) then raise exception 'Invalid school proposal'; end if;
  update public.school_mail_reviews set status=case when p_failed then 'failed' else 'ready' end,
    proposal=coalesce(p_proposal,proposal),processing_token=null,updated_at=now()
    where capture_id=p_capture and status='processing' and processing_token=p_lease;
  if not found then return false; end if;
  update public.captures set status=case when p_failed then 'failed' else 'extracted' end,
    error=case when p_failed then 'Could not read this email. Try again.' else null end where id=p_capture;
  return true;
end $$;
revoke all on function public.finish_school_mail_review(uuid,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.finish_school_mail_review(uuid,uuid,jsonb,boolean) to service_role;

-- Save the parent's selection in ONE transaction. The receipt is immutable:
-- a retry (even after a lost response or a second parent's click) returns it.
create or replace function public.save_school_mail_review(p_capture uuid,p_items jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
<<school_save>>
declare r public.school_mail_reviews; c public.captures; item jsonb; original jsonb; mid text;
  title text; day text; clock text; kind text; tz text; scheduled timestamptz; assigned uuid[];
  pattern jsonb; row_id uuid; ids jsonb:='[]'; skipped jsonb:='[]'; notes_text text; known text[]:='{}'; receipt jsonb;
begin
  select * into r from public.school_mail_reviews where capture_id=p_capture for update;
  if not found or not public.school_mail_can_review(r.household_id) then raise exception 'School email unavailable' using errcode='42501'; end if;
  if r.status in ('saved','dismissed') then return r.result; end if;
  if r.status<>'ready' then raise exception 'This email is not ready for review'; end if;
  -- Different emails can describe the same event. Serialize household saves
  -- so exact duplicate checks hold across two concurrently reviewed emails.
  perform pg_advisory_xact_lock(hashtextextended(r.household_id::text,0));
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>80 then raise exception 'Invalid selection'; end if;
  select * into c from public.captures where id=p_capture;
  select timezone into tz from public.households where id=r.household_id;
  for item in select value from jsonb_array_elements(p_items) loop
    select value into original from jsonb_array_elements(r.proposal->'items') where value->>'id'=item->>'id';
    if original is null or (item->>'id')=any(known) then raise exception 'Unknown or repeated suggestion'; end if;
    known:=array_append(known,item->>'id');
    kind:=original->>'kind'; title:=trim(item->>'title'); day:=nullif(item->>'date',''); clock:=nullif(item->>'time','');
    if title is null or length(title)=0 or length(title)>500 then raise exception 'Give each selected item a title'; end if;
    if day is not null and (day !~ '^\d{4}-\d{2}-\d{2}$' or to_char(day::date,'YYYY-MM-DD')<>day) then raise exception 'Check the date'; end if;
    if clock is not null and (day is null or clock !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise exception 'Check the time and date'; end if;
    if jsonb_typeof(item->'memberIds') is distinct from 'array' then raise exception 'Choose who this is for'; end if;
    assigned:='{}';
    for mid in select jsonb_array_elements_text(item->'memberIds') loop
      if not exists(select 1 from public.family_members f join public.household_members hm on hm.user_id=f.user_id
        where f.id=mid::uuid and f.member_type='core' and hm.household_id=r.household_id and hm.status='active' and hm.role<>'display') then
        raise exception 'That person is not in this household' using errcode='42501';
      end if;
      if not mid::uuid=any(assigned) then assigned:=array_append(assigned,mid::uuid); end if;
    end loop;
    notes_text:=concat_ws(E'\n\n','From '||coalesce(c.source_label,'School email')||' · '||coalesce(c.subject,'Email'),nullif(original->>'detail',''),nullif(original->>'quote',''));
    scheduled:=case when day is null then null else (day||' '||coalesce(clock,'00:00'))::timestamp at time zone coalesce(tz,'America/New_York') end;
    if kind='routine' then
      pattern:=item->'repeat';
      if (pattern->>'type') is null or (pattern->>'type') not in ('daily','weekly') then raise exception 'Choose a repeat pattern'; end if;
      if pattern->>'type'='weekly' and (jsonb_typeof(pattern->'days') is distinct from 'array' or jsonb_array_length(pattern->'days')=0
        or exists(select 1 from jsonb_array_elements_text(pattern->'days') d where d not in ('sun','mon','tue','wed','thu','fri','sat'))) then raise exception 'Choose the repeating days'; end if;
      if exists(select 1 from public.routines x join public.household_members hm on hm.user_id=x.user_id
        where hm.household_id=r.household_id and hm.status='active' and x.context='family' and x.scope='compound'
          and lower(trim(x.name))=lower(title) and x.recurrence_pattern=pattern
          and coalesce(x.assigned_to_all,array_remove(array[x.assigned_to],null)) @> assigned
          and coalesce(x.assigned_to_all,array_remove(array[x.assigned_to],null)) <@ assigned) then
        skipped:=skipped||jsonb_build_array(title);continue;
      end if;
      insert into public.routines(user_id,name,description,recurrence_pattern,time_of_day,visibility,assigned_to,assigned_to_all,context,scope,show_on_timeline,raw_input)
        values(auth.uid(),title,notes_text,pattern,null,'active',case when cardinality(assigned)=1 then assigned[1] end,
          case when cardinality(assigned)>1 then assigned end,'family','compound',coalesce((item->>'showOnTimeline')::boolean,true),original->>'quote') returning id into row_id;
    elsif kind='notice' then
      -- A child's notice appears on that child's tablet page. An unassigned
      -- notice is household-wide; never widen a named selection to everyone.
      foreach row_id in array case when cardinality(assigned)=0 then array[null::uuid] else assigned end loop
        insert into public.notices(user_id,family_member_id,text,sender_label,received_on,capture_id)
          values(auth.uid(),row_id,title,coalesce(c.source_label,'School email'),(now() at time zone coalesce(tz,'America/New_York'))::date,p_capture) returning id into row_id;
        ids:=ids||jsonb_build_array(jsonb_build_object('id',row_id,'kind',kind,'title',title));
      end loop;
      continue;
    elsif kind in ('event','task','homework') then
      if exists(select 1 from public.tasks x join public.household_members hm on hm.user_id=x.user_id
        where hm.household_id=r.household_id and hm.status='active' and x.context='family' and x.scope='compound'
          and lower(trim(x.title))=lower(school_save.title) and x.category=kind and x.scheduled_for is not distinct from scheduled
          and coalesce(x.assigned_to_all,array_remove(array[x.assigned_to],null)) @> assigned
          and coalesce(x.assigned_to_all,array_remove(array[x.assigned_to],null)) <@ assigned) then
        skipped:=skipped||jsonb_build_array(title);continue;
      end if;
      insert into public.tasks(user_id,title,completed,bucket,context,scope,category,scheduled_for,is_all_day,location,notes,capture_id,assigned_to,assigned_to_all,needed_on)
        values(auth.uid(),title,false,case when scheduled is null then 'inbox' else 'timed' end,'family','compound',case when kind='event' then 'event' when kind='homework' then 'homework' else 'task' end,
          scheduled,case when scheduled is null then null else clock is null end,nullif(original->>'location',''),notes_text,p_capture,
          case when cardinality(assigned)=1 then assigned[1] end,case when cardinality(assigned)>1 then assigned end,case when kind<>'event' then day::date end) returning id into row_id;
    else raise exception 'Unsupported suggestion'; end if;
    ids:=ids||jsonb_build_array(jsonb_build_object('id',row_id,'kind',kind,'title',title));
  end loop;
  receipt:=jsonb_build_object('status',case when jsonb_array_length(p_items)=0 then 'dismissed' else 'saved' end,'count',jsonb_array_length(ids),'items',ids,'skipped',skipped);
  update public.school_mail_reviews set status=receipt->>'status',result=receipt,reviewed_by=auth.uid(),updated_at=now() where capture_id=p_capture;
  update public.captures set reviewed_at=now() where id=p_capture;
  return receipt;
end $$;
revoke all on function public.save_school_mail_review(uuid,jsonb) from public,anon;
grant execute on function public.save_school_mail_review(uuid,jsonb) to authenticated;
