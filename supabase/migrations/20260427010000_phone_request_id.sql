-- M32: Apollo phone reveal is async — store request_id so the inbound
-- webhook can locate the right contact row when the phone arrives.
--
-- State machine on `contacts`:
--   never tried:        phone_request_id is null AND phone_revealed_at is null
--   in flight:          phone_request_id is not null AND phone_revealed_at is null
--   tried, no phone:    phone_revealed_at is not null AND phone is null
--   tried, got phone:   phone_revealed_at is not null AND phone is not null

alter table contacts add column phone_request_id text;

create index contacts_phone_request_id_idx
  on contacts(phone_request_id)
  where phone_request_id is not null;
