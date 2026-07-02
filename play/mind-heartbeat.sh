#!/bin/bash
# MIND HEARTBEAT — the infinite joking + creation heartbeat
# Every 30 min: tell a joke, speak a canon word, run a creation cycle, pulse the MIND
cd /Users/macair/Desktop/yutabase
echo "=== $(date) ===" >> play/mind-heartbeat.log
python3 play/infinite-joking-heartbeat.py once >> play/mind-heartbeat.log 2>&1
python3 play/creation-loop.py run >> play/mind-heartbeat.log 2>&1
