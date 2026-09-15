import React, { useState } from 'react';
import { FlatList, Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../i18n';
import { getCurrencyOptions, searchCurrencies } from '../utils/currencies';

export function CurrencyPicker({ value, onSelect, onClose }: {
  value: string; onSelect: (code: string) => void; onClose: () => void;
}) {
  const { locale, t } = useI18n();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const options = searchCurrencies(getCurrencyOptions(locale, value), query);
  const close = () => { Keyboard.dismiss(); onClose(); };

  return <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 16) }]} accessibilityViewIsModal>
    <View style={styles.header}>
      <Text accessibilityRole="header" style={styles.title}>{t('expenseForm.selectCurrency')}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('common.cancel')} onPress={close} style={styles.close}>
        <MaterialIcons name="close" size={24} color="#333" />
      </TouchableOpacity>
    </View>
    <TextInput style={styles.search} value={query} onChangeText={setQuery}
      accessibilityLabel={t('expenseForm.searchCurrency')} placeholder={t('expenseForm.searchCurrency')}
      placeholderTextColor="#666" autoCapitalize="none" autoCorrect={false} returnKeyType="search"
      onSubmitEditing={() => Keyboard.dismiss()} />
    <FlatList data={options} keyExtractor={item => item.code} style={styles.list}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      initialNumToRender={15}
      ListEmptyComponent={<Text style={styles.empty}>{t('expenseForm.noCurrencies')}</Text>}
      renderItem={({ item }) => {
        const selected = item.code === value.trim().toUpperCase();
        return <TouchableOpacity style={[styles.row, selected && styles.selected]}
          accessibilityRole="radio" accessibilityState={{ checked: selected }}
          accessibilityLabel={`${item.code}, ${item.name}`}
          onPress={() => { Keyboard.dismiss(); onSelect(item.code); }}>
          <View style={styles.text}>
            <Text style={styles.code}>{item.code}{item.symbol !== item.code ? `  ${item.symbol}` : ''}</Text>
            <Text style={styles.name}>{item.name}</Text>
          </View>
          {selected && <MaterialIcons name="check" size={24} color="#007AFF" />}
        </TouchableOpacity>;
      }} />
  </View>;
}

const styles = StyleSheet.create({
  panel: { height: '85%', width: '100%', backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  title: { flex: 1, fontSize: 18, fontWeight: '600', color: '#222' },
  close: { padding: 12 },
  search: { margin: 16, padding: 12, borderRadius: 10, backgroundColor: '#f0f1f4', color: '#222', fontSize: 16 },
  list: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd' },
  text: { flex: 1, paddingRight: 12 },
  code: { color: '#222', fontWeight: '600', fontSize: 16 },
  name: { color: '#555', fontSize: 15, marginTop: 4 },
  selected: { backgroundColor: '#e6f2ff' },
  empty: { padding: 24, color: '#666', textAlign: 'center' },
});
