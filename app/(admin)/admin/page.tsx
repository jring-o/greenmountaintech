import {
  Activity,
  CalendarCheck,
  ClipboardList,
  Copy,
  Inbox,
  Layers,
  Radio,
  RotateCcw,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getDashboardSummary } from '@/lib/db/queries/dashboard';
import { formatShortTimestamp } from '@/lib/utils';

function cronStatusLabel(status: string): string {
  if (status === 'ok') return 'OK';
  if (status === 'partial') return 'Partial';
  if (status === 'error') return 'Error';
  if (status === 'running') return 'Running';
  return status;
}

function cronStatusColor(status: string): string {
  if (status === 'ok') return 'text-green-700';
  if (status === 'partial') return 'text-amber-700';
  if (status === 'running') return 'text-blue-700';
  return 'text-red-700';
}

interface SummaryCard {
  title: string;
  icon: LucideIcon;
  key: 'pendingReviewCount' | 'publishedLast7DaysCount' | 'sourcesActiveCount';
  subtitle: string;
}

const summaryCards: SummaryCard[] = [
  {
    title: 'Pending Review',
    icon: ClipboardList,
    key: 'pendingReviewCount',
    subtitle: 'events awaiting review',
  },
  {
    title: 'Published (7d)',
    icon: CalendarCheck,
    key: 'publishedLast7DaysCount',
    subtitle: 'events published this week',
  },
  {
    title: 'Active Sources',
    icon: Radio,
    key: 'sourcesActiveCount',
    subtitle: 'ingestion sources enabled',
  },
];

const quickLinks = [
  {
    label: 'Queue',
    href: '/admin/queue',
    icon: Inbox,
    description: 'Review pending events',
  },
  {
    label: 'Sources',
    href: '/admin/sources',
    icon: Layers,
    description: 'Manage ingestion sources',
  },
  {
    label: 'Runs',
    href: '/admin/runs',
    icon: RotateCcw,
    description: 'View ingestion history',
  },
  {
    label: 'Duplicates',
    href: '/admin/duplicates',
    icon: Copy,
    description: 'Resolve duplicate events',
  },
];

export default async function AdminDashboardPage() {
  const summary = await getDashboardSummary();

  return (
    <main>
      <h1 className="font-display text-3xl font-bold tracking-tight text-vermont-forest">
        Admin Dashboard
      </h1>

      {/* Summary Cards */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <Card key={card.key} className="border-vermont-forest/20 bg-vermont-cream/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-vermont-slate">{card.title}</CardTitle>
              <card.icon className="h-5 w-5 text-vermont-forest/70" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tabular-nums text-vermont-forest">
                {summary[card.key]}
              </div>
              <p className="mt-1 text-xs text-vermont-slate">{card.subtitle}</p>
            </CardContent>
          </Card>
        ))}

        {/* Last Cron Status */}
        <Card className="border-vermont-forest/20 bg-vermont-cream/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-vermont-slate">Last Cron</CardTitle>
            <Activity className="h-5 w-5 text-vermont-forest/70" />
          </CardHeader>
          <CardContent>
            {summary.lastCronStatus ? (
              <>
                <div
                  className={`text-2xl font-bold ${cronStatusColor(summary.lastCronStatus.status)}`}
                >
                  {cronStatusLabel(summary.lastCronStatus.status)}
                </div>
                <p className="mt-1 text-xs tabular-nums text-vermont-slate">
                  {formatShortTimestamp(summary.lastCronStatus.started_at)}
                </p>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-vermont-slate/50">--</div>
                <p className="mt-1 text-xs text-vermont-slate">no runs recorded</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="mt-10">
        <h2 className="font-display text-xl font-semibold text-vermont-forest">Quick Links</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group flex items-start gap-3 rounded-xl border border-vermont-forest/10 bg-white p-4 transition-all hover:border-vermont-forest/30 hover:shadow-sm"
            >
              <link.icon className="mt-0.5 h-5 w-5 shrink-0 text-vermont-forest/60 transition-colors group-hover:text-vermont-forest" />
              <div>
                <div className="font-medium text-vermont-forest group-hover:underline">
                  {link.label}
                </div>
                <div className="mt-0.5 text-xs text-vermont-slate">{link.description}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
