/**
 * Minimal reproduction for two plugin-ecommerce join-limit bugs.
 * Run with: pnpm repro   (wipes and reseeds the local SQLite db)
 */
import config from '@payload-config'
import { getPayload } from 'payload'

const payload = await getPayload({ config })

for (const slug of ['variants', 'products', 'variantOptions', 'variantTypes'] as const) {
  await payload.delete({ collection: slug, where: { id: { exists: true } }, trash: true } as never)
}

const COLORS = ['black', 'blue', 'brown', 'gray', 'green', 'navy', 'orange', 'pink', 'purple', 'red', 'white', 'yellow']
const SIZES = Array.from({ length: 12 }, (_, i) => `size-${String(i + 1).padStart(2, '0')}`)

async function createType(name: string, values: string[]) {
  const type = await payload.create({ collection: 'variantTypes', data: { label: name, name } })
  const options = []
  for (const value of values) {
    options.push(
      await payload.create({ collection: 'variantOptions', data: { label: value, value, variantType: type.id } }),
    )
  }
  return { type, options }
}

// ---------------------------------------------------------------------------
// Bug 1: the options selector only sees the first 10 options of a variant type
// ---------------------------------------------------------------------------
const color = await createType('color', COLORS)

// Exactly the query VariantOptionsSelector runs for each variant type:
const asSelectorSeesIt = await payload.findByID({
  collection: 'variantTypes',
  id: color.type.id,
  depth: 1,
  joins: { options: { sort: 'value' } },
})
const offered = (asSelectorSeesIt.options?.docs ?? []).map((o) => (typeof o === 'object' ? o.value : o))
const missing = COLORS.filter((c) => !offered.includes(c))

console.log('\n[Bug 1] options in DB for "color":', COLORS.length)
console.log('[Bug 1] options offered by VariantOptionsSelector:', offered.length, offered)
console.log('[Bug 1] options the editor can never select:', missing)

// ---------------------------------------------------------------------------
// Bug 2: duplicate-variant validation only checks the first 10 sibling variants
// ---------------------------------------------------------------------------
const size = await createType('size', SIZES)
const shirt = await payload.create({
  collection: 'products',
  data: { enableVariants: true, variantTypes: [size.type.id], _status: 'published' } as never,
})

const created = []
for (const option of size.options.slice(0, 11)) {
  created.push(
    await payload.create({
      collection: 'variants',
      data: { product: shirt.id, options: [option.id], _status: 'published' } as never,
    }),
  )
}

// Which siblings does validateOptions actually compare against?
const asValidatorSeesIt = await payload.findByID({
  collection: 'products',
  id: shirt.id,
  depth: 1,
  joins: { variants: { where: { deletedAt: { exists: false } } } },
  select: { variants: true, variantTypes: true },
})
const seenIds = (asValidatorSeesIt.variants?.docs ?? []).map((v) => (typeof v === 'object' ? v.id : v))
const unseen = created.filter((v) => !seenIds.includes(v.id))
console.log('\n[Bug 2] variants on product:', created.length, '| variants validateOptions compares against:', seenIds.length)
console.log('[Bug 2] variants outside the join result:', unseen.map((v) => v.id))

const optionIdOf = (variant: { options?: unknown }) =>
  (variant.options as unknown[]).map((o) => (typeof o === 'object' ? (o as { id: number }).id : o))[0]

// Control: a duplicate of a sibling that IS inside the first 10 is rejected.
// Run it first, while the join result is still exactly the 10 newest variants.
const seenSibling = created[created.length - 1]
try {
  await payload.create({
    collection: 'variants',
    data: { product: shirt.id, options: [optionIdOf(seenSibling)], _status: 'published' } as never,
  })
  console.log('[Bug 2] control: duplicate of a visible sibling was saved (unexpected)')
} catch (e) {
  console.log('[Bug 2] control: duplicate of a visible sibling rejected:', (e as Error).message)
}

let duplicates = 0
for (const sibling of unseen) {
  const optionId = optionIdOf(sibling)
  try {
    await payload.create({
      collection: 'variants',
      data: { product: shirt.id, options: [optionId], _status: 'published' } as never,
    })
    duplicates++
    console.log(`[Bug 2] DUPLICATE SAVED: option ${optionId} already used by variant ${sibling.id}`)
  } catch (e) {
    console.log(`[Bug 2] rejected as expected for option ${optionId}:`, (e as Error).message)
  }
}

console.log(`\nResult: bug1=${missing.length > 0 ? 'REPRODUCED' : 'not reproduced'} bug2=${duplicates > 0 ? 'REPRODUCED' : 'not reproduced'}`)
process.exit(0)
