#!/bin/sh
#
# Apply the GroupLoop database migrations to the running backend.
# Migrations are idempotent, so running this again is safe.
#
# Usage: sh migrate.sh
#

set -e

cd "$(dirname "$0")"

for file in migrations/*.sql; do
    printf "===> Applying %s\n" "$file"
    docker exec -i supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$file"
done

# Invitation emails need the backend's settings inside the database.
env_value() {
    grep "^$1=" supabase/.env | head -n 1 | cut -d= -f2- | sed 's/^"\(.*\)"$/\1/'
}

site_url=$(env_value SITE_URL)
# Supabase's default is no GroupLoop web app.
[ "$site_url" = "http://localhost:3000" ] && site_url=""

printf "===> Storing backend settings for invitation emails\n"
docker exec -i supabase-db psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
\set service_key '$(env_value SERVICE_ROLE_KEY)'
\set anon_key '$(env_value ANON_KEY)'
\set api_url '$(env_value SUPABASE_PUBLIC_URL)'
\set site_url '$site_url'
select public.set_backend_secret('grouploop_service_role_key', :'service_key');
select public.set_backend_secret('grouploop_anon_key', :'anon_key');
select public.set_backend_secret('grouploop_api_url', :'api_url');
select public.set_backend_secret('grouploop_site_url', :'site_url');
SQL
