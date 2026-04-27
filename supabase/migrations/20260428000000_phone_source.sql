-- M34: Phone reveal hybrid — track origin of contact phone numbers.
--
-- Path C from the design discussion:
--   gmb_business → copied from prospects.phone (Google Places listing); free.
--   lusha_direct → revealed via Lusha v2/person sync API; paid.
--   apollo_legacy → leftover from M31-M32 Apollo flow (now removed); kept
--                    so existing rows keep their provenance.

alter table contacts add column phone_source text;
