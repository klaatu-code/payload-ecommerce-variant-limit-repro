# plugin-ecommerce: variant joins silently capped at 10

Minimal reproduction for two bugs in `@payloadcms/plugin-ecommerce` 3.90.2. Both come from join queries that pass no `limit` and fall back to the adapter default of 10.

1. **`VariantOptionsSelector` only offers the first 10 options of a variant type.** Options 11+ can never be attached to a variant.
2. **`validateOptions` only compares against 10 sibling variants**, so a product with more than 10 variants accepts duplicate option combinations.

Blank `create-payload-app` template (SQLite). The only changes are `@payloadcms/plugin-ecommerce` in `src/payload.config.ts` and the script in `src/repro.ts`.

## Run

```bash
pnpm install
cp .env.example .env
pnpm repro              # reproduces both bugs
pnpm repro:workaround   # same script with defaultLimit: 0 on the two join fields -> both gone
```

`src/repro.ts` wipes the ecommerce collections, then:

- creates a `color` variant type with 12 options and runs the **same `findByID` query `VariantOptionsSelector` runs**. Only 10 options come back; `white` and `yellow` are missing.
- creates a product with 11 `size` variants, shows that the `validateOptions` join query only returns the 10 newest, then:
  - control: duplicating the newest variant's option is rejected, as expected;
  - bug: duplicating the oldest variant's option (outside the join result) is saved.

Expected output of `pnpm repro`:

```
[Bug 1] options in DB for "color": 12
[Bug 1] options offered by VariantOptionsSelector: 10 [ 'black', 'blue', 'brown', 'gray', 'green', 'navy', 'orange', 'pink', 'purple', 'red' ]
[Bug 1] options the editor can never select: [ 'white', 'yellow' ]

[Bug 2] variants on product: 11 | variants validateOptions compares against: 10
[Bug 2] variants outside the join result: [ 1 ]
[Bug 2] control: duplicate of a visible sibling rejected: The following field is invalid: Variant options
[Bug 2] DUPLICATE SAVED: option 13 already used by variant 1

Result: bug1=REPRODUCED bug2=REPRODUCED
```
