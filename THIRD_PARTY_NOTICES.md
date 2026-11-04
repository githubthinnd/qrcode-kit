# Third-party notices

qrcode-toolkit has no runtime dependencies. One optional entry point, `qrcode-toolkit/kanji`, contains data derived from a third-party table.

## JIS X 0208 to Unicode mapping (`qrcode-toolkit/kanji`)

The character table in `dist/kanji-table/table.js` and the repertoire layout in `dist/core/jis-x-0208.js` are generated from the Unicode Consortium's data file:

> JIS0208.TXT — "JIS X 0208 (1990) to Unicode", table version 2.0, 2011-10-14 (header updated 2015-12-02)
> © 2015 Unicode®, Inc.
> For terms of use, see <https://www.unicode.org/terms_of_use.html>
> Obtained from <https://unicode.org/Public/MAPPINGS/OBSOLETE/EASTASIA/JIS/JIS0208.TXT>

Unicode and the Unicode Logo are registered trademarks of Unicode, Inc. in the United States and other countries. The unmodified source file is kept in the repository at `tests/fixtures/jis0208/JIS0208.TXT` (SHA-256 `1c571870457f19c97720631fa83ee491549a96ba1436da1296786a67d8632e87`) and is used by the test suite to verify the generated data; it is not part of the published package. `scripts/generate-jis-x-0208.mjs` regenerates the data from it.
