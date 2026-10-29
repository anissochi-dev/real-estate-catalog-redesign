import { photoAlt } from '@/lib/slug';
import { useMemo } from 'react';

interface SchemaOrgProps {
  schema: Record<string, unknown> | Record<string, unknown>[];
  id?: string;
}

/**
 * JSON-LD Schema.org прямо в разметке страницы — попадает в HTML с сервера,
 * поисковики видят его без выполнения JavaScript.
 */
export default function SchemaOrg({ schema, id }: SchemaOrgProps) {
  const json = useMemo(() => JSON.stringify(schema).replace(/</g, '\\u003c'), [schema]);
  return (
    <script
      type="application/ld+json"
      id={id ? `schema-org-${id}` : undefined}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}

/* ───────── Фабрики схем ───────── */

export function makeOrganizationSchema(opts: {
  name: string;
  url: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  logo?: string;
  description?: string;
  foundingYear?: string | number;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': ['Organization', 'LocalBusiness', 'RealEstateAgent'],
    '@id': `${opts.url}/#organization`,
    name: opts.name,
    url: opts.url,
    ...(opts.description ? { description: opts.description } : {}),
    ...(opts.logo ? { logo: { '@type': 'ImageObject', url: opts.logo }, image: opts.logo } : {}),
    ...(opts.phone ? { telephone: opts.phone } : {}),
    ...(opts.email ? { email: opts.email } : {}),
    ...(opts.foundingYear ? { foundingDate: String(opts.foundingYear) } : {}),
    priceRange: '₽₽',
    openingHours: ['Mo-Fr 09:00-19:00', 'Sa 10:00-16:00'],
    areaServed: [
      { '@type': 'City', name: opts.city || 'Краснодар' },
      { '@type': 'State', name: 'Краснодарский край' },
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      availableLanguage: 'Russian',
      ...(opts.phone ? { telephone: opts.phone } : {}),
    },
    ...(opts.address || opts.city ? {
      address: {
        '@type': 'PostalAddress',
        addressLocality: opts.city || 'Краснодар',
        addressCountry: 'RU',
        ...(opts.address ? { streetAddress: opts.address } : {}),
      },
    } : {}),
  };
}

export function makeWebSiteSchema(opts: { name: string; url: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${opts.url}/#website`,
    name: opts.name,
    url: opts.url,
    inLanguage: 'ru-RU',
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${opts.url}/catalog?search={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function makeBreadcrumbSchema(items: { name: string; url?: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      ...(item.url ? { url: item.url } : {}),
    })),
  };
}

function buildVideoEmbed(videoUrl: string, videoType: string): string {
  if (videoType === 'rutube') {
    const match = videoUrl.match(/rutube\.ru\/video\/([a-zA-Z0-9_-]+)/);
    return match ? `https://rutube.ru/play/embed/${match[1]}` : videoUrl;
  }
  // VK даёт embed URL напрямую; для остальных — как есть
  return videoUrl;
}

export function makeRealEstateSchema(opts: {
  title: string;
  description?: string;
  url: string;
  images: string[];
  price: number;
  deal: string;
  type: string;
  area: number;
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
  floor?: number;
  rooms?: number | null;
  sellerName?: string;
  sellerUrl?: string;
  updatedAt?: string;
  publicCode?: number;
  videoUrl?: string;
  videoType?: string;
}) {
  const isRent = opts.deal === 'rent';
  const addressStr = [opts.city || 'Краснодар', opts.address].filter(Boolean).join(', ');

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: opts.title,
    ...(opts.description ? { description: opts.description } : {}),
    ...(opts.images.length ? {
      image: opts.images.map((url, i) => ({
        '@type': 'ImageObject',
        url,
        contentUrl: url,
        caption: photoAlt({ title: opts.title, address: opts.address, city: opts.city }, i),
      })),
    } : {}),
    url: opts.url,
    category: opts.type,
    ...(opts.publicCode ? { productID: String(opts.publicCode) } : {}),
    ...(opts.updatedAt ? { dateModified: opts.updatedAt } : {}),
    offers: {
      '@type': 'Offer',
      url: opts.url,
      priceCurrency: 'RUB',
      price: opts.price,
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: opts.price,
        priceCurrency: 'RUB',
        ...(isRent ? { referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' } } : {}),
      },
      availability: 'https://schema.org/InStock',
      ...(opts.sellerName ? {
        seller: {
          '@type': 'Organization',
          name: opts.sellerName,
          ...(opts.sellerUrl ? { url: opts.sellerUrl } : {}),
        },
      } : {}),
    },
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'Площадь', value: `${opts.area} м²`, unitCode: 'MTK' },
      { '@type': 'PropertyValue', name: 'Тип объекта', value: opts.type },
      { '@type': 'PropertyValue', name: 'Тип сделки', value: isRent ? 'Аренда' : opts.deal === 'sale' ? 'Продажа' : 'Готовый бизнес' },
      ...(opts.floor ? [{ '@type': 'PropertyValue', name: 'Этаж', value: opts.floor }] : []),
      ...(opts.rooms ? [{ '@type': 'PropertyValue', name: 'Комнат', value: opts.rooms }] : []),
    ],
    ...(addressStr ? {
      locationCreated: {
        '@type': 'Place',
        name: addressStr,
        address: {
          '@type': 'PostalAddress',
          streetAddress: opts.address || '',
          addressLocality: opts.city || 'Краснодар',
          addressCountry: 'RU',
        },
        ...(opts.lat && opts.lng ? {
          geo: { '@type': 'GeoCoordinates', latitude: opts.lat, longitude: opts.lng },
        } : {}),
      },
    } : {}),
    ...(opts.videoUrl ? {
      video: {
        '@type': 'VideoObject',
        name: opts.title,
        ...(opts.description ? { description: opts.description } : {}),
        ...(opts.images.length ? { thumbnailUrl: opts.images[0] } : {}),
        embedUrl: buildVideoEmbed(opts.videoUrl, opts.videoType || 'other'),
        ...(opts.updatedAt ? { uploadDate: opts.updatedAt } : {}),
      },
    } : {}),
  };

  return schema;
}

export function makeVideoObjectSchema(opts: {
  name: string;
  description?: string;
  thumbnailUrl?: string;
  uploadDate?: string;
  videoUrl: string;
  videoType: string; // 'rutube' | 'vk' | 'other'
  duration?: string; // ISO 8601, например PT2M30S
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: opts.name,
    ...(opts.description ? { description: opts.description } : {}),
    ...(opts.thumbnailUrl ? { thumbnailUrl: opts.thumbnailUrl } : {}),
    embedUrl: buildVideoEmbed(opts.videoUrl, opts.videoType),
    ...(opts.uploadDate ? { uploadDate: opts.uploadDate } : {}),
    ...(opts.duration ? { duration: opts.duration } : {}),
  };
}

export function makeNewsArticleSchema(opts: {
  title: string;
  description?: string;
  url: string;
  image?: string;
  publishedAt?: string;
  updatedAt?: string;
  authorName?: string;
  publisherName: string;
  publisherLogo?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: (opts.title || '').slice(0, 110),
    ...(opts.description ? { description: opts.description } : {}),
    url: opts.url,
    ...(opts.image ? { image: { '@type': 'ImageObject', url: opts.image } } : {}),
    ...(opts.publishedAt ? { datePublished: opts.publishedAt } : {}),
    ...(opts.updatedAt ? { dateModified: opts.updatedAt } : {}),
    author: {
      '@type': opts.authorName ? 'Person' : 'Organization',
      name: opts.authorName || opts.publisherName,
    },
    publisher: {
      '@type': 'Organization',
      name: opts.publisherName,
      ...(opts.publisherLogo ? { logo: { '@type': 'ImageObject', url: opts.publisherLogo } } : {}),
    },
    inLanguage: 'ru-RU',
    isAccessibleForFree: true,
  };
}

export function makeItemListSchema(items: { name: string; url: string; image?: string; description?: string }[], listName?: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    ...(listName ? { name: listName } : {}),
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: item.url,
      name: item.name,
      ...(item.image ? { image: item.image } : {}),
      ...(item.description ? { description: item.description } : {}),
    })),
  };
}

export function makeServiceSchema(opts: {
  name: string;
  description?: string;
  url: string;
  providerName: string;
  areaCity?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: opts.name,
    ...(opts.description ? { description: opts.description } : {}),
    url: opts.url,
    provider: {
      '@type': 'Organization',
      name: opts.providerName,
    },
    ...(opts.areaCity ? {
      areaServed: { '@type': 'City', name: opts.areaCity },
    } : {}),
    serviceType: 'Коммерческая недвижимость',
  };
}

export function makeFaqSchema(items: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(it => ({
      '@type': 'Question',
      name: it.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: it.answer,
      },
    })),
  };
}