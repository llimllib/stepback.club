#!/usr/bin/env bash
# Install or update traffic.py on the server: copy it, run it once, and add
# its cron job if it isn't there. Safe to rerun.
# shellcheck disable=SC2029 # $dir and $cron are meant to expand locally
set -euo pipefail

server=${SERVER:-root@billmill.org}
dir=/root/nba-traffic
cron="5 * * * * python3 $dir/traffic.py >> /tmp/nba-traffic.log 2>&1"

ssh "$server" mkdir -p "$dir"
scp "$(dirname "$0")/traffic.py" "$server:$dir/"
ssh "$server" python3 "$dir/traffic.py"
ssh "$server" "crontab -l | grep -qF '$dir/traffic.py' || {
  crontab -l
  echo
  echo '# at 5 past every hour, write static/nba-traffic.html (nba0bservable ops/traffic)'
  echo '$cron'
} | crontab -"
echo "https://billmill.org/static/nba-traffic.html"
