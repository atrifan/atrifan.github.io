/** schema.org SoftwareApplication JSON-LD for a package detail page. Pure. */
import { kindLabel, type PackageKind } from './kinds';

export interface JsonLdPackage {
  name: string;
  description: string;
  type: PackageKind;
  version: string;
  publisher: string;
  rating: number | null;
  ratingCount: number;
  updatedAt: string;
}

export function softwareApplicationJsonLd(pkg: JsonLdPackage, url: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: pkg.name,
    description: pkg.description,
    url,
    applicationCategory: 'DeveloperApplication',
    applicationSubCategory: kindLabel(pkg.type),
    operatingSystem: 'Any',
    softwareVersion: pkg.version,
    dateModified: pkg.updatedAt,
    author: { '@type': 'Organization', name: pkg.publisher },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    ...(pkg.rating !== null && pkg.ratingCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: pkg.rating,
            ratingCount: pkg.ratingCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };
}

/** JSON for a `<script type="application/ld+json">`: `<` is escaped so the data can't close the tag. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
