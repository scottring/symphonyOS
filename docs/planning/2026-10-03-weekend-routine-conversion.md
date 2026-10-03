# Weekend routine conversion — 2026-10-03

**What changes:** nine of Scott's routines move to the Weekend rule. The Weekend rule means once, sometime over the weekend: a routine on it is done once and settles the whole window. Until now these routines were stored as "weekly on Saturday AND Sunday", which made them two commitments. They showed on both days, and each day needed its own tick. Scott, 2026-10-03: "confusing and mind-numbing". He approved the change, Do Kids laundry included.

**When:** after the Week grid (the "Sometime this weekend" list) is deployed. The build before it can't draw an unplaced Weekend-rule routine on Week.

## Old rules (for undo)

All belong to user `bace953e-87ea-4a59-b7d7-f476fa0e8c94`.

| id | name | old recurrence_pattern | time_of_day |
|---|---|---|---|
| 91059ada-e62c-4e0e-933e-0d19872d039c | Do Kids laundry | `{"days":["sat","sun"],"type":"weekly"}` | 14:00:00 |
| f14d209e-57f9-4c76-9104-8d03c3f1bc19 | Food planning | `{"days":["sun","sat"],"type":"weekly"}` | — |
| a70e195f-027b-4074-8c80-b8f8399644a6 | Go on weekend family bike trips | `{"days":["sat","sun"],"type":"weekly"}` | — |
| d20377b8-b4b1-467f-a142-237cb05794a4 | Iris laundry and clothes processing | `{"days":["sat","sun"],"type":"weekly"}` | — |
| 738d1806-9728-4691-bed5-a78322bbb617 | Iris weekend workout | `{"days":["sat","sun"],"type":"weekly"}` | — |
| b51edd7b-d170-460a-a070-7d88bf9793f6 | Put away kitchen laundry | `{"days":["sat","sun"],"type":"weekly"}` | — |
| 98bcd8c7-f019-4e20-8186-eca91061f180 | Weed the backyard | `{"days":["saturday","sun","sat"],"type":"weekly","interval":2,"start_date":"2026-09-05"}` | — |
| c89796eb-e852-47d5-99d5-f5f7ba4be48e | Weeding front and back yards | `{"days":["sat","sun"],"type":"weekly"}` | — |
| ac47763e-fc4c-4ae9-bca4-ae6b5951efaf | Yard weeding | `{"days":["saturday","sunday"],"type":"weekly"}` | — |

## The change

```sql
begin;
update routines set recurrence_pattern = '{"type":"weekend"}'::jsonb, updated_at = now()
 where id in ('91059ada-e62c-4e0e-933e-0d19872d039c','f14d209e-57f9-4c76-9104-8d03c3f1bc19',
  'a70e195f-027b-4074-8c80-b8f8399644a6','d20377b8-b4b1-467f-a142-237cb05794a4',
  '738d1806-9728-4691-bed5-a78322bbb617','b51edd7b-d170-460a-a070-7d88bf9793f6',
  'c89796eb-e852-47d5-99d5-f5f7ba4be48e','ac47763e-fc4c-4ae9-bca4-ae6b5951efaf');
update routines set recurrence_pattern = '{"type":"weekend","interval":2,"start_date":"2026-09-05"}'::jsonb, updated_at = now()
 where id = '98bcd8c7-f019-4e20-8186-eca91061f180';
commit;
```

- **Times stay as they are.** Do Kids laundry keeps 2pm, shown beside it in "Sometime this weekend".
- **Every other weekend still works.** The Weekend rule honours `interval` and `start_date` as of this branch (`routineUtils.ts`, the `weekend` case).

## Undo

Set each row's `recurrence_pattern` back to the value in the table above, by id.
