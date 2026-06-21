INSERT INTO t_p71821556_real_estate_catalog_.crm_api_quota (source, requests_used, requests_limit)
VALUES
  ('egrn',   0, 200),
  ('checko', 0, 1000),
  ('dadata', 0, 1000)
ON CONFLICT (source) DO NOTHING;