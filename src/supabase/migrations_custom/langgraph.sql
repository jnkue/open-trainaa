-- LANGGRAPH TABLES
-- These are the tabels created by langgraph on the first start
-- These SQL queries must be run manually once


ALTER TABLE "public"."checkpoint_blobs" ENABLE ROW LEVEL SECURITY;
create policy "grant service_role" on "public"."checkpoint_blobs" as PERMISSIVE for ALL to service_role;


ALTER TABLE public.checkpoint_migrations ENABLE ROW LEVEL SECURITY;
create policy "grant service_role" on "public"."checkpoint_migrations" as PERMISSIVE for ALL to service_role;

ALTER TABLE public.checkpoint_writes ENABLE ROW LEVEL SECURITY;
create policy "grant service_role" on "public"."checkpoint_writes" as PERMISSIVE for ALL to service_role;

ALTER TABLE public.checkpoints ENABLE ROW LEVEL SECURITY;
create policy "grant service_role" on "public"."checkpoints" as PERMISSIVE for ALL to service_role;
