# Contributing

Thanks for helping. This project aims to be a small, correct, dependency-free QR Code toolkit; changes are judged on correctness, clarity and maintenance cost.

## Setup

```bash
npm install
npm run check
```

This is an npm workspace: `packages/react`, `packages/vue`, `packages/svelte` and `packages/angular` are the framework packages (Angular is built with ng-packagr and published from its `dist` folder), built on the public API of the root package (they import it by its name; tests and type checks resolve that to `src/`). Their peer dependency on `qrcode-toolkit` has to be satisfiable from the registry for `npm install` to work, so after publishing a new core version raise the range in the four `package.json` files to it.

Requires Node.js `^22.12 || >=24`. `npm run check` runs formatting, lint, type checks (including a check that universal code compiles without Node.js or DOM typings), the architecture rules, all tests, the build, and the packed-tarball verification.

## Ground rules

- **No runtime dependencies**, ever. Libraries used for verification are `devDependencies` and live only under `tests/` and `bench/`.
- **Respect the layers**. `npm run arch` fails on forbidden imports; do not weaken a rule to make a change pass. A new rule needs a fixture under `tests/architecture/fixtures` that triggers it.
- **Correctness is evidence-based.** Changes to the encoder need tests that compare against independent implementations or decoders; a passing render is not proof.
- **Never skip, weaken or delete a test to get a green build.** If a test is wrong, fix it and say why in the pull request.
- **No silent behaviour.** Unsupported options raise typed errors; errors never include user data.
- Public API changes need a changelog entry and, for contracts, a note on compatibility (`apiVersion`).

## Pull requests

1. Open an issue first for anything beyond a small fix.
2. Keep the change focused; add or update tests and documentation.
3. Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages (`feat(core): …`, `fix(svg): …`).
4. Make sure `npm run check` passes.

## Reporting security problems

See [SECURITY.md](SECURITY.md). Do not file public issues for vulnerabilities.
