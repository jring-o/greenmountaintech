import { expect, test } from '@playwright/test';

test('homepage returns 200', async ({ request }) => {
  const response = await request.get('/');
  expect(response.status()).toBe(200);
});
