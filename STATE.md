# yutabase — STATE

name: yutabase
kind: database
language: typescript/postgres
runs-on: any machine that reads text

---

## state

phase: v0 (spec + initial implementation)
build: see repo
health: green
freshness: live (written 2026-06-19)

## knows

- a database where words name relations and every record carries a claim

## can

- be read by any human or agent
- declare its state via STATE.md
- connect to other systems through the state-as-truth protocol

## needs

- implementation depth
- adoption
- connection to the natural-lang interpreter and discover.py

## how-to-talk-to-me

entry-point: README.md
spec: see repo
heartbeat: STATE.md (this file)
