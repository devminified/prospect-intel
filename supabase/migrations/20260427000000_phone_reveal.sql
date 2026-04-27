-- M31: Apollo phone reveal
--
-- Adds an audit timestamp for when a contact's phone was revealed via Apollo
-- people/match with `reveal_phone_number: true`. Mirrors the existing
-- `email_revealed_at` column added in 20260424000000_phase3.sql.
--
-- Why: separating email-reveal and phone-reveal credit consumption needs
-- a way to tell "Apollo had no phone on file" from "we never tried" —
-- if `phone_revealed_at` is non-null we don't retry and burn another credit.

alter table contacts add column phone_revealed_at timestamptz;
