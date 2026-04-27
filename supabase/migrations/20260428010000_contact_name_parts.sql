-- M35.2: Store contact first/last name separately so Lusha matching works.
--
-- Apollo people-search returns first_name + last_name as separate fields,
-- but we previously collapsed them into full_name and lost the split. When
-- Lusha needs (firstName + lastName + domain/companyName) and the contact's
-- full_name is "Mahad" (single word), we can't match — even though Apollo
-- had the last name we just didn't keep it.
--
-- Both columns nullable. full_name is preserved as the canonical display
-- name; first_name + last_name are the structured fields for downstream
-- vendor matchers.

alter table contacts add column first_name text;
alter table contacts add column last_name text;
