# Contributing

Issues and focused pull requests are welcome.

1. Create a branch from `main`.
2. Run `npm install` and `npm run check`.
3. Add tests for behavior changes. Never use real credentials in tests or fixtures.
4. Keep provider-specific behavior isolated in `src/auth.ts` or `src/image.ts`.

Please describe compatibility implications for both ChatGPT OAuth and API-key users.
