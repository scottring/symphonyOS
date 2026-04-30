create or replace function regenerate_meal_plan(p_meal_plan_id uuid, p_entries jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_ids uuid[];
begin
  if not exists (
    select 1 from meal_plans p
    where p.id = p_meal_plan_id
      and (p.user_id = auth.uid() or users_share_household(auth.uid(), p.user_id))
  ) then
    raise exception 'unauthorized: plan % not visible to caller', p_meal_plan_id;
  end if;

  delete from meal_plan_entries where meal_plan_id = p_meal_plan_id;

  with inserted as (
    insert into meal_plan_entries (
      meal_plan_id, day_of_week, slot, family_member_id, recipe_id, ad_hoc_title
    )
    select p_meal_plan_id,
           (e->>'day_of_week')::smallint,
           e->>'slot',
           nullif(e->>'family_member_id', '')::uuid,
           nullif(e->>'recipe_id', '')::uuid,
           nullif(e->>'ad_hoc_title', '')
    from jsonb_array_elements(p_entries) e
    returning id
  )
  select coalesce(array_agg(id), array[]::uuid[]) into inserted_ids from inserted;

  return jsonb_build_object('inserted_ids', inserted_ids);
end;
$$;

grant execute on function regenerate_meal_plan(uuid, jsonb) to authenticated;
