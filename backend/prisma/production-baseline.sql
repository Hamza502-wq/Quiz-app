-- DoorStep production baseline: the reference data a new, empty database needs
-- (roles, store categories, delivery zones, exchange rate). Safe to run more
-- than once. No stores, menus or users are created; the first admin is an
-- existing account given the ADMIN role (see README → "First admin").
INSERT INTO roles (name) VALUES ('CUSTOMER'), ('RIDER'), ('VENDOR'), ('ADMIN')
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (id, name, slug, icon, sort_order) VALUES
  ('cat_food', 'Food', 'food', 'restaurant', 1),
  ('cat_groceries', 'Groceries', 'groceries', 'local_grocery_store', 2),
  ('cat_pharmacy', 'Pharmacy', 'pharmacy', 'local_pharmacy', 3),
  ('cat_parcels', 'Parcels', 'parcels', 'inventory_2', 4)
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
