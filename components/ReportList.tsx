import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { databaseManager, ExpenseReport } from '../services/database';
import { serverPullSyncService } from '../services/serverPullSyncService';
import { syncManager } from '../services/syncManager';
import { getExpenseReportDisplayTitle, isGenericExpenseReportTitle } from '../utils/expenseReportDisplay';
import { useI18n } from '../i18n';
import { FilterDatePicker } from './FilterDatePicker';
import { filterReportOptions, reportDateKey } from '../utils/reportSelection';

export function ReportList({ onSelect, excludeId, allowCreate = true, confirmSelection = false }: {
  onSelect: (report: ExpenseReport) => void; excludeId?: string; allowCreate?: boolean; confirmSelection?: boolean;
}) {
  const { t, formatDate } = useI18n();
  const [reports, setReports] = useState<ExpenseReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [dateField, setDateField] = useState<'from' | 'to' | null>(null);
  const [selectedId, setSelectedId] = useState('');
  useFocusEffect(useCallback(() => {
    let active = true;
    const load = async () => {
      try {
        await databaseManager.getDefaultReportId();
        const local = await databaseManager.getExpenseReports();
        if (active) { setReports(local); setLoading(false); }
        await serverPullSyncService.pullReports();
        const updated = await databaseManager.getExpenseReports();
        if (active) setReports(updated);
      } catch { /* The local list remains available offline. */ }
      finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, []));

  const create = async () => {
    const name = title.trim();
    if (!name || ['nota spesa', 'nota spesa generica'].includes(name.toLowerCase())) {
      Alert.alert(t('common.warning'), t('reports.nameRequired')); return;
    }
    setSaving(true);
    try {
      const id = await databaseManager.createExpenseReport({ title: name, is_archived: false, sync_status: 'pending' });
      const report = await databaseManager.getExpenseReportById(id);
      setCreating(false); setTitle('');
      if (report) { setReports(current => [...current, report]); onSelect(report); }
      void syncManager.syncAll().catch(() => {});
    } catch { Alert.alert(t('common.error'), t('reports.createError')); }
    finally { setSaving(false); }
  };

  const visible = filterReportOptions(reports.filter(report => report.id !== excludeId && !report.is_archived).map(report => ({
    id: report.id, name: getExpenseReportDisplayTitle(report.title), startDate: report.start_date,
    endDate: report.end_date, updatedAt: report.updated_at, createdAt: report.created_at, report,
  })), search, from, to);
  const selected = visible.find(item => item.id === selectedId);
  const invalidPeriod = !!from && !!to && from > to;
  const dateLabel = (key: string) => formatDate(new Date(`${key}T12:00:00`));
  const period = (report: ExpenseReport) => {
    const start = reportDateKey(report.start_date);
    const end = reportDateKey(report.end_date);
    if (start && end) return `${dateLabel(start)} - ${dateLabel(end)}`;
    if (start) return `${t('reports.from')} ${dateLabel(start)}`;
    if (end) return `${t('reports.to')} ${dateLabel(end)}`;
    return t('reports.noPeriod');
  };
  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {allowCreate && <TouchableOpacity style={styles.button} onPress={() => setCreating(true)}>
        <Text style={styles.buttonText}>+ {t('reports.new')}</Text>
      </TouchableOpacity>}
      <TextInput style={styles.search} value={search} onChangeText={value => { setSearch(value); setSelectedId(''); }}
        accessibilityLabel={t('reports.search')} placeholder={t('reports.search')} placeholderTextColor="#777" />
      <View style={styles.dateRow}>
        {(['from', 'to'] as const).map(field => <TouchableOpacity key={field} style={styles.dateButton}
          accessibilityRole="button" onPress={() => { Keyboard.dismiss(); setDateField(field); }}>
          <Text style={styles.subtitle}>{t(`reports.${field}`)}</Text>
          <Text style={styles.dateText}>{(field === 'from' ? from : to) ? dateLabel(field === 'from' ? from : to) : t('reports.anyDate')}</Text>
        </TouchableOpacity>)}
      </View>
      {dateField && <FilterDatePicker key={dateField} value={(dateField === 'from' ? from : to) ? new Date(`${dateField === 'from' ? from : to}T12:00:00`) : null}
        onClose={() => setDateField(null)} onConfirm={date => {
          if (dateField === 'from') setFrom(reportDateKey(date)); else setTo(reportDateKey(date));
          setSelectedId(''); setDateField(null);
        }} />}
      {invalidPeriod && <Text accessibilityRole="alert" style={styles.error}>{t('reports.invalidPeriod')}</Text>}
      {(search || from || to) ? <TouchableOpacity accessibilityRole="button" style={styles.reset}
        onPress={() => { setSearch(''); setFrom(''); setTo(''); setSelectedId(''); setDateField(null); }}>
        <Text style={styles.link}>{t('reports.reset')}</Text>
      </TouchableOpacity> : null}
      <Text style={styles.hint}>{t('reports.recentFirst')}</Text>
      {(from || to) ? <Text style={styles.hint}>{t('reports.periodHint')}</Text> : null}
      {loading ? <ActivityIndicator /> : <FlatList data={visible} keyExtractor={item => item.id}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text>{t(search || from || to ? 'reports.noMatches' : 'reports.noDestinations')}</Text>}
        renderItem={({ item }) => <TouchableOpacity style={[styles.card, selectedId === item.id && styles.selected]}
          accessibilityRole={confirmSelection ? 'radio' : 'button'} accessibilityState={confirmSelection ? { checked: selectedId === item.id } : {}}
          onPress={() => { Keyboard.dismiss(); if (confirmSelection) setSelectedId(item.id); else onSelect(item.report); }}>
          <Text style={styles.title}>{item.name}</Text>
          <Text style={styles.subtitle}>{period(item.report)}</Text>
          {isGenericExpenseReportTitle(item.report.title) && <Text style={styles.subtitle}>{t('reports.default')}</Text>}
        </TouchableOpacity>} />}
      {confirmSelection && <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: !selected }}
        style={[styles.button, !selected && styles.disabled]} disabled={!selected} onPress={() => selected && onSelect(selected.report)}>
        <Text style={styles.buttonText}>{t('reports.confirmMove')}</Text>
      </TouchableOpacity>}
      <Modal visible={creating} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => !saving && setCreating(false)}>
        <SafeAreaView style={styles.container}>
          <Text style={styles.title}>{t('reports.new')}</Text>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} maxLength={255}
            placeholder={t('reports.name')} placeholderTextColor="#777" autoFocus />
          <TouchableOpacity style={styles.button} disabled={saving} onPress={create}>
            <Text style={styles.buttonText}>{saving ? t('common.loading') : t('common.create')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.card} disabled={saving} onPress={() => setCreating(false)}>
            <Text>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  list: { paddingBottom: 32 },
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 12, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '600', color: '#222', flexShrink: 1 },
  subtitle: { color: '#666', marginTop: 6 },
  button: { backgroundColor: '#007AFF', padding: 16, borderRadius: 10, marginBottom: 16, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  input: { backgroundColor: '#fff', color: '#222', padding: 16, borderRadius: 8, marginVertical: 20 },
  search: { backgroundColor: '#fff', color: '#222', padding: 12, borderRadius: 8, marginBottom: 8 },
  dateRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  dateButton: { flex: 1, backgroundColor: '#fff', borderRadius: 8, padding: 10 },
  dateText: { color: '#222', marginTop: 4, flexShrink: 1 },
  hint: { color: '#666', fontSize: 12, marginBottom: 8 },
  selected: { borderColor: '#007AFF', borderWidth: 2 },
  disabled: { opacity: 0.4 },
  error: { color: '#b00020', marginBottom: 8 },
  reset: { paddingVertical: 8 },
  link: { color: '#007AFF' },
});
