/*
# Create broadcast_channels table

Single-tenant (no auth) lookup table of TV/streaming channels that may
carry Brewers games.  Populated by the app's migration seed; read by the
frontend to enrich broadcast data returned from the MLB Stats API.

## New Tables

### broadcast_channels
- id          – serial primary key
- key         – matches the `name` field returned by MLB Stats API broadcasts
                (e.g. "Brewers.TV", "FOX", "Apple TV+")
- display_name – human-readable channel name shown in the UI
- type        – one of: 'broadcast', 'cable', 'streaming', 'regional'
- providers   – JSON array of provider names that carry this channel
                (most useful for regional channels like Brewers.TV)
- description – optional short description
- website_url – optional direct link to channel or service
- sort_order  – integer controlling display ordering within type groups

## Security
- RLS enabled; anon + authenticated can SELECT (public lookup data).
- No insert/update/delete policies – data managed via migrations only.
*/

CREATE TABLE IF NOT EXISTS broadcast_channels (
  id           serial PRIMARY KEY,
  key          text UNIQUE NOT NULL,
  display_name text NOT NULL,
  type         text NOT NULL CHECK (type IN ('broadcast','cable','streaming','regional')),
  providers    jsonb NOT NULL DEFAULT '[]',
  description  text,
  website_url  text,
  sort_order   integer NOT NULL DEFAULT 99
);

ALTER TABLE broadcast_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_broadcast_channels" ON broadcast_channels;
CREATE POLICY "anon_select_broadcast_channels" ON broadcast_channels FOR SELECT
TO anon, authenticated USING (true);

INSERT INTO broadcast_channels (key, display_name, type, providers, description, website_url, sort_order)
VALUES
  ('FOX',         'FOX',         'broadcast', '[]',
   'Free over-the-air broadcast', 'https://www.fox.com', 1),
  ('ABC',         'ABC',         'broadcast', '[]',
   'Free over-the-air broadcast', 'https://abc.com', 2),
  ('FS1',         'FS1',         'cable',     '[]',
   'Fox Sports 1', 'https://www.foxsports.com', 3),
  ('ESPN',        'ESPN',        'cable',     '[]',
   'ESPN cable channel', 'https://www.espn.com', 4),
  ('ESPN2',       'ESPN2',       'cable',     '[]',
   'ESPN2 cable channel', 'https://www.espn.com', 5),
  ('TBS',         'TBS',         'cable',     '[]',
   'TBS cable channel', 'https://www.tbs.com', 6),
  ('MLB Network', 'MLB Network', 'cable',     '[]',
   'MLB''s 24/7 baseball network', 'https://www.mlb.com/network', 7),
  ('MLBN',        'MLB Network', 'cable',     '[]',
   'MLB''s 24/7 baseball network', 'https://www.mlb.com/network', 8),
  ('Brewers.TV',  'Brewers.TV',  'regional',
   '["DirecTV","DirecTV Stream","Dish Network","Spectrum","Xfinity","YouTube TV","FuboTV","Sling TV","Cox","Optimum","AT&T U-verse"]',
   'Regional broadcast for Brewers home games', 'https://www.mlb.com/brewers/fans/brewers-tv', 9),
  ('BSMI',        'Brewers.TV',  'regional',
   '["DirecTV","DirecTV Stream","Dish Network","Spectrum","Xfinity","YouTube TV","FuboTV","Sling TV","Cox","Optimum","AT&T U-verse"]',
   'Bally Sports / Brewers.TV regional feed', 'https://www.mlb.com/brewers/fans/brewers-tv', 10),
  ('BSWI',        'Brewers.TV',  'regional',
   '["DirecTV","DirecTV Stream","Dish Network","Spectrum","Xfinity","YouTube TV","FuboTV","Sling TV","Cox","Optimum","AT&T U-verse"]',
   'Bally Sports Wisconsin / Brewers.TV regional feed', 'https://www.mlb.com/brewers/fans/brewers-tv', 11),
  ('MLB.TV',      'MLB.TV',      'streaming', '[]',
   'Stream every out-of-market game', 'https://www.mlb.com/tv', 12),
  ('Apple TV+',   'Apple TV+',   'streaming', '[]',
   'Exclusive Friday night games on Apple TV+', 'https://tv.apple.com', 13),
  ('Peacock',     'Peacock',     'streaming', '[]',
   'NBC streaming — Sunday Leadoff games', 'https://www.peacocktv.com', 14),
  ('ESPN+',       'ESPN+',       'streaming', '[]',
   'ESPN streaming service', 'https://plus.espn.com', 15),
  ('Paramount+',  'Paramount+',  'streaming', '[]',
   'Paramount streaming service', 'https://www.paramountplus.com', 16)
ON CONFLICT (key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  type         = EXCLUDED.type,
  providers    = EXCLUDED.providers,
  description  = EXCLUDED.description,
  website_url  = EXCLUDED.website_url,
  sort_order   = EXCLUDED.sort_order;
