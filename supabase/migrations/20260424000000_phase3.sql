-- Track when Apollo email credit was spent for a contact
alter table contacts add column email_revealed_at timestamptz;

-- Per-batch Phase 3 toggles
alter table batches add column pitch_score_threshold int;
alter table batches add column auto_enrich_top_n int not null default 0;

-- Structured fields from ScrapingBee AI Extract (booking_platform, book_url,
-- primary_cta, services, team_members).
alter table enrichments add column scraped_data_json jsonb;
