import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import { ecommercePlugin } from '@payloadcms/plugin-ecommerce'
import type { Access, CollectionConfig, FieldAccess } from 'payload'

import { Users } from './collections/Users'
import { Media } from './collections/Media'

const isAdmin: Access = ({ req }) => Boolean(req.user)
const adminField: FieldAccess = ({ req }) => Boolean(req.user)

// Set REPRO_WORKAROUND=1 to apply the workaround: unbounded defaultLimit on the
// two join fields the plugin queries without a limit.
const unboundJoin =
  (name: string) =>
  ({ defaultCollection }: { defaultCollection: CollectionConfig }): CollectionConfig =>
    process.env.REPRO_WORKAROUND === '1'
      ? {
          ...defaultCollection,
          fields: defaultCollection.fields.map((field) =>
            'name' in field && field.name === name && field.type === 'join'
              ? { ...field, defaultLimit: 0 }
              : field,
          ),
        }
      : defaultCollection

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URL || '',
    },
  }),
  sharp,
  plugins: [
    ecommercePlugin({
      access: {
        adminOnlyFieldAccess: adminField,
        adminOrPublishedStatus: isAdmin,
        isAdmin,
        isDocumentOwner: isAdmin,
      },
      customers: { slug: 'users' },
      products: {
        productsCollectionOverride: unboundJoin('variants'),
        variants: { variantTypesCollectionOverride: unboundJoin('options') },
      },
    }),
  ],
})
