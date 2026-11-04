/**
 * Architecture rules for qrcode-toolkit.
 *
 * Layers under src/:
 *   domain       pure model, errors, invariants                  -> (nothing)
 *   core         QR algorithm, no runtime globals                -> domain
 *   contracts    provider/capability/plugin interfaces           -> domain
 *   formats      PNG/deflate/base64 writers (no QR knowledge)    -> (nothing)
 *   registry     instance-scoped provider registry               -> contracts, domain
 *   application  use cases and orchestration                     -> contracts, domain
 *   providers/*  built-in adapters (one directory per provider)  -> contracts, domain
 *                (only providers/encoder/* may also use core)
 *   runtimes/*   node / browser specific integrations             -> contracts, domain
 *   public       composition root                                -> everything
 *   index.ts     entry                                           -> public
 *
 * Additionally: no npm dependencies at all in src/ (zero runtime deps),
 * node built-ins only inside src/runtimes/node, no circular imports.
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make modules impossible to reason about and to extract.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-external-dependencies-in-src',
      severity: 'error',
      comment: 'The published package has zero runtime dependencies.',
      from: { path: '^src/' },
      to: {
        dependencyTypes: [
          'npm',
          'npm-dev',
          'npm-optional',
          'npm-peer',
          'npm-bundled',
          'npm-no-pkg',
          'npm-unknown',
        ],
      },
    },
    {
      name: 'node-builtins-only-in-node-runtime',
      severity: 'error',
      comment: 'Universal code must not import node:* modules.',
      from: { path: '^src/', pathNot: '^src/runtimes/node/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'domain-is-isolated',
      severity: 'error',
      comment: 'domain must not depend on any other layer.',
      from: { path: '^src/domain/' },
      to: { path: '^src/', pathNot: '^src/domain/' },
    },
    {
      name: 'core-depends-only-on-domain',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { path: '^src/', pathNot: '^src/(core|domain)/' },
    },
    {
      name: 'formats-are-self-contained',
      severity: 'error',
      comment: 'File-format writers know nothing about QR Codes, providers or the domain.',
      from: { path: '^src/formats/' },
      to: { path: '^src/', pathNot: '^src/formats/' },
    },
    {
      name: 'contracts-depend-only-on-domain',
      severity: 'error',
      from: { path: '^src/contracts/' },
      to: { path: '^src/', pathNot: '^src/(contracts|domain)/' },
    },
    {
      name: 'registry-depends-on-contracts-and-domain',
      severity: 'error',
      from: { path: '^src/registry/' },
      to: { path: '^src/', pathNot: '^src/(registry|contracts|domain)/' },
    },
    {
      name: 'application-depends-on-abstractions-only',
      severity: 'error',
      comment:
        'application orchestrates through contracts; it never imports concrete providers, runtimes or the registry.',
      from: { path: '^src/application/' },
      to: { path: '^src/', pathNot: '^src/(application|contracts|domain)/' },
    },
    {
      name: 'providers-depend-on-contracts-and-domain',
      severity: 'error',
      from: { path: '^src/providers/' },
      to: { path: '^src/', pathNot: '^src/(providers|contracts|domain|core|formats)/' },
    },
    {
      name: 'only-encoder-providers-use-core',
      severity: 'error',
      from: { path: '^src/providers/', pathNot: '^src/providers/encoder/' },
      to: { path: '^src/core/' },
    },
    {
      name: 'no-provider-to-provider-coupling',
      severity: 'error',
      comment:
        'A provider must not import another provider (shared code belongs in contracts or domain).',
      from: { path: '^src/providers/([^/]+/[^/]+)/' },
      to: { path: '^src/providers/', pathNot: '^src/providers/$1/' },
    },
    {
      name: 'runtimes-depend-on-contracts-and-domain',
      severity: 'error',
      from: { path: '^src/runtimes/' },
      to: { path: '^src/', pathNot: '^src/(runtimes|contracts|domain|formats)/' },
    },
    {
      name: 'no-runtime-to-runtime-coupling',
      severity: 'error',
      comment: 'node and browser runtime integrations must stay independent.',
      from: { path: '^src/runtimes/([^/]+)/' },
      to: { path: '^src/runtimes/', pathNot: '^src/runtimes/$1/' },
    },
    {
      name: 'only-public-and-entries-import-public',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/(public/|testing/|[^/]+\\.ts$)' },
      to: { path: '^src/public/' },
    },
    {
      name: 'only-entries-import-testing',
      severity: 'error',
      comment: 'The conformance kit is a separate entry point; library code must not depend on it.',
      from: { path: '^src/', pathNot: '^src/(testing/|[^/]+\\.ts$)' },
      to: { path: '^src/testing/' },
    },
    {
      name: 'testing-depends-on-public-api-only',
      severity: 'error',
      comment:
        'The conformance kit is written against the stable public surface, like any provider package would be.',
      from: { path: '^src/testing/' },
      to: { path: '^src/', pathNot: '^src/(testing|public|contracts|domain)/' },
    },
    {
      name: 'entries-depend-on-public-runtimes-testing-only',
      severity: 'error',
      from: { path: '^src/[^/]+\\.ts$' },
      to: { path: '^src/', pathNot: '^src/(public/|runtimes/|testing/|[^/]+\\.ts$)' },
    },
    {
      name: 'src-must-not-import-tests',
      severity: 'error',
      from: { path: '^src/' },
      to: { path: '^(tests|scripts)/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
