-- Business-level email discovered via website scraping during enrichment.
-- email_source distinguishes how we got the email; email_confidence flags
-- whether it matches the business domain (high) or not (low).
alter table prospects add column email_source text;       -- 'website_scrape' | 'apollo' | null
alter table prospects add column email_confidence text;   -- 'verified' | 'guessed' | null

-- New ICP filter: require at least one way to reach the prospect (any email
-- OR a phone). Replaces the require_linkedin proxy with a more accurate signal.
alter table icp_profile add column require_reachable boolean not null default false;
