# Security Policy

## Scope

Ariston is a data aggregation pipeline. It runs inside GitHub Actions, fetches only public text feeds, and publishes files to a git branch. It holds no secrets other than the built-in `GITHUB_TOKEN`, which is limited to `contents: write`.

## Reporting

- **Vulnerable code:** open a private security advisory (Security tab) or contact the maintainer via GitHub.
- **Wrong/abusive data indexed:** open a regular issue — it will be removed immediately.
- **Abuse of this project:** see the disclaimer in the README; the project only indexes publicly available data.

## Supported versions

Only the latest commit on `main` is supported.
