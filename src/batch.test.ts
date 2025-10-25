import { expect, test } from 'vitest';
import { BatchScheduler } from './batch.js';

test('calls are batched', async () => {
  let batch = 0;
  const events: any[] = [];

  const scheduler = new BatchScheduler<string>(async inputs => {
    events.push(...inputs.map(input => ({ t: 'request', batch, input })));
    batch += 1;
    return inputs;
  });

  scheduler.send(
    'first',
    value => {
      events.push({ t: 'resolve', value });
      return value;
    },
    () => {},
  );

  scheduler.send(
    'second',
    value => {
      events.push({ t: 'resolve', value });
      return value;
    },
    () => {},
  );

  await new Promise(resolve => setTimeout(resolve, 0));

  scheduler.send(
    'third',
    value => {
      events.push({ t: 'resolve', value });
      return value;
    },
    () => {},
  );

  await new Promise(resolve => setTimeout(resolve, 0));

  expect(events).toEqual([
    // first batch
    { t: 'request', batch: 0, input: 'first' },
    { t: 'request', batch: 0, input: 'second' },
    { t: 'resolve', value: 'first' },
    { t: 'resolve', value: 'second' },

    // second batch
    { t: 'request', batch: 1, input: 'third' },
    { t: 'resolve', value: 'third' },
  ]);
});

test('nested batches are automatically scheduled', async () => {
  let batch = 0;
  const events: any[] = [];

  const scheduler = new BatchScheduler<string>(async inputs => {
    events.push(...inputs.map(input => ({ t: 'request', batch, input })));
    batch += 1;
    return inputs;
  });

  scheduler.send(
    'first',
    value => {
      events.push({ t: 'resolve', value });
      return value;
    },
    () => {},
  );

  scheduler.send(
    'second',
    value => {
      events.push({ t: 'resolve', value });

      scheduler.send(
        'third',
        value => {
          events.push({ t: 'resolve', value });
          return value;
        },
        () => {},
      );

      return value;
    },
    () => {},
  );

  // await first batch
  await new Promise(resolve => setTimeout(resolve, 0));

  // await second nested batch
  await new Promise(resolve => setTimeout(resolve, 0));

  expect(events).toEqual([
    // first batch
    { t: 'request', batch: 0, input: 'first' },
    { t: 'request', batch: 0, input: 'second' },
    { t: 'resolve', value: 'first' },
    { t: 'resolve', value: 'second' },

    // second batch
    { t: 'request', batch: 1, input: 'third' },
    { t: 'resolve', value: 'third' },
  ]);
});

test('throws when request returns more results than inputs', async () => {
  const scheduler = new BatchScheduler<string>(async inputs => {
    return [...inputs, 'extra'];
  });

  const errors: any[] = [];
  scheduler.send(
    'first',
    () => {},
    error => errors.push(error),
  );
  scheduler.send(
    'second',
    () => {},
    error => errors.push(error),
  );

  await new Promise(resolve => setTimeout(resolve, 0));

  expect(errors).toHaveLength(2);
  expect(errors[0].message).toBe('request returned more results than inputs');
  expect(errors[1].message).toBe('request returned more results than inputs');
});

test('forward error if resolve throws', async () => {
  const scheduler = new BatchScheduler<string>(async inputs => {
    return inputs;
  });

  const errors: any[] = [];
  scheduler.send(
    'first',
    () => {
      throw new Error('test');
    },
    error => errors.push(error),
  );

  await new Promise(resolve => setTimeout(resolve, 0));

  expect(errors).toHaveLength(1);
  expect(errors[0].message).toBe('test');
});
