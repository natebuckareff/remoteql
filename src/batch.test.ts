import { expect, test } from 'vitest';
import { BatchScheduler } from './batch.js';

test('calls are batched', async () => {
  let batch = 0;
  const events: any[] = [];

  const scheduler = new BatchScheduler(async ({ resolved }) => {
    events.push(...resolved.map(id => ({ t: 'request', batch, id })));
    batch += 1;
    return resolved;
  });

  scheduler.resolve(1).then(id => {
    events.push({ t: 'resolve', id });
    return id;
  });

  scheduler.resolve(2).then(id => {
    events.push({ t: 'resolve', id });
    return id;
  });

  await new Promise(resolve => setTimeout(resolve, 0));

  scheduler.resolve(3).then(id => {
    events.push({ t: 'resolve', id });
    return id;
  });

  await new Promise(resolve => setTimeout(resolve, 0));

  expect(events).toEqual([
    // first batch
    { t: 'request', batch: 0, id: 1 },
    { t: 'request', batch: 0, id: 2 },
    { t: 'resolve', id: 1 },
    { t: 'resolve', id: 2 },

    // second batch
    { t: 'request', batch: 1, id: 3 },
    { t: 'resolve', id: 3 },
  ]);
});

test('nested batches are automatically scheduled', async () => {
  let batch = 0;
  const events: any[] = [];

  const scheduler = new BatchScheduler(async ({ resolved }) => {
    events.push(...resolved.map(id => ({ t: 'request', batch, id })));
    batch += 1;
    return resolved;
  });

  scheduler.resolve(1).then(id => {
    events.push({ t: 'resolve', id });
    return id;
  });

  scheduler.resolve(2).then(id => {
    events.push({ t: 'resolve', id });

    scheduler.resolve(3).then(id => {
      events.push({ t: 'resolve', id });
      return id;
    });

    return id;
  });

  // await first batch
  await new Promise(resolve => setTimeout(resolve, 0));

  // await second nested batch
  await new Promise(resolve => setTimeout(resolve, 0));

  expect(events).toEqual([
    // first batch
    { t: 'request', batch: 0, id: 1 },
    { t: 'request', batch: 0, id: 2 },
    { t: 'resolve', id: 1 },
    { t: 'resolve', id: 2 },

    // second batch
    { t: 'request', batch: 1, id: 3 },
    { t: 'resolve', id: 3 },
  ]);
});

test('throws when request returns more results than inputs', async () => {
  const scheduler = new BatchScheduler(async ({ resolved }) => {
    return [...resolved, 'extra'];
  });

  const errors: any[] = [];

  scheduler.resolve(1).catch(error => errors.push(error));
  scheduler.resolve(2).catch(error => errors.push(error));

  await new Promise(resolve => setTimeout(resolve, 0));

  expect(errors).toHaveLength(2);
  expect(errors[0].message).toBe('request returned more results than inputs');
  expect(errors[1].message).toBe('request returned more results than inputs');
});

test('forward error if resolve throws', async () => {
  const scheduler = new BatchScheduler(async ({ resolved }) => {
    return resolved;
  });

  const errors: any[] = [];
  scheduler
    .resolve(1)
    .then(() => {
      throw new Error('test');
    })
    .catch(error => errors.push(error));

  await new Promise(resolve => setTimeout(resolve, 0));

  expect(errors).toHaveLength(1);
  expect(errors[0].message).toBe('test');
});
