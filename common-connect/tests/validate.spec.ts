/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { toRule, validateRule } from '../src/validate';
import { Condition, RuleDraft } from '../src/types';

const NOW = new Date('2026-09-28T12:00:00.000Z');

const okCondition: Condition = {
  field: { kind: 'name', valueKind: 'text' },
  operator: 'startsWith',
  value: 'XYZ',
};

function draft(overrides: Partial<RuleDraft> = {}): RuleDraft {
  return {
    key: 'new-products',
    name: 'New products',
    categoryId: 'cat-new',
    enabled: true,
    match: 'all',
    conditions: [okCondition],
    removeWhenNoLongerMatching: true,
    ...overrides,
  };
}

describe('validateRule', () => {
  it('accepts a well-formed rule', () => {
    expect(validateRule(draft())).toEqual([]);
  });

  it.each([
    ['a', 'key must be'],
    ['has spaces', 'key must be'],
    ['bad/slash', 'key must be'],
  ])('rejects the key %s', (key, fragment) => {
    expect(validateRule(draft({ key })).join(' ')).toContain(fragment);
  });

  it('requires a name, a category and at least one condition', () => {
    const issues = validateRule(
      draft({ name: '  ', categoryId: '', conditions: [] })
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        'name is required',
        'categoryId is required',
        'a rule needs at least one condition',
      ])
    );
  });

  it('rejects an operator that does not apply to the field', () => {
    const issues = validateRule(
      draft({
        conditions: [
          {
            field: { kind: 'price', valueKind: 'number' },
            operator: 'startsWith',
            value: '10',
          },
        ],
      })
    );
    expect(issues.join(' ')).toContain('does not apply to a number field');
  });

  it('rejects an attribute condition with no attribute named', () => {
    const issues = validateRule(
      draft({
        conditions: [
          {
            field: { kind: 'attribute', valueKind: 'text' },
            operator: 'equals',
            value: 'x',
          },
        ],
      })
    );
    expect(issues.join(' ')).toContain('needs attributeName');
  });

  it('requires a value for an operator that takes one', () => {
    const issues = validateRule(
      draft({
        conditions: [{ field: { kind: 'name', valueKind: 'text' }, operator: 'contains' }],
      })
    );
    expect(issues.join(' ')).toContain('needs a value');
  });

  it('takes no value for isEmpty', () => {
    expect(
      validateRule(
        draft({
          conditions: [
            { field: { kind: 'key', valueKind: 'text' }, operator: 'isEmpty' },
          ],
        })
      )
    ).toEqual([]);
  });

  it('rejects a non-numeric value on a number field', () => {
    const issues = validateRule(
      draft({
        conditions: [
          {
            field: { kind: 'price', valueKind: 'number' },
            operator: 'greaterThan',
            value: 'cheap',
          },
        ],
      })
    );
    expect(issues.join(' ')).toContain('value must be a number');
  });

  it('rejects a time window that is zero or negative', () => {
    const issues = validateRule(
      draft({
        conditions: [
          {
            field: { kind: 'createdAt', valueKind: 'date' },
            operator: 'withinLastDays',
            value: 0,
          },
        ],
      })
    );
    expect(issues.join(' ')).toContain('positive number');
  });

  it('rejects an unparseable regular expression', () => {
    const issues = validateRule(
      draft({
        conditions: [
          { field: { kind: 'name', valueKind: 'text' }, operator: 'matchesRegex', value: '([' },
        ],
      })
    );
    expect(issues.join(' ')).toContain('valid regular expression');
  });

  it('caps the number of conditions', () => {
    const issues = validateRule(
      draft({ conditions: Array.from({ length: 26 }, () => okCondition) })
    );
    expect(issues.join(' ')).toContain('at most 25 conditions');
  });
});

describe('toRule', () => {
  it('defaults enabled and removeWhenNoLongerMatching to on', () => {
    const rule = toRule(
      {
        ...draft(),
        enabled: undefined,
        removeWhenNoLongerMatching: undefined,
      } as unknown as RuleDraft,
      NOW
    );
    expect(rule.enabled).toBe(true);
    expect(rule.removeWhenNoLongerMatching).toBe(true);
  });

  it('keeps the original createdAt when editing', () => {
    const first = toRule(draft(), new Date('2026-01-01T00:00:00.000Z'));
    const second = toRule(draft({ name: 'Renamed' }), NOW, first);
    expect(second.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(second.updatedAt).toBe(NOW.toISOString());
    expect(second.name).toBe('Renamed');
  });
});
