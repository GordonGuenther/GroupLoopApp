#!/bin/sh
#
# Set up the GroupLoop backend: a self-hosted Supabase stack in ./supabase.
#
# Runs Supabase's official docker setup (pinned to SUPABASE_REF) and trims it
# to the services GroupLoop needs.
#
# Variants:
#   dev       Postgres, Auth, REST, Realtime, API gateway + Studio dashboard, mail catcher
#   minimal   Postgres, Auth, REST, Realtime, API gateway
#
# Usage:
#   sh setup.sh                          # interactive
#   sh setup.sh --variant minimal -y     # non-interactive
#   sh setup.sh --variant dev --skip-deps
#
# Other options (-y, --skip-deps, --with-aws) are passed to Supabase's setup.sh.
# Afterwards start the stack with: sh supabase/run.sh start
#

set -e

SUPABASE_REF="self-hosted/v0.8.2"
PROJECT_DIR="supabase"
VARIANT=""
ASSUME_YES=0
PASSTHROUGH=""

die() { printf "ERROR: %s\n" "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
    case "$1" in
        --variant) VARIANT="$2"; shift 2 ;;
        -y|--yes) ASSUME_YES=1; PASSTHROUGH="$PASSTHROUGH $1"; shift ;;
        -h|--help) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) PASSTHROUGH="$PASSTHROUGH $1"; shift ;;
    esac
done

cd "$(dirname "$0")"

[ -e "$PROJECT_DIR" ] && die "$(pwd)/$PROJECT_DIR already exists. Remove it to set up again."

if [ -z "$VARIANT" ]; then
    if [ "$ASSUME_YES" = "1" ] || ! ( : < /dev/tty ) 2>/dev/null; then
        VARIANT="minimal"
    else
        cat > /dev/tty <<PROMPT
Which backend should be set up?
  1) dev      - with Studio dashboard, for developing GroupLoop
  2) minimal  - only what the app needs, for self-hosting
PROMPT
        printf "Choose [2]: " > /dev/tty
        read -r reply < /dev/tty
        case "$reply" in
            1|dev) VARIANT="dev" ;;
            ""|2|minimal) VARIANT="minimal" ;;
            *) die "Unknown choice: $reply" ;;
        esac
    fi
fi

case "$VARIANT" in
    dev) OVERRIDES="slim auth-email mail" ;;
    minimal) OVERRIDES="slim no-studio auth-email" ;;
    *) die "Unknown variant '$VARIANT' (use dev or minimal)" ;;
esac

printf "===> Setting up the '%s' backend (Supabase %s)\n" "$VARIANT" "$SUPABASE_REF"

upstream_setup=$(mktemp)
trap 'rm -f "$upstream_setup"' EXIT
curl -fsSL "https://raw.githubusercontent.com/supabase/supabase/$SUPABASE_REF/docker/setup.sh" \
    -o "$upstream_setup" || die "Could not download Supabase's setup.sh ($SUPABASE_REF)"

# shellcheck disable=SC2086
sh "$upstream_setup" --ref "$SUPABASE_REF" --project-dir "$PROJECT_DIR" $PASSTHROUGH

for name in $OVERRIDES; do
    cp "compose/docker-compose.$name.yml" "$PROJECT_DIR/"
    sh "$PROJECT_DIR/run.sh" config add "$name"
done

printf "\n===> GroupLoop backend ready. Start it with: sh %s/run.sh start\n" "$(pwd)/$PROJECT_DIR"
