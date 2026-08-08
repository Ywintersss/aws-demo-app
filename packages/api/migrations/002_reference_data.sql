INSERT INTO branches (id, code, name) VALUES
  ('11111111-1111-4111-8111-111111111111', 'KL', 'Aethelgard Kuala Lumpur'),
  ('22222222-2222-4222-8222-222222222222', 'PG', 'Aethelgard Penang'),
  ('33333333-3333-4333-8333-333333333333', 'JB', 'Aethelgard Johor Bahru')
ON CONFLICT (id) DO NOTHING;
