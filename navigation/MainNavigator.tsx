import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { MaterialIcons } from '@expo/vector-icons';
import { ExpensesScreen } from '../screens/main/ExpensesScreen';
import { ExpenseReportsScreen } from '../screens/main/ExpenseReportsScreen';
import { ExpenseDetailScreen } from '../screens/main/ExpenseDetailScreen';
import { CreateExpenseScreen } from '../screens/main/CreateExpenseScreen';
import { ExpenseEditScreen } from '../screens/main/ExpenseEditScreen';
import { CameraScreen } from '../screens/main/CameraScreen';
import { ProfileScreen } from '../screens/main/ProfileScreen';
import { ChangePasswordScreen } from '../screens/main/ChangePasswordScreen';
import { GenericScanScreen } from '../screens/main/GenericScanScreen';
import { GenericLiveOCRScreen } from '../screens/main/GenericLiveOCRScreen';
import { ArchivedExpensesScreen } from '../screens/main/ArchivedExpensesScreen';
import { useI18n } from '../i18n';

export type MainStackParamList = {
  ExpenseReportsTabs: undefined;
  ReportExpenses: { reportId: string; title: string };
  ExpenseDetail: { expenseId: string };
  CreateExpense: { reportId: string };
  EditExpense: { expenseId: string };
  Camera: { reportId: string };
  GenericCamera: { reportId: string };
  GenericLiveOCRCamera: { reportId: string };
  ArchivedExpenses: undefined;
  ChangePassword: undefined;
};

export type TabParamList = {
  Expenses: undefined;
  GenericScan: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createStackNavigator<MainStackParamList>();

function TabNavigator() {
  const { t } = useI18n();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof MaterialIcons.glyphMap;
          let iconSize = size;

          if (route.name === 'Expenses') {
            iconName = 'receipt-long';
          } else if (route.name === 'GenericScan') {
            iconName = 'camera-alt';
            iconSize = size + 8;
          } else if (route.name === 'Profile') {
            iconName = 'person';
          } else {
            iconName = 'help';
          }

          return <MaterialIcons name={iconName} size={iconSize} color={color} />;
        },
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: 'gray',
        headerShown: false,
      })}
    >
      <Tab.Screen
        name="Expenses"
        component={ExpenseReportsScreen}
        options={{ title: t('reports.title') }}
      />
      <Tab.Screen
        name="GenericScan"
        component={GenericScanScreen}
        options={{ title: t('navigation.scan') }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: t('navigation.account') }}
      />
    </Tab.Navigator>
  );
}

export function MainNavigator() {
  const { t } = useI18n();

  return (
    <Stack.Navigator initialRouteName="ExpenseReportsTabs">
      <Stack.Screen name="ReportExpenses" component={ExpensesScreen} options={({ route }) => ({ title: route.params.title })} />
      <Stack.Screen
        name="ExpenseReportsTabs"
        component={TabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CreateExpense"
        component={CreateExpenseScreen}
        options={{ title: t('navigation.newExpense') }}
      />
      <Stack.Screen
        name="EditExpense"
        component={ExpenseEditScreen}
        options={{ title: t('navigation.editExpense') }}
      />
      <Stack.Screen
        name="ExpenseDetail"
        component={ExpenseDetailScreen}
        options={{ title: t('navigation.expenseDetail') }}
      />
      <Stack.Screen
        name="Camera"
        component={CameraScreen}
        options={{ title: t('navigation.scanReceipt') }}
      />
      <Stack.Screen
        name="GenericCamera"
        component={CameraScreen}
        options={{ title: t('navigation.genericScan') }}
      />
      <Stack.Screen
        name="GenericLiveOCRCamera"
        component={GenericLiveOCRScreen}
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="ArchivedExpenses"
        component={ArchivedExpensesScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
