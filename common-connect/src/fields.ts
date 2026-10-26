/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type {
  AttributeDefinition,
  AttributeType,
  ProductType,
} from '@commercetools/platform-sdk';
import {
  FieldOption,
  OPERATORS_BY_VALUE_KIND,
  ValueKind,
} from './types';

/**
 * The catalog of fields a rule can be written against.
 *
 * The built-in half is fixed; the attribute half is read from the Project's
 * own Product Types, so the builder offers the attributes this catalog
 * actually has rather than a guess at what a catalog usually has.
 */

const BUILT_IN: Array<Omit<FieldOption, 'operators'>> = [
  {
    id: 'name',
    label: 'Product name',
    group: 'Product',
    field: { kind: 'name', valueKind: 'text' },
  },
  {
    id: 'slug',
    label: 'Slug',
    group: 'Product',
    field: { kind: 'slug', valueKind: 'text' },
  },
  {
    id: 'description',
    label: 'Description',
    group: 'Product',
    field: { kind: 'description', valueKind: 'text' },
  },
  {
    id: 'key',
    label: 'Product key',
    group: 'Product',
    field: { kind: 'key', valueKind: 'text' },
  },
  {
    id: 'sku',
    label: 'SKU (any variant)',
    group: 'Product',
    field: { kind: 'sku', valueKind: 'text' },
  },
  {
    id: 'productType',
    label: 'Product type',
    group: 'Product',
    field: { kind: 'productType', valueKind: 'text' },
  },
  {
    id: 'price',
    label: 'Price',
    group: 'Commercial',
    field: { kind: 'price', valueKind: 'number' },
  },
  {
    id: 'createdAt',
    label: 'Created',
    group: 'Lifecycle',
    field: { kind: 'createdAt', valueKind: 'date' },
  },
  {
    id: 'lastModifiedAt',
    label: 'Last modified',
    group: 'Lifecycle',
    field: { kind: 'lastModifiedAt', valueKind: 'date' },
  },
  {
    id: 'category',
    label: 'Category membership',
    group: 'Lifecycle',
    field: { kind: 'category', valueKind: 'category' },
  },
];

export function buildFieldCatalog(productTypes: ProductType[]): FieldOption[] {
  const attributes = new Map<string, FieldOption>();

  for (const productType of productTypes) {
    for (const definition of productType.attributes ?? []) {
      // An attribute name is unique per Project, so the first definition
      // seen is authoritative and later Product Types only repeat it.
      if (attributes.has(definition.name)) continue;
      attributes.set(definition.name, attributeOption(definition));
    }
  }

  // The Product Types are already in hand, so the product-type field offers
  // them rather than asking for a key to be typed from memory. The engine
  // compares against the key, so that is the value; the name is the label.
  const productTypeChoices = productTypes
    .filter((productType) => Boolean(productType.key))
    .map((productType) => ({
      value: productType.key as string,
      label: productType.name || (productType.key as string),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const builtIn = BUILT_IN.map((option) =>
    withOperators(
      option.field.kind === 'productType' && productTypeChoices.length > 0
        ? { ...option, choices: productTypeChoices }
        : option
    )
  );

  return [
    ...builtIn,
    ...[...attributes.values()].sort((a, b) => a.label.localeCompare(b.label)),
  ];
}

function attributeOption(definition: AttributeDefinition): FieldOption {
  const valueKind = valueKindOf(definition.type);

  return withOperators({
    id: `attribute:${definition.name}`,
    label: labelOf(definition),
    group: 'Attributes',
    field: {
      kind: 'attribute',
      attributeName: definition.name,
      valueKind,
    },
    choices: choicesOf(definition.type),
  });
}

function withOperators(option: Omit<FieldOption, 'operators'>): FieldOption {
  return { ...option, operators: OPERATORS_BY_VALUE_KIND[option.field.valueKind] };
}

function labelOf(definition: AttributeDefinition): string {
  const label = Object.values(definition.label ?? {}).find(
    (value) => typeof value === 'string' && value.length > 0
  );
  return label ?? definition.name;
}

export function valueKindOf(type: AttributeType): ValueKind {
  switch (type.name) {
    case 'number':
    case 'money':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
    case 'datetime':
    case 'time':
      return 'date';
    case 'set':
      return valueKindOf(type.elementType);
    default:
      // text, ltext, enum, lenum, reference and nested all compare as text.
      return 'text';
  }
}

function choicesOf(
  type: AttributeType
): { value: string; label: string }[] | undefined {
  if (type.name === 'set') return choicesOf(type.elementType);

  if (type.name === 'enum') {
    return type.values.map((value) => ({
      value: value.key,
      label: value.label,
    }));
  }

  if (type.name === 'lenum') {
    return type.values.map((value) => ({
      value: value.key,
      label:
        Object.values(value.label ?? {}).find(
          (label) => typeof label === 'string' && label.length > 0
        ) ?? value.key,
    }));
  }

  return undefined;
}
