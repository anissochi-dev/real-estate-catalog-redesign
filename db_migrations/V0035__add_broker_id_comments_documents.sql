ALTER TABLE t_p71821556_real_estate_catalog_.listings ADD COLUMN IF NOT EXISTS broker_id integer REFERENCES t_p71821556_real_estate_catalog_.users(id);

CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.listing_comments (
  id serial PRIMARY KEY,
  listing_id integer NOT NULL REFERENCES t_p71821556_real_estate_catalog_.listings(id),
  user_id integer REFERENCES t_p71821556_real_estate_catalog_.users(id),
  user_name text,
  comment text NOT NULL,
  is_ai boolean DEFAULT false,
  created_at timestamptz DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.listing_documents (
  id serial PRIMARY KEY,
  listing_id integer NOT NULL REFERENCES t_p71821556_real_estate_catalog_.listings(id),
  uploaded_by integer REFERENCES t_p71821556_real_estate_catalog_.users(id),
  name text NOT NULL,
  url text NOT NULL,
  created_at timestamptz DEFAULT NOW()
);