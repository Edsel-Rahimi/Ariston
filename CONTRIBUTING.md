# Contributing to Ariston

Thanks for helping keep the reservoir clean! Contributions are welcome.

## Add a public source

1. Verify the source is alive and public (it must return endpoint URIs directly or as base64).
2. Edit [`pipeline/sources.json`](pipeline/sources.json) and add an entry:

```json
{ "id": "my-source", "type": "http", "url": "https://example.com/feed.txt", "enabled": true }
{ "id": "tg-channel", "type": "telegram", "channel": "ChannelName", "enabled": true }
```

3. Open a PR with the title `source: add <id>`.
4. Sources are ordered — earlier entries win dedupe. Place yours at the bottom unless it is higher quality.

Rules for sources:
- public and free to access (no credentials, no scraping behind paywalls)
- machine-readable (raw text or base64)
- actively maintained

## Code

- Python ≥ 3.10, **standard library only** for the collector stages
- run locally: `python -m pipeline.main collect`
- keep functions small and self-contained; a broken item must never break a run

## Naming policy (important)

This project deliberately uses **neutral vocabulary** in file names, docs, code and commit messages. Avoid dramatic keywords when naming things; keep it boring, technical and descriptive. PRs that violate this will be edited before merge.

## Reporting dead or wrong data

Open an issue with the file name and (if possible) the line. We only index public data — see the disclaimer in the README.
