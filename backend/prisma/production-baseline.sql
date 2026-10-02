-- DoorStep production baseline: the reference data a new, empty database needs
-- (roles, store categories, delivery zones, exchange rate), plus, on Supabase, a
-- lock-down of the auto-generated Data API. Safe to run more than once. No stores,
-- menus or users are created; the first admin is an existing account given the
-- ADMIN role (see README → "First admin").
INSERT INTO roles (name) VALUES ('CUSTOMER'), ('RIDER'), ('VENDOR'), ('ADMIN')
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (id, name, slug, icon, sort_order) VALUES
  ('cat_food', 'Food', 'food', 'restaurant', 1),
  ('cat_groceries', 'Groceries', 'groceries', 'local_grocery_store', 2),
  ('cat_pharmacy', 'Pharmacy', 'pharmacy', 'local_pharmacy', 3),
  ('cat_parcels', 'Parcels', 'parcels', 'inventory_2', 4),
  ('cat_electronics', 'Electronics & phones', 'electronics', 'devices', 5),
  ('cat_fashion', 'Clothing & shoes', 'fashion', 'checkroom', 6),
  ('cat_beauty', 'Beauty & personal care', 'beauty', 'spa', 7),
  ('cat_hardware', 'Hardware & tools', 'hardware', 'hardware', 8),
  ('cat_home', 'Home & kitchen', 'home', 'chair', 9),
  ('cat_books', 'Books & stationery', 'books', 'menu_book', 10),
  ('cat_gifts', 'Flowers & gifts', 'gifts', 'local_florist', 11),
  ('cat_farm', 'Farm & garden', 'farm', 'yard', 12),
  ('cat_other', 'Other shops', 'other', 'storefront', 13)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO zones (id, name, city, center_lat, center_lng, radius_km, updated_at)
SELECT v.id, v.name, v.city, v.lat, v.lng, v.radius, CURRENT_TIMESTAMP
FROM (VALUES
  ('zone_harare', 'Harare Metro', 'Harare', -17.8292, 31.0522, 22.0),
  ('zone_bulawayo', 'Bulawayo', 'Bulawayo', -20.1325, 28.6265, 18.0)
) AS v(id, name, city, lat, lng, radius)
WHERE NOT EXISTS (SELECT 1 FROM zones z WHERE z.name = v.name);

INSERT INTO settings (key, value, updated_at) VALUES ('zigPerUsd', '26.8'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;

-- On Supabase: keep every table out of the auto-generated Data API. DoorStep connects
-- to Postgres directly as the table owner, which row level security does not restrict;
-- the public anon/authenticated API keys get no access at all. Skipped elsewhere.
DO $$
DECLARE t record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    END LOOP;
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
  END IF;
END $$;
