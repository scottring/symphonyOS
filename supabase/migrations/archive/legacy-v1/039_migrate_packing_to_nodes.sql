-- Migration: Convert packing_templates.items from PackingItem[] to PackingNode[]
-- This migration converts the rigid category-based structure to flexible heading + checklist format

-- Step 1: Rename old column (backup)
ALTER TABLE packing_templates RENAME COLUMN items TO items_old;

-- Step 2: Add new nodes column
ALTER TABLE packing_templates ADD COLUMN nodes JSONB DEFAULT '[]'::jsonb;

-- Step 3: Create migration function
CREATE OR REPLACE FUNCTION migrate_packing_items_to_nodes()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  template_record RECORD;
  items_array JSONB;
  nodes_array JSONB;
  item JSONB;
  current_person TEXT;
  current_category TEXT;
  person_groups JSONB;
  category_groups JSONB;
  person_key TEXT;
  category_key TEXT;
  item_text TEXT;
BEGIN
  -- Loop through each template
  FOR template_record IN SELECT id, items_old FROM packing_templates WHERE items_old IS NOT NULL LOOP
    items_array := template_record.items_old;
    nodes_array := '[]'::jsonb;
    person_groups := '{}'::jsonb;

    -- Skip if empty
    IF jsonb_array_length(items_array) = 0 THEN
      UPDATE packing_templates SET nodes = '[]'::jsonb WHERE id = template_record.id;
      CONTINUE;
    END IF;

    -- Group items by person, then by category within each person
    FOR item IN SELECT * FROM jsonb_array_elements(items_array) LOOP
      current_person := COALESCE(item->>'for_person', 'General');
      current_category := item->>'category';

      -- Initialize person group if doesn't exist
      IF NOT person_groups ? current_person THEN
        person_groups := jsonb_set(person_groups, ARRAY[current_person], '{}'::jsonb);
      END IF;

      -- Initialize category group within person if doesn't exist
      IF NOT (person_groups->current_person) ? current_category THEN
        person_groups := jsonb_set(
          person_groups,
          ARRAY[current_person, current_category],
          '[]'::jsonb
        );
      END IF;

      -- Add item to category group
      person_groups := jsonb_set(
        person_groups,
        ARRAY[current_person, current_category],
        (person_groups->current_person->current_category) || jsonb_build_array(item)
      );
    END LOOP;

    -- Convert grouped structure to PackingNode[] format
    FOR person_key IN SELECT * FROM jsonb_object_keys(person_groups) LOOP
      category_groups := person_groups->person_key;

      -- Add person heading (h2) if not "General"
      IF person_key != 'General' THEN
        nodes_array := nodes_array || jsonb_build_array(
          jsonb_build_object('type', 'heading', 'level', 2, 'text', person_key)
        );
      END IF;

      -- Add category headings (h3) and items
      FOR category_key IN SELECT * FROM jsonb_object_keys(category_groups) LOOP
        -- Add category heading
        nodes_array := nodes_array || jsonb_build_array(
          jsonb_build_object('type', 'heading', 'level', 3, 'text',
            CASE category_key
              WHEN 'clothing' THEN 'Clothing'
              WHEN 'toiletries' THEN 'Toiletries'
              WHEN 'electronics' THEN 'Electronics'
              WHEN 'documents' THEN 'Documents'
              WHEN 'health' THEN 'Health'
              WHEN 'ev_equipment' THEN 'EV Equipment'
              WHEN 'food_drinks' THEN 'Food & Drinks'
              WHEN 'recreation' THEN 'Recreation'
              ELSE 'Other'
            END
          )
        );

        -- Add items for this category
        FOR item IN SELECT * FROM jsonb_array_elements(category_groups->category_key) LOOP
          item_text := item->>'name';

          -- Append quantity if present
          IF item->>'quantity' IS NOT NULL AND item->>'quantity' != '' THEN
            item_text := item_text || ' (' || (item->>'quantity') || ')';
          END IF;

          -- Add item node
          nodes_array := nodes_array || jsonb_build_array(
            jsonb_build_object('type', 'item', 'text', item_text, 'checked', false)
          );
        END LOOP;
      END LOOP;
    END LOOP;

    -- Update template with new nodes
    UPDATE packing_templates SET nodes = nodes_array WHERE id = template_record.id;
  END LOOP;
END;
$$;

-- Step 4: Run migration
SELECT migrate_packing_items_to_nodes();

-- Step 5: Drop migration function (cleanup)
DROP FUNCTION migrate_packing_items_to_nodes();

-- Step 6: Drop old column (after verifying migration worked)
-- UNCOMMENT THIS AFTER VERIFYING MIGRATION:
-- ALTER TABLE packing_templates DROP COLUMN items_old;

-- Step 7: Update GIN index to use nodes column
DROP INDEX IF EXISTS idx_packing_templates_items;
CREATE INDEX idx_packing_templates_nodes ON packing_templates USING GIN (nodes);

-- Add comment
COMMENT ON COLUMN packing_templates.nodes IS 'Packing list as array of PackingNode objects (headings + checklist items)';
