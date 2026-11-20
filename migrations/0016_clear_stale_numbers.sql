-- Recorded only. The number-catalogue reset is not run from a deploy.
-- A previous version aggregated every imported number row in one transaction,
-- and Postgres closed that connection. Customer data stays where it is.
select 1;
