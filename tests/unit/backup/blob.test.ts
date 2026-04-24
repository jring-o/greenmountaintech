import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @vercel/blob before importing the module under test
vi.mock('@vercel/blob', () => ({
  list: vi.fn(),
  del: vi.fn(),
  put: vi.fn(),
}));

// Mock @/lib/log to suppress output during tests
vi.mock('@/lib/log', () => ({
  log: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(),
    }),
  },
}));

import type { ListBlobResult } from '@vercel/blob';
import { del, list } from '@vercel/blob';

import { pruneOldBackups } from '@/lib/backup/blob';

const mockList = vi.mocked(list);
const mockDel = vi.mocked(del);

function makeBlob(index: number, daysAgo: number) {
  const d = new Date('2026-04-24T04:00:00Z');
  d.setDate(d.getDate() - daysAgo);
  return {
    url: `https://blob.vercel-storage.com/backups/backup-${String(index)}.sql.gz`,
    downloadUrl: `https://blob.vercel-storage.com/backups/backup-${String(index)}.sql.gz?download=1`,
    pathname: `backups/backup-${String(index)}.sql.gz`,
    size: 1024 * (index + 1),
    uploadedAt: d,
    etag: `etag-${String(index)}`,
  };
}

function listResult(
  blobs: ReturnType<typeof makeBlob>[],
  hasMore: boolean,
  cursor?: string,
): ListBlobResult {
  const result: ListBlobResult = { blobs, hasMore };
  if (cursor !== undefined) {
    result.cursor = cursor;
  }
  return result;
}

describe('pruneOldBackups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the 8 most recent and deletes the rest', async () => {
    // Create 12 blobs, each 7 days apart (most recent first when sorted)
    const blobs = Array.from({ length: 12 }, (_, i) => makeBlob(i, i * 7));

    mockList.mockResolvedValueOnce(listResult(blobs, false));
    mockDel.mockResolvedValueOnce(undefined);

    const deleted = await pruneOldBackups('backups/', 8);

    expect(deleted).toBe(4);

    // del should have been called once with the 4 oldest blob URLs
    expect(mockDel).toHaveBeenCalledTimes(1);
    const deletedUrls = mockDel.mock.calls[0]![0] as string[];
    expect(deletedUrls).toHaveLength(4);

    // The deleted URLs should be the 4 oldest (largest daysAgo values: 56, 63, 70, 77)
    // After sorting newest-first, indices 8..11 are the oldest
    const sortedBlobs = [...blobs].sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
    const expectedUrls = sortedBlobs.slice(8).map((b) => b.url);
    expect(deletedUrls).toEqual(expectedUrls);
  });

  it('does nothing when blob count is at or below the keep threshold', async () => {
    const blobs = Array.from({ length: 8 }, (_, i) => makeBlob(i, i * 7));

    mockList.mockResolvedValueOnce(listResult(blobs, false));

    const deleted = await pruneOldBackups('backups/', 8);

    expect(deleted).toBe(0);
    expect(mockDel).not.toHaveBeenCalled();
  });

  it('does nothing when there are fewer blobs than the keep threshold', async () => {
    const blobs = Array.from({ length: 3 }, (_, i) => makeBlob(i, i * 7));

    mockList.mockResolvedValueOnce(listResult(blobs, false));

    const deleted = await pruneOldBackups('backups/', 8);

    expect(deleted).toBe(0);
    expect(mockDel).not.toHaveBeenCalled();
  });

  it('handles paginated list results', async () => {
    // Page 1: 6 blobs
    const page1Blobs = Array.from({ length: 6 }, (_, i) => makeBlob(i, i * 7));
    // Page 2: 6 blobs (older)
    const page2Blobs = Array.from({ length: 6 }, (_, i) => makeBlob(i + 6, (i + 6) * 7));

    mockList
      .mockResolvedValueOnce(listResult(page1Blobs, true, 'page2cursor'))
      .mockResolvedValueOnce(listResult(page2Blobs, false));
    mockDel.mockResolvedValueOnce(undefined);

    const deleted = await pruneOldBackups('backups/', 8);

    // 12 total, keep 8 => delete 4
    expect(deleted).toBe(4);
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(mockDel).toHaveBeenCalledTimes(1);
    const deletedUrls = mockDel.mock.calls[0]![0] as string[];
    expect(deletedUrls).toHaveLength(4);
  });

  it('deletes exactly (total - keep) when total > keep', async () => {
    // 9 blobs, keep 8 => delete exactly 1
    const blobs = Array.from({ length: 9 }, (_, i) => makeBlob(i, i * 7));

    mockList.mockResolvedValueOnce(listResult(blobs, false));
    mockDel.mockResolvedValueOnce(undefined);

    const deleted = await pruneOldBackups('backups/', 8);

    expect(deleted).toBe(1);
    expect(mockDel).toHaveBeenCalledTimes(1);
    const deletedUrls = mockDel.mock.calls[0]![0] as string[];
    expect(deletedUrls).toHaveLength(1);

    // The single deleted URL should be the oldest blob
    const sortedBlobs = [...blobs].sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
    expect(deletedUrls[0]).toBe(sortedBlobs[8]!.url);
  });
});
