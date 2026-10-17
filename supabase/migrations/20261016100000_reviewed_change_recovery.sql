-- Durable receipts for reviewed chat cards. Existing writers and RLS remain in
-- charge. Each committed write is journalled in its own transaction. A failed
-- card is called reverted ONLY after the database confirms a guarded rollback.
create table public.reviewed_changes (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 request_key text not null, payload jsonb not null, attempt uuid not null default gen_random_uuid(),
 status text not null default 'open' check(status in ('open','saved','undone')),
 ids jsonb not null default '[]', created_at timestamptz not null default now(),
 unique(user_id,request_key)
);
create table public.reviewed_change_rows (
 command_id uuid not null references public.reviewed_changes(id) on delete cascade,
 table_name text not null, row_key jsonb not null, before_row jsonb, after_row jsonb,
 ordinal bigint generated always as identity,
 primary key(command_id,table_name,row_key)
);
alter table public.reviewed_changes enable row level security;
alter table public.reviewed_change_rows enable row level security;
revoke all on public.reviewed_changes,public.reviewed_change_rows from public,anon,authenticated;
grant select on public.reviewed_changes,public.reviewed_change_rows to authenticated;
create policy read_own_reviewed_changes on public.reviewed_changes for select to authenticated using(user_id=auth.uid());
create policy read_own_reviewed_rows on public.reviewed_change_rows for select to authenticated using(exists(select 1 from public.reviewed_changes c where c.id=command_id and c.user_id=auth.uid()));

create function public.reviewed_row_key(p_table text,p_row jsonb) returns jsonb
language sql stable set search_path='' as $$
 select case when p_table='task_focus' then jsonb_build_object('task_id',p_row->'task_id','user_id',p_row->'user_id','date',p_row->'date') else jsonb_build_object('id',p_row->'id') end
$$;

create function public.journal_reviewed_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare h jsonb; c public.reviewed_changes; k jsonb; prior public.reviewed_change_rows; current_row jsonb; cmd uuid;
begin
 h:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}');
 if h->>'x-symphony-command' is null then return coalesce(new,old);end if;
 cmd:=(h->>'x-symphony-command')::uuid;
 select * into c from public.reviewed_changes where id=cmd and user_id=auth.uid() for update;
 if not found or c.status<>'open' or c.attempt::text is distinct from h->>'x-symphony-attempt' then
   raise exception 'This save attempt is closed. Refresh its receipt before retrying.' using errcode='PT409';
 end if;
 k:=public.reviewed_row_key(tg_table_name,case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end);
 if tg_when='BEFORE' then
   select * into prior from public.reviewed_change_rows where command_id=cmd and table_name=tg_table_name and row_key=k;
   if found and pg_trigger_depth()=1 and prior.after_row is distinct from (case when tg_op='INSERT' then null else to_jsonb(old) end) then
     raise exception 'This item changed during Save. Its newer changes were kept.' using errcode='PT409';
   end if;
   insert into public.reviewed_change_rows(command_id,table_name,row_key,before_row,after_row)
    values(cmd,tg_table_name,k,case when tg_op='INSERT' then null else to_jsonb(old) end,case when tg_op='INSERT' then null else to_jsonb(old) end)
    on conflict do nothing;
 else
   execute format('select to_jsonb(t) from public.%I t where to_jsonb(t) @> $1',tg_table_name) into current_row using k;
   update public.reviewed_change_rows set after_row=current_row where command_id=cmd and table_name=tg_table_name and row_key=k;
 end if;
 return coalesce(new,old);
end;$$;
-- Include side effects of ticks, placement, and a routine occurrence. Event
-- history is append-only and is not rewound; it records the inverse operation.
do $$declare t text;begin
 foreach t in array array['tasks','routines','goals','task_commitments','task_focus','actionable_instances','list_items'] loop
   execute format('create trigger reviewed_change_before before insert or update or delete on public.%I for each row execute function public.journal_reviewed_change()',t);
   execute format('create trigger zz_reviewed_change_after after insert or update or delete on public.%I for each row execute function public.journal_reviewed_change()',t);
 end loop;
end;$$;

create function public.begin_reviewed_change(p_key text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.reviewed_changes; inserted_count integer;
begin
 if auth.uid() is null or length(p_key) not between 1 and 250 or octet_length(p_payload::text)>100000 then raise exception 'Invalid reviewed change' using errcode='22023';end if;
 insert into public.reviewed_changes(user_id,request_key,payload) values(auth.uid(),p_key,p_payload) on conflict do nothing;
 get diagnostics inserted_count=row_count;
 select * into c from public.reviewed_changes where user_id=auth.uid() and request_key=p_key for update;
 if c.payload<>p_payload then raise exception 'This draft was revised. Please review it again.' using errcode='PT409';end if;
 if c.status='undone' then
   inserted_count:=1;
   delete from public.reviewed_change_rows where command_id=c.id;
   update public.reviewed_changes set status='open',attempt=gen_random_uuid(),ids='[]' where id=c.id returning * into c;
 end if;
 return to_jsonb(c)||jsonb_build_object('fresh',inserted_count=1,'has_writes',exists(select 1 from public.reviewed_change_rows where command_id=c.id));
end;$$;

create function public.finish_reviewed_change(p_id uuid,p_attempt uuid,p_ids jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.reviewed_changes;r public.reviewed_change_rows; actual jsonb;
begin
 select * into c from public.reviewed_changes where id=p_id and user_id=auth.uid() for update;
 if not found or c.attempt<>p_attempt or c.status not in ('open','saved') then raise exception 'Save attempt is closed' using errcode='PT409';end if;
 if c.status='saved' then return to_jsonb(c);end if;
 for r in select * from public.reviewed_change_rows where command_id=p_id order by table_name,row_key loop
   execute format('select to_jsonb(t) from public.%I t where to_jsonb(t) @> $1 for update',r.table_name) into actual using r.row_key;
   if actual is distinct from r.after_row then raise exception 'This item changed during Save. Its newer changes were kept.' using errcode='PT409';end if;
 end loop;
 update public.reviewed_changes set status='saved',ids=p_ids where id=p_id returning * into c;
 return to_jsonb(c);
end;$$;

-- Internal bookkeeping only: neither this helper nor a forged header permits
-- writes to application rows. Undo itself is SECURITY INVOKER and keeps RLS.
create function public.lock_reviewed_change(p_id uuid,p_attempt uuid,p_finish boolean default false) returns boolean
language plpgsql security definer set search_path='' as $$
declare c public.reviewed_changes;
begin
 select * into c from public.reviewed_changes where id=p_id and user_id=auth.uid() for update;
 if not found or c.attempt<>p_attempt then raise exception 'Save receipt not found' using errcode='42501';end if;
 if p_finish then update public.reviewed_changes set status='undone' where id=p_id;end if;
 return c.status='undone';
end;$$;

-- A created row cannot be deleted if somebody subsequently attached a child,
-- even if that child is private and therefore invisible to the undo caller.
create function public.reviewed_has_new_dependents(p_id uuid,p_table text,p_key jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare fk record; predicate text; extra boolean;
begin
 if not exists(select 1 from public.reviewed_changes c join public.reviewed_change_rows r on r.command_id=c.id where c.id=p_id and c.user_id=auth.uid() and r.table_name=p_table and r.row_key=p_key) then raise exception 'Save receipt not found' using errcode='42501';end if;
 if p_table in ('tasks','routines') and exists(select 1 from public.attachments a where a.entity_id::text=p_key->>'id' and a.entity_type=case when p_table='tasks' then 'task' else 'routine' end) then return true;end if;
 for fk in select c.conrelid,c.conkey,c.confkey,n.nspname,t.relname from pg_catalog.pg_constraint c
  join pg_catalog.pg_class t on t.oid=c.conrelid join pg_catalog.pg_namespace n on n.oid=t.relnamespace
  where c.contype='f' and c.confrelid=to_regclass('public.'||quote_ident(p_table)) loop
  -- Placement event history is the only append-only dependent: the parent's
  -- subsequent edits are already detected by its exact after-image.
  if fk.nspname='public' and fk.relname='task_placement_events' then continue;end if;
  select string_agg(format('to_jsonb(child)->%L = to_jsonb(parent)->%L',a.attname,b.attname),' and ')
   into predicate from unnest(fk.conkey,fk.confkey) k(child_att,parent_att)
   join pg_catalog.pg_attribute a on a.attrelid=fk.conrelid and a.attnum=k.child_att
   join pg_catalog.pg_attribute b on b.attrelid=to_regclass('public.'||quote_ident(p_table)) and b.attnum=k.parent_att;
  execute format('select exists(select 1 from %I.%I child, public.%I parent where to_jsonb(parent) @> $2 and %s and not exists(select 1 from public.reviewed_change_rows j where j.command_id=$1 and j.table_name=$3 and j.before_row is null and j.after_row=to_jsonb(child)))',fk.nspname,fk.relname,p_table,predicate)
    into extra using p_id,p_key,fk.relname;
  if extra then return true;end if;
 end loop;
 return false;
end;$$;

create function public.undo_reviewed_change(p_id uuid,p_attempt uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare r public.reviewed_change_rows;actual jsonb;cols text; vals text;n integer;
begin
 if public.lock_reviewed_change(p_id,p_attempt) then return true;end if;
 lock table public.attachments in share mode;
 -- Lock all rows and check ALL conflicts before any reversal. These are exact
 -- database images: no clock approximation, no grace period, including creates.
 for r in select * from public.reviewed_change_rows where command_id=p_id order by table_name,row_key loop
   execute format('select to_jsonb(t) from public.%I t where to_jsonb(t) @> $1 for update',r.table_name) into actual using r.row_key;
   if actual is distinct from r.after_row then raise exception 'A saved item has changed. Undo kept the newer changes.' using errcode='PT409';end if;
   if r.before_row is null and r.after_row is not null and public.reviewed_has_new_dependents(p_id,r.table_name,r.row_key) then
     raise exception 'A saved item now has other changes. Undo kept them.' using errcode='PT409';end if;
 end loop;
 -- Created children first. Then restore existing parents before their children,
 -- letting the normal placement and privacy triggers keep enforcing invariants.
 for r in select * from public.reviewed_change_rows where command_id=p_id and before_row is null order by ordinal desc loop
   execute format('delete from public.%I t where to_jsonb(t) @> $1',r.table_name) using r.row_key;
 end loop;
 for r in select * from public.reviewed_change_rows where command_id=p_id and before_row is not null order by ordinal loop
   select string_agg(quote_ident(a.attname),','),string_agg(format('v.%I',a.attname),',') into cols,vals
    from pg_catalog.pg_attribute a where a.attrelid=to_regclass('public.'||quote_ident(r.table_name)) and a.attnum>0 and not a.attisdropped and a.attgenerated='' and not(r.row_key?a.attname);
   execute format('update public.%I t set (%s)=(select %s from jsonb_populate_record(null::public.%I,$2) v) where to_jsonb(t) @> $1',r.table_name,cols,vals,r.table_name) using r.row_key,r.before_row;
   get diagnostics n=row_count;
   if n=0 then
     select string_agg(quote_ident(a.attname),','),string_agg(format('v.%I',a.attname),',') into cols,vals
      from pg_catalog.pg_attribute a where a.attrelid=to_regclass('public.'||quote_ident(r.table_name)) and a.attnum>0 and not a.attisdropped and a.attgenerated='';
     execute format('insert into public.%I(%s) select %s from jsonb_populate_record(null::public.%I,$1) v',r.table_name,cols,vals,r.table_name) using r.before_row;
   end if;
 end loop;
 -- A trigger that cannot restore the original state causes a full SQL rollback,
 -- never a partially successful Undo. Timestamps reflect this inverse write.
 for r in select * from public.reviewed_change_rows where command_id=p_id loop
   execute format('select to_jsonb(t) from public.%I t where to_jsonb(t) @> $1',r.table_name) into actual using r.row_key;
   if (actual-'updated_at') is distinct from (r.before_row-'updated_at') then raise exception 'Could not safely restore this change' using errcode='PT409';end if;
 end loop;
 perform public.lock_reviewed_change(p_id,p_attempt,true);
 return true;
end;$$;
revoke all on function public.journal_reviewed_change(),public.reviewed_row_key(text,jsonb),public.begin_reviewed_change(text,jsonb),public.finish_reviewed_change(uuid,uuid,jsonb),public.lock_reviewed_change(uuid,uuid,boolean),public.reviewed_has_new_dependents(uuid,text,jsonb),public.undo_reviewed_change(uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_reviewed_change(text,jsonb),public.finish_reviewed_change(uuid,uuid,jsonb),public.lock_reviewed_change(uuid,uuid,boolean),public.reviewed_has_new_dependents(uuid,text,jsonb),public.undo_reviewed_change(uuid,uuid) to authenticated;
