import React from 'react';
import { View } from 'react-native';
import OverviewCard from './OverviewCard';

interface QuickOverviewProps {
  overview: any;
  settings: any;
  currencySymbol?: string;
}

export default function QuickOverview({ overview, settings, currencySymbol = '$' }: QuickOverviewProps) {
  const total = Number(settings?.totalAvailableBays ?? overview?.totalBays ?? 45);

  let avail: number | null = typeof overview?.availableBays === 'number' ? overview.availableBays : null;
  if (avail === null) {
    const bays = overview?.bays ?? [];
    const occupied = bays.filter((b: any) => {
      const st = String(b?.status ?? b?.originalStatus ?? '').trim();
      return ['Occupied', 'Assigned', 'Open', 'OpenTime', 'Maintenance', 'SpecialUse'].includes(st);
    }).length;
    avail = Math.max(0, total - occupied);
  }

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
      <OverviewCard title="Total Revenue (Today)" value={overview ? `${currencySymbol}${overview.totalRevenueToday}` : '—'} subtitle="Compared to previous period" color="#2E7D32" />
      <OverviewCard title="Available Bays" value={String(avail)} subtitle={`${avail} / ${total} available`} color="#558B2F" />
      <OverviewCard title="Staff on Duty" value={overview ? String(overview.staffOnDuty) : '—'} subtitle="Total staff" color="#C62828" />
      <OverviewCard title="Next Tee Time" value={(() => {
        if (!overview || !overview.nextTeeTime) return '—';
        if (overview.nextTeeTime === 'Bay Ready') return 'Bay Ready';
        try { return new Date(overview.nextTeeTime).toLocaleTimeString(); } catch { return String(overview.nextTeeTime); }
      })()} subtitle={(() => {
        if (!overview || !overview.nextTeeTime) return '';
        if (overview.nextTeeTime === 'Bay Ready') return '';
        try { return new Date(overview.nextTeeTime).toLocaleDateString(); } catch { return ''; }
      })()} color="#6D4C41" />
    </View>
  );
}
