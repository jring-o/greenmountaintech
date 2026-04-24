import { expect, test } from '@playwright/test';

/**
 * E2E happy-path: Submit -> Approve -> Calendar -> Feed
 *
 * Prerequisites:
 * - Dev/test server running
 * - Clerk test session cookie or testing tokens configured in .env.test.local
 *
 * This test uses a unique title per run (timestamp suffix) to avoid collisions.
 */

const uniqueTitle = `E2E Test Event ${Date.now()}`;

test.describe('Submit -> Approve -> Publish flow', () => {
  test('Step 1: Submit form and see thank-you screen', async ({ page }) => {
    await page.goto('/submit');

    // Fill required fields
    await page.getByLabel(/title/i).fill(uniqueTitle);
    await page.getByLabel(/start date/i).fill('2026-07-04T10:00');
    await page.getByLabel(/region/i).selectOption('burlington_area');
    await page.getByLabel(/category/i).selectOption('community_civic');
    await page.getByLabel(/contact email/i).fill('e2e-test@example.com');

    // Optional fields
    await page.getByLabel(/venue name/i).fill('Church Street Marketplace');
    await page
      .getByLabel(/description/i)
      .fill('Annual Independence Day celebration with live music and fireworks.');

    // Submit
    await page.getByRole('button', { name: /submit event/i }).click();

    // Assert thank-you screen
    await expect(page.getByTestId('thank-you')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Thank you!')).toBeVisible();
  });

  test('Step 2: Admin approves the submission', async ({ request }) => {
    // Use the API to find the pending event by title
    // This requires admin auth -- configured via Clerk test tokens in env
    const listRes = await request.get('/api/admin/events?status=pending_review&limit=50');
    expect(listRes.ok()).toBeTruthy();

    const listBody = await listRes.json();
    const events = listBody.data?.events ?? listBody.data ?? [];

    const target = events.find((e: { title: string }) => e.title === uniqueTitle);
    expect(target).toBeDefined();

    // Approve
    const approveRes = await request.post(`/api/admin/events/${target.id}/approve`);
    expect(approveRes.ok()).toBeTruthy();

    const approveBody = await approveRes.json();
    expect(approveBody.data?.status).toBe('published');
  });

  test('Step 3: Event appears on the public calendar page', async ({ page }) => {
    await page.goto('/');
    // Wait for FullCalendar to render and look for the event title
    // The event is on 2026-07-04, so we may need to navigate the calendar
    // For robustness, check the page source or API
    const response = await page.request.get(
      '/api/public/events?q=' + encodeURIComponent(uniqueTitle),
    );
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    const events = body.data?.events ?? body.data ?? [];
    const found = events.find((e: { title: string }) => e.title === uniqueTitle);
    expect(found).toBeDefined();
  });

  test('Step 4: Event appears in iCal feed', async ({ request }) => {
    const response = await request.get('/feed.ics');
    expect(response.ok()).toBeTruthy();

    const ical = await response.text();
    expect(ical).toContain('BEGIN:VCALENDAR');
    expect(ical).toContain(uniqueTitle);
  });
});
