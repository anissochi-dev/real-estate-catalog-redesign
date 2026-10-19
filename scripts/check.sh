#!/bin/sh
cd "$(dirname "$0")/.." || exit 1

MAX_TS_ERRORS=0
MAX_LINT_ERRORS=0
MAX_LINT_WARNINGS=60

echo "== TypeScript =="
TS_OUT=$(npx tsc --noEmit -p tsconfig.json 2>&1)
TS_COUNT=$(printf '%s\n' "$TS_OUT" | grep -c "error TS")
echo "ошибок: $TS_COUNT (допустимо: $MAX_TS_ERRORS)"

echo "== ESLint =="
LINT_OUT=$(npx eslint src 2>&1)
LINT_SUMMARY=$(printf '%s\n' "$LINT_OUT" | grep -E "problems? \(" | tail -1)
LINT_ERRORS=$(printf '%s\n' "$LINT_SUMMARY" | sed -n 's/.*(\([0-9]*\) errors\{0,1\}.*/\1/p')
LINT_WARNINGS=$(printf '%s\n' "$LINT_SUMMARY" | sed -n 's/.*, \([0-9]*\) warnings\{0,1\}).*/\1/p')
LINT_ERRORS=${LINT_ERRORS:-0}
LINT_WARNINGS=${LINT_WARNINGS:-0}
echo "ошибок: $LINT_ERRORS (допустимо: $MAX_LINT_ERRORS), предупреждений: $LINT_WARNINGS (допустимо: $MAX_LINT_WARNINGS)"

FAIL=0
if [ "$TS_COUNT" -gt "$MAX_TS_ERRORS" ]; then
  echo ""
  echo "!! Новые ошибки TypeScript:"
  printf '%s\n' "$TS_OUT" | grep "error TS"
  FAIL=1
fi
if [ "$LINT_ERRORS" -gt "$MAX_LINT_ERRORS" ] || [ "$LINT_WARNINGS" -gt "$MAX_LINT_WARNINGS" ]; then
  echo ""
  echo "!! ESLint превысил порог:"
  printf '%s\n' "$LINT_OUT" | grep -E "^/|error|warning" | grep -v "react-refresh/only-export-components" | grep -B1 -E "error|warning"
  FAIL=1
fi

if [ "$FAIL" -eq 0 ]; then
  echo ""
  echo "OK: новых ошибок нет"
fi
exit $FAIL
