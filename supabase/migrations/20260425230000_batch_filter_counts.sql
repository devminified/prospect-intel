-- Persist what got dropped at batch creation so users can answer 'why fewer
-- prospects than I asked for?' weeks later, not just at create time.
alter table batches add column count_filtered_below_icp int not null default 0;
alter table batches add column count_duplicates_skipped int not null default 0;
