import React from 'react';
import { View } from 'react-native';
import { legendMatchesStatus } from '../(main)/utils/uiHelpers';
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
    // Determine unavailable bays: reserved, special-use, or occupied/assigned/maintenance
    const unavailable = bays.filter((b: any) => {
      // collect likely status fields to normalize and test
      // prefer primitive status fields, fall back to nested session properties
      const rawSession = b?.session;
      const sessionAction = rawSession && typeof rawSession === 'object' ? (rawSession.action || rawSession.status || rawSession.type || rawSession.session_type) : rawSession;
      const statusCandidate = String(b?.status ?? b?.originalStatus ?? sessionAction ?? b?.session_type ?? b?.sessionType ?? b?.type ?? b?.bay_status ?? b?.action ?? '').trim();
      // use legendMatchesStatus helper which has robust normalization rules; also accept 'SpecialUse' token
      const statusLower = statusCandidate.toLowerCase();
      const isReserved = legendMatchesStatus(['reserved'], statusCandidate) || !!(b?.reserved || b?.is_reserved || b?.reserved_for) || statusLower.includes('specialuse') || statusLower === 'specialuse';
      const isSpecial = legendMatchesStatus(['reserved'], statusCandidate) || !!(b?.special_use || b?.specialUse || b?.is_special_use || b?.specialuse) || statusLower.includes('specialuse') || statusLower === 'specialuse';
      const isOccupied = legendMatchesStatus(['assigned', 'maintenance', 'timed'], statusCandidate) || (() => {
        const s = String(statusCandidate).toLowerCase();
        return ['occupied', 'assigned', 'inuse', 'in-use', 'maintenance', 'inprogress', 'open time', 'opentime'].some(k => s.includes(k));
      })();
      return isReserved || isSpecial || isOccupied;
    }).length;
    avail = Math.max(0, total - unavailable);
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
