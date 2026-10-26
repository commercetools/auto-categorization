/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * The delivery envelope.
 *
 * Connect pushes Subscription notifications wrapped as
 * `{ message: { data: "<base64>" } }`. Every layer is decoded and checked
 * here, before any business logic, so a malformed delivery produces a named
 * error rather than an exception from deep inside a handler.
 */

export class BadEnvelopeError extends Error {
  constructor(reason: string) {
    super(`Malformed subscription envelope: ${reason}`);
    this.name = 'BadEnvelopeError';
  }
}

export type ChangeNotification = {
  notificationType:
    | 'ResourceCreated'
    | 'ResourceUpdated'
    | 'ResourceDeleted'
    | 'Message';
  resource: { typeId: string; id: string };
  version?: number;
  oldVersion?: number;
  sequenceNumber?: number;
  type?: string;
};

export function decodeEnvelope(body: unknown): ChangeNotification {
  const message = (body as { message?: { data?: unknown } } | undefined)
    ?.message;

  if (!message || typeof message.data !== 'string') {
    throw new BadEnvelopeError('no Pub/Sub message data');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(
      Buffer.from(message.data, 'base64').toString().trim()
    );
  } catch {
    throw new BadEnvelopeError('message data is not JSON');
  }

  const notification = parsed as Partial<ChangeNotification>;
  if (
    !notification?.notificationType ||
    !notification.resource?.typeId ||
    !notification.resource?.id
  ) {
    throw new BadEnvelopeError('no resource reference or notificationType');
  }

  return notification as ChangeNotification;
}

/**
 * What ties every log line of one delivery together, and what tells a
 * duplicate apart from a genuinely new change.
 */
export function correlationId(notification: ChangeNotification): string {
  const discriminator =
    notification.sequenceNumber ?? notification.version ?? 'unknown';
  return `${notification.resource.typeId}:${notification.resource.id}:${discriminator}`;
}
