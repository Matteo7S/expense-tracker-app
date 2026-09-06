import React, { useState } from 'react';
import { Platform, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useI18n } from '../i18n';

interface FilterDatePickerProps {
  value: Date | null;
  onConfirm: (date: Date) => void;
  onClose: () => void;
}

// Mount only while open, inside the filter modal (also on iOS).
export function FilterDatePicker({ value, onConfirm, onClose }: FilterDatePickerProps) {
  const { locale, t } = useI18n();
  const [draftDate, setDraftDate] = useState(() => value || new Date());

  return (
    <View>
      <DateTimePicker
        value={draftDate}
        mode="date"
        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
        locale={locale}
        themeVariant="light"
        textColor="#000000"
        style={{ width: '100%' }}
        positiveButton={{ label: t('common.confirm') }}
        negativeButton={{ label: t('common.cancel') }}
        onChange={(event, date) => {
          if (Platform.OS === 'ios') {
            if (event.type === 'set' && date) setDraftDate(date);
          } else {
            onClose();
            if (event.type === 'set' && date) onConfirm(date);
          }
        }}
      />
      {Platform.OS === 'ios' && (
        <View style={styles.actions}>
          <TouchableOpacity accessibilityRole="button" onPress={onClose} style={styles.button}>
            <Text style={styles.cancel}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            style={[styles.button, styles.confirm]}
            onPress={() => { onConfirm(draftDate); onClose(); }}
          >
            <Text style={styles.confirmText}>{t('common.confirm')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginBottom: 12 },
  button: { padding: 12, borderRadius: 8 },
  cancel: { color: '#007AFF', fontSize: 16 },
  confirm: { backgroundColor: '#007AFF' },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
