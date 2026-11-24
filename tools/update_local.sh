#!/usr/bin/env bash
# 로컬 자동 갱신: 수집 → 통계 → 커밋 → main·gh-pages 푸시
# 작업 스케줄러(Windows)에서 Git Bash로 실행한다. GitHub Actions를 쓸 수 없을 때의 대안.
set -u
cd "$(dirname "$0")/.." || exit 1
LOG="tools/update_local.log"
{
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') start"
  git pull -q --rebase origin main || echo "pull failed"
  python -I collector/collect.py || { echo "collect failed"; exit 1; }
  python -I analysis/stats.py > /dev/null || echo "stats failed"
  git add site/data analysis/stats.json
  if git diff --cached --quiet; then
    echo "no change"
  else
    git commit -q -m "데이터 갱신 $(date '+%Y-%m-%d %H:%M')" && git push -q origin main
    git push -q -f origin "$(git subtree split --prefix site HEAD)":refs/heads/gh-pages && echo "deployed"
  fi
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') end"
} >> "$LOG" 2>&1
