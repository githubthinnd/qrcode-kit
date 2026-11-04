# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Project foundation: strict TypeScript, `tsc` build, ESLint, Prettier, Vitest.
- Typed error model (`QRCodeKitError` and subclasses).
- Architecture rules enforced by dependency-cruiser, with tests proving each rule fires.
- Packed-tarball verification (ESM, `require(esm)`, TypeScript consumer, publint, attw).
