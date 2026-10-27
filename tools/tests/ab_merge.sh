#!/bin/sh
# Soma as linhas "DUELO" de vários shards: sh tools/tests/ab_merge.sh .out/ab/nome_*.txt
cat "$@" | grep "^DUELO" | sed -E 's/.*Templo: A ([0-9]+) x B ([0-9]+).*todos os cenários: A ([0-9]+) x B ([0-9]+).*/\1 \2 \3 \4/' | awk '{a+=$1;b+=$2;c+=$3;d+=$4} END {printf "Templo: A %d x B %d (%.1f%% A, ±%.1f) | todos: A %d x B %d (%.1f%% A, ±%.1f)\n", a,b,100*a/(a+b),100*sqrt(.25/(a+b)),c,d,100*c/(c+d),100*sqrt(.25/(c+d))}'
