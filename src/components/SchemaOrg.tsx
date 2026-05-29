import { useEffect, useMemo, useRef } from 'react';

interface SchemaOrgProps {
  schema: Record<string, unknown> | Record<string, unknown>[];
  id?: string;
}

/**
 * Инжектирует JSON-LD Schema.org в <head>.
 * При unmount — удаляет тег. При изменении schema — обновляет.
 */
export default function SchemaOrg({ schema, id }: SchemaOrgProps) {
  const scriptRef = useRef<HTMLScriptElement | null>(null);
  const scriptId = id ? `schema-org-${id}` : undefined;
  const schemaJson = useMemo(() => JSON.stringify(schema, null, 0), [schema]);

  useEffect(() => {
    let script = scriptId
      ? (document.getElementById(scriptId) as HTMLScriptElement | null)
      : null;

    if (!script) {
      script = document.createElement('script');
      script.type = 'application/ld+json';
      if (scriptId) script.id = scriptId;
      document.head.appendChild(script);
    }

    script.textContent = schemaJson;
    scriptRef.current = script;

    return () => {
      if (scriptRef.current && document.head.contains(scriptRef.current)) {
        document.head.removeChild(scriptRef.current);
        scriptRef.current = null;
      }
    };
  }, [schemaJson, scriptId]);

  return null;
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
}) {
  return {
    '@context': 'https://schema.org',
    '@type': ['Organization', 'LocalBusiness', 'RealEstateAgent'],
    '@id': `${opts.url}/#organization`,
    name: opts.name,
    url: opts.url,
    ...(opts.logo ? { logo: { '@type': 'ImageObject', url: opts.logo } } : {}),
    ...(opts.phone ? { telephone: opts.phone } : {}),
    ...(opts.email ? { email: opts.email } : {}),
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
      target: { '@type': 'EntryPoint', urlTemplate: `${opts.url}/catalog?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function makeBreadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
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
}) {
  const isRent = opts.deal === 'rent';
  const addressStr = [opts.city || 'Краснодар', opts.address].filter(Boolean).join(', ');

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: opts.title,
    ...(opts.description ? { description: opts.description } : {}),
    ...(opts.images.length ? { image: opts.images } : {}),
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
  };

  return schema;
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