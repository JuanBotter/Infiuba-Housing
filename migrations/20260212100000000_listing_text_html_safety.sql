UPDATE listings
SET
  address = replace(replace(address, '<', '&lt;'), '>', '&gt;'),
  neighborhood = replace(replace(neighborhood, '<', '&lt;'), '>', '&gt;'),
  updated_at = NOW()
WHERE
  position('<' in address) > 0
  OR position('>' in address) > 0
  OR position('<' in neighborhood) > 0
  OR position('>' in neighborhood) > 0;

ALTER TABLE listings
  DROP CONSTRAINT IF EXISTS listings_address_no_html_tag_chars,
  DROP CONSTRAINT IF EXISTS listings_neighborhood_no_html_tag_chars;

ALTER TABLE listings
  ADD CONSTRAINT listings_address_no_html_tag_chars
    CHECK (position('<' in address) = 0 AND position('>' in address) = 0),
  ADD CONSTRAINT listings_neighborhood_no_html_tag_chars
    CHECK (position('<' in neighborhood) = 0 AND position('>' in neighborhood) = 0);
