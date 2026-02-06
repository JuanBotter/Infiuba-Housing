INSERT INTO dataset_meta (id, generated_at, source_file, total_listings, updated_at)
VALUES (1, NOW(), NULL, 0, NOW())
ON CONFLICT (id) DO NOTHING;
