import React from 'react';
import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MainStackParamList } from '../../navigation/MainNavigator';
import { ReportList } from '../../components/ReportList';
import { getExpenseReportDisplayTitle } from '../../utils/expenseReportDisplay';
import { useI18n } from '../../i18n';

export function ExpenseReportsScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const { t } = useI18n();
  return <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
    <Text style={{ fontSize: 26, fontWeight: '700', padding: 20 }}>{t('reports.title')}</Text>
    <ReportList onSelect={report => navigation.navigate('ReportExpenses', {
      reportId: report.id, title: getExpenseReportDisplayTitle(report.title)
    })} />
  </SafeAreaView>;
}
