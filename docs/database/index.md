# Database

As a database supabase is used. 
Find the migrations under `src/supabase/migrations/`.

## Supabase

The following commands are used to interact with the Supabase database.

```bash
# Create a new migration
supabase migration new <migration_name>
# Apply all pending migrations
supabase migration up

# link to staging project
supabase link --project-ref <project_id>

#push the migrations to the database
supabase db push
```

## JWT

To generate a new signing key for JWT used by a local instance, use the following command:

```bash
supabase gen signing-key --algorithm ES256
```