/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ProductType } from '@commercetools/platform-sdk';
import { buildFieldCatalog } from '../src/fields';

/**
 * The field catalog is what the rule builder offers, so a field with no
 * choices is a field someone has to type a value into from memory. For a
 * product type that means a mis-typed key matches nothing, silently, and
 * the rule looks broken rather than wrong.
 */

const productType = (
  key: string,
  name: string,
  attributes: ProductType['attributes'] = []
): ProductType =>
  ({
    id: `id-${key}`,
    version: 1,
    key,
    name,
    description: '',
    attributes,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastModifiedAt: '2026-01-01T00:00:00.000Z',
  }) as ProductType;

const productTypeField = (types: ProductType[]) =>
  buildFieldCatalog(types).find((option) => option.field.kind === 'productType');

describe('the product type field', () => {
  it('offers the Project’s own product types, keyed the way the engine reads them', () => {
    const field = productTypeField([
      productType('sample-large-goods', 'Large goods'),
      productType('sample-animal-feed', 'Animal feed'),
    ]);

    // The engine compares against the key, so that is the value; the name
    // is only what the merchandiser reads.
    expect(field?.choices).toEqual([
      { value: 'sample-animal-feed', label: 'Animal feed' },
      { value: 'sample-large-goods', label: 'Large goods' },
    ]);
  });

  it('sorts them by the name on screen, not by key', () => {
    const field = productTypeField([
      productType('aaa', 'Zebra'),
      productType('zzz', 'Aardvark'),
    ]);

    expect(field?.choices?.map((choice) => choice.label)).toEqual([
      'Aardvark',
      'Zebra',
    ]);
  });

  it('falls back to the key when a product type has no name', () => {
    const field = productTypeField([productType('bare', '')]);
    expect(field?.choices).toEqual([{ value: 'bare', label: 'bare' }]);
  });

  it('skips a product type with no key, because a rule cannot name it', () => {
    const keyless = productType('x', 'Keyless');
    delete (keyless as { key?: string }).key;

    expect(productTypeField([keyless])?.choices).toBeUndefined();
  });

  it('offers no choices at all when the Project has no product types', () => {
    // Rather than an empty dropdown, which cannot be used and says nothing.
    expect(productTypeField([])?.choices).toBeUndefined();
  });
});
