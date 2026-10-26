/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import CheckboxInput from '@commercetools-uikit/checkbox-input';
import NumberInput from '@commercetools-uikit/number-input';
import SecondaryIconButton from '@commercetools-uikit/secondary-icon-button';
import SelectInput from '@commercetools-uikit/select-input';
import Spacings from '@commercetools-uikit/spacings';
import TextInput from '@commercetools-uikit/text-input';
import { BinLinearIcon } from '@commercetools-uikit/icons';
import type { Condition, Meta } from '../api/types';
import { NULLARY_OPERATORS } from '../api/types';
import { fieldOptionFor } from '../helpers';

/**
 * One condition: a field, an operator, and a value.
 *
 * Which operators appear depends on what the field yields — a price offers
 * "is greater than" and never "starts with" — and the value control follows
 * the same rule, so the form can only be used to write a rule the engine
 * can actually run.
 */

type ConditionRowProps = {
  condition: Condition;
  meta: Meta;
  isDisabled?: boolean;
  onChange: (condition: Condition) => void;
  onRemove: () => void;
};

const ConditionRow = ({
  condition,
  meta,
  isDisabled,
  onChange,
  onRemove,
}: ConditionRowProps) => {
  const selected = fieldOptionFor(meta, condition);
  const operators = selected?.operators ?? [];
  const needsValue = !NULLARY_OPERATORS.includes(condition.operator);

  const changeField = (fieldId: string) => {
    const option = meta.fields.find((candidate) => candidate.id === fieldId);
    if (!option) return;

    // An operator that made sense for the old field may be meaningless for
    // the new one, so the first valid operator is taken rather than an
    // invalid pairing being left on screen.
    const operator = option.operators.includes(condition.operator)
      ? condition.operator
      : option.operators[0];

    onChange({ field: option.field, operator, value: '' });
  };

  return (
    <Spacings.Inline scale="xs" alignItems="center">
      <div style={{ minWidth: 190 }}>
        <SelectInput
          name="field"
          value={selected?.id ?? ''}
          isDisabled={isDisabled}
          options={groupFields(meta)}
          onChange={(event) => changeField(String(event.target.value))}
        />
      </div>

      <div style={{ minWidth: 170 }}>
        <SelectInput
          name="operator"
          value={condition.operator}
          isDisabled={isDisabled}
          options={operators.map((operator) => ({
            value: operator,
            label: meta.operatorLabels[operator] ?? operator,
          }))}
          onChange={(event) =>
            onChange({ ...condition, operator: String(event.target.value) })
          }
        />
      </div>

      <div style={{ minWidth: 150, flexGrow: 1 }}>
        {needsValue && (
          <ValueInput
            condition={condition}
            choices={selected?.choices}
            isDisabled={isDisabled}
            onChange={(value) => onChange({ ...condition, value })}
          />
        )}
      </div>

      <SecondaryIconButton
        icon={<BinLinearIcon />}
        label="Remove this condition"
        onClick={onRemove}
        isDisabled={isDisabled}
      />
    </Spacings.Inline>
  );
};

type ValueInputProps = {
  condition: Condition;
  choices?: { value: string; label: string }[];
  isDisabled?: boolean;
  onChange: (value: string | number | boolean) => void;
};

const ValueInput = ({
  condition,
  choices,
  isDisabled,
  onChange,
}: ValueInputProps) => {
  if (choices?.length) {
    return (
      <SelectInput
        name="value"
        value={String(condition.value ?? '')}
        isDisabled={isDisabled}
        options={choices}
        onChange={(event) => onChange(String(event.target.value))}
      />
    );
  }

  if (
    condition.field.valueKind === 'number' ||
    condition.operator === 'withinLastDays' ||
    condition.operator === 'withinLastHours'
  ) {
    return (
      <NumberInput
        name="value"
        value={condition.value === '' ? '' : Number(condition.value)}
        isDisabled={isDisabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    );
  }

  if (condition.field.valueKind === 'boolean') {
    return (
      <CheckboxInput
        isChecked={condition.value === true}
        isDisabled={isDisabled}
        onChange={(event) => onChange(event.target.checked)}
      >
        Yes
      </CheckboxInput>
    );
  }

  return (
    <TextInput
      name="value"
      value={String(condition.value ?? '')}
      isDisabled={isDisabled}
      placeholder={placeholderFor(condition)}
      onChange={(event) => onChange(event.target.value)}
    />
  );
};

const placeholderFor = (condition: Condition): string => {
  if (condition.operator === 'matchesRegex') return '^SKU-\\d+';
  if (condition.operator === 'before' || condition.operator === 'after') {
    return '2026-01-31';
  }
  return '';
};

/**
 * Attributes come from the Project's own Product Types and there can be a
 * great many, so they sit in their own group below the built-in fields
 * rather than being mixed into one long list.
 */
const groupFields = (meta: Meta) => {
  const groups = new Map<string, { value: string; label: string }[]>();

  for (const field of meta.fields) {
    const bucket = groups.get(field.group) ?? [];
    bucket.push({ value: field.id, label: field.label });
    groups.set(field.group, bucket);
  }

  return [...groups.entries()].map(([label, options]) => ({ label, options }));
};

ConditionRow.displayName = 'ConditionRow';

export default ConditionRow;
