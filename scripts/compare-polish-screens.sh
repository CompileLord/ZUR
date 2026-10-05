#!/usr/bin/env bash
set -euo pipefail

# scripts/compare-polish-screens.sh
# Visual side-by-side comparison tool for polish screenshots.
#
# Usage:
#   bash scripts/compare-polish-screens.sh <before-round> <after-round> [group]
#
# Options (env vars):
#   FULL=1     Include *_full.png variants (skipped by default)
#   JOBS=<n>   Maximum parallel ImageMagick processes (default: up to nproc / 8)

if [ $# -lt 2 ]; then
  echo "Usage: $0 <before-round> <after-round> [group]"
  echo ""
  echo "Arguments:"
  echo "  <before-round>  Source directory name under screenshots/polish/ (e.g. round0)"
  echo "  <after-round>   Target directory name under screenshots/polish/ (e.g. round1)"
  echo "  [group]         Optional filter: only match files starting with <group>__"
  echo ""
  echo "Environment Variables:"
  echo "  FULL=1          Include *_full.png variants (default: skipped)"
  echo "  JOBS=<n>        Number of parallel comparison jobs (default: auto)"
  exit 1
fi

BEFORE_ROUND="$1"
AFTER_ROUND="$2"
GROUP="${3:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
POLISH_DIR="$REPO_ROOT/screenshots/polish"

BEFORE_DIR="$POLISH_DIR/$BEFORE_ROUND"
AFTER_DIR="$POLISH_DIR/$AFTER_ROUND"
COMPARE_DIR="$POLISH_DIR/compare/${BEFORE_ROUND}_vs_${AFTER_ROUND}"

if [ ! -d "$BEFORE_DIR" ]; then
  echo "Error: Before round directory not found: $BEFORE_DIR" >&2
  exit 1
fi

if [ ! -d "$AFTER_DIR" ]; then
  echo "Error: After round directory not found: $AFTER_DIR" >&2
  exit 1
fi

# Locate ImageMagick binary
MAGICK_CMD="${MAGICK:-/usr/bin/magick}"
if ! command -v "$MAGICK_CMD" &>/dev/null; then
  if command -v magick &>/dev/null; then
    MAGICK_CMD="magick"
  else
    echo "Error: ImageMagick 'magick' binary not found at $MAGICK_CMD or in PATH." >&2
    exit 1
  fi
fi

# Determine fonts for headers
FONT_BOLD="Liberation-Sans-Bold"
FONT_REGULAR="Liberation-Sans"
if ! fc-list : family 2>/dev/null | grep -q "Liberation Sans"; then
  if fc-list : family 2>/dev/null | grep -q "DejaVu Sans"; then
    FONT_BOLD="DejaVu-Sans-Bold"
    FONT_REGULAR="DejaVu-Sans"
  else
    FONT_BOLD="sans-serif"
    FONT_REGULAR="sans-serif"
  fi
fi

mkdir -p "$COMPARE_DIR"

# Collect candidate files
shopt -s nullglob
if [ -n "$GROUP" ]; then
  BEFORE_CANDIDATES=("$BEFORE_DIR/${GROUP}__"*.png)
  AFTER_CANDIDATES=("$AFTER_DIR/${GROUP}__"*.png)
else
  BEFORE_CANDIDATES=("$BEFORE_DIR/"*.png)
  AFTER_CANDIDATES=("$AFTER_DIR/"*.png)
fi

INCLUDE_FULL="${FULL:-0}"

BEFORE_FILES=()
for p in "${BEFORE_CANDIDATES[@]}"; do
  f="$(basename "$p")"
  if [ "$INCLUDE_FULL" != "1" ] && [ "$INCLUDE_FULL" != "true" ] && [[ "$f" == *_full.png ]]; then
    continue
  fi
  BEFORE_FILES+=("$f")
done

AFTER_FILES=()
for p in "${AFTER_CANDIDATES[@]}"; do
  f="$(basename "$p")"
  if [ "$INCLUDE_FULL" != "1" ] && [ "$INCLUDE_FULL" != "true" ] && [[ "$f" == *_full.png ]]; then
    continue
  fi
  AFTER_FILES+=("$f")
done

# Index and identify common vs missing
declare -A IN_BEFORE=()
declare -A IN_AFTER=()

for f in "${BEFORE_FILES[@]}"; do
  IN_BEFORE["$f"]=1
done

for f in "${AFTER_FILES[@]}"; do
  IN_AFTER["$f"]=1
done

COMMON_FILES=()
MISSING_IN_AFTER=()
for f in "${BEFORE_FILES[@]}"; do
  if [ "${IN_AFTER["$f"]:-0}" = "1" ]; then
    COMMON_FILES+=("$f")
  else
    MISSING_IN_AFTER+=("$f")
  fi
done

MISSING_IN_BEFORE=()
for f in "${AFTER_FILES[@]}"; do
  if [ "${IN_BEFORE["$f"]:-0}" != "1" ]; then
    MISSING_IN_BEFORE+=("$f")
  fi
done

if [ ${#COMMON_FILES[@]} -gt 0 ]; then
  mapfile -t COMMON_FILES < <(printf '%s\n' "${COMMON_FILES[@]}" | sort)
fi
if [ ${#MISSING_IN_AFTER[@]} -gt 0 ]; then
  mapfile -t MISSING_IN_AFTER < <(printf '%s\n' "${MISSING_IN_AFTER[@]}" | sort)
fi
if [ ${#MISSING_IN_BEFORE[@]} -gt 0 ]; then
  mapfile -t MISSING_IN_BEFORE < <(printf '%s\n' "${MISSING_IN_BEFORE[@]}" | sort)
fi

echo "=================================================="
echo "Comparing polish screens: $BEFORE_ROUND vs $AFTER_ROUND"
if [ -n "$GROUP" ]; then
  echo "Filter group: $GROUP"
fi
echo "Common screens to compare: ${#COMMON_FILES[@]}"
if [ "$INCLUDE_FULL" = "1" ] || [ "$INCLUDE_FULL" = "true" ]; then
  echo "Including _full screenshot variants: yes"
else
  echo "Including _full screenshot variants: no (FULL=1 to enable)"
fi
echo "=================================================="

if [ ${#COMMON_FILES[@]} -eq 0 ]; then
  echo "No common screenshot files found between $BEFORE_ROUND and $AFTER_ROUND."
  if [ ${#MISSING_IN_AFTER[@]} -gt 0 ]; then
    echo ""
    echo "Present only in $BEFORE_ROUND (${#MISSING_IN_AFTER[@]}):"
    for f in "${MISSING_IN_AFTER[@]}"; do
      echo "  - $f"
    done
  fi
  if [ ${#MISSING_IN_BEFORE[@]} -gt 0 ]; then
    echo ""
    echo "Present only in $AFTER_ROUND (${#MISSING_IN_BEFORE[@]}):"
    for f in "${MISSING_IN_BEFORE[@]}"; do
      echo "  - $f"
    done
  fi
  exit 0
fi

# Comparison worker function
compare_one() {
  local fname="$1"
  local before_img="$BEFORE_DIR/$fname"
  local after_img="$AFTER_DIR/$fname"
  local out_img="$COMPARE_DIR/$fname"

  "$MAGICK_CMD" \
    \( \
      \( -size 1200x56 xc:'#1e1e1e' \
         -font "$FONT_BOLD" -pointsize 22 -fill '#ffffff' -gravity west -annotate +20+0 "BEFORE · $BEFORE_ROUND" \
         -font "$FONT_REGULAR" -pointsize 20 -fill '#d1d5db' -gravity east -annotate +20+0 "$fname" \) \
      \( "$before_img" -resize 1200x \) \
      -append \
    \) \
    \( \
      \( -size 1200x56 xc:'#1e1e1e' \
         -font "$FONT_BOLD" -pointsize 22 -fill '#38bdf8' -gravity west -annotate +20+0 "NOW · $AFTER_ROUND" \
         -font "$FONT_REGULAR" -pointsize 20 -fill '#d1d5db' -gravity east -annotate +20+0 "$fname" \) \
      \( "$after_img" -resize 1200x \) \
      -append \
    \) \
    -background '#2a2a2a' -gravity north +smush 24 \
    -bordercolor '#2a2a2a' -border 14x14 \
    "$out_img"
}

# Determine parallelism
MAX_JOBS="${JOBS:-$(nproc 2>/dev/null || echo 4)}"
if [ "$MAX_JOBS" -gt 8 ]; then
  MAX_JOBS=8
fi
if [ "$MAX_JOBS" -lt 1 ]; then
  MAX_JOBS=1
fi

total=${#COMMON_FILES[@]}
count=0
running=0

for fname in "${COMMON_FILES[@]}"; do
  compare_one "$fname" &
  running=$((running + 1))
  if [ "$running" -ge "$MAX_JOBS" ]; then
    wait -n
    running=$((running - 1))
  fi
  count=$((count + 1))
  printf "\rGenerating comparisons: %d/%d" "$count" "$total"
done
wait
printf "\rGenerating comparisons: %d/%d (done)\n" "$total" "$total"

# Generate index.md
echo "Writing index.md..."
INDEX_FILE="$COMPARE_DIR/index.md"
shopt -s nullglob
ALL_COMPARES=("$COMPARE_DIR/"*.png)

{
  echo "# Visual Polish Comparisons: \`${BEFORE_ROUND}\` vs \`${AFTER_ROUND}\`"
  echo ""
  echo "- **Before round:** \`${BEFORE_ROUND}\`"
  echo "- **Now round:** \`${AFTER_ROUND}\`"
  if [ -n "$GROUP" ]; then
    echo "- **Filter group:** \`${GROUP}\`"
  fi
  echo "- **Total comparisons in folder:** ${#ALL_COMPARES[@]}"
  echo ""

  # Collect distinct groups from comparison files
  declare -A group_map=()
  for p in "${ALL_COMPARES[@]}"; do
    f="$(basename "$p")"
    if [[ "$f" == *__* ]]; then
      g="${f%%__*}"
    else
      g="other"
    fi
    group_map["$g"]=1
  done

  sorted_groups=()
  if [ ${#group_map[@]} -gt 0 ]; then
    mapfile -t sorted_groups < <(printf '%s\n' "${!group_map[@]}" | sort)
  fi

  for g in "${sorted_groups[@]}"; do
    echo "## Group: \`${g}\`"
    echo ""
    for p in "${ALL_COMPARES[@]}"; do
      f="$(basename "$p")"
      if [[ "$f" == *__* ]]; then
        fg="${f%%__*}"
      else
        fg="other"
      fi
      if [ "$fg" = "$g" ]; then
        echo "### \`${f}\`"
        echo ""
        echo "[![${f}](./${f})](./${f})"
        echo ""
      fi
    done
  done
} > "$INDEX_FILE"

echo ""
echo "=================================================="
echo "Comparison Summary"
echo "Output directory: $COMPARE_DIR"
echo "Total comparisons generated: ${#COMMON_FILES[@]}"
echo "Index markdown file: $INDEX_FILE"

if [ ${#MISSING_IN_AFTER[@]} -gt 0 ]; then
  echo ""
  echo "Missing in $AFTER_ROUND (${#MISSING_IN_AFTER[@]} files):"
  for f in "${MISSING_IN_AFTER[@]}"; do
    echo "  - $f"
  done
fi

if [ ${#MISSING_IN_BEFORE[@]} -gt 0 ]; then
  echo ""
  echo "Missing in $BEFORE_ROUND (${#MISSING_IN_BEFORE[@]}):"
  for f in "${MISSING_IN_BEFORE[@]}"; do
    echo "  - $f"
  done
fi

if [ ${#MISSING_IN_AFTER[@]} -eq 0 ] && [ ${#MISSING_IN_BEFORE[@]} -eq 0 ]; then
  echo ""
  echo "Missing files: none (all target screens match between rounds)"
fi
echo "=================================================="
