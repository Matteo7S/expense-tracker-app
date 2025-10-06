import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { MaterialIcons } from '@expo/vector-icons';
import { ExpenseReportsScreen } from '../screens/main/ExpenseReportsScreen';
import { ExpenseReportDetailScreen } from '../screens/main/ExpenseReportDetailScreen';
import { CreateExpenseReportScreen } from '../screens/main/CreateExpenseReportScreen';
import { ExpenseDetailScreen } from '../screens/main/ExpenseDetailScreen';
import { CreateExpenseScreen } from '../screens/main/CreateExpenseScreen';
import { ExpenseEditScreen } from '../screens/main/ExpenseEditScreen';
import { CameraScreen } from '../screens/main/CameraScreen';
import { ProfileScreen } from '../screens/main/ProfileScreen';
import { ChangePasswordScreen } from '../screens/main/ChangePasswordScreen';
import { GenericScanScreen } from '../screens/main/GenericScanScreen';
import { GenericLiveOCRScreen } from '../screens/main/GenericLiveOCRScreen';
import { ArchivedExpensesScreen } from '../screens/main/ArchivedExpensesScreen';
import { ArchivedExpenseReportsScreen } from '../screens/main/ArchivedExpenseReportsScreen';
import { ExpenseReport } from '../types';

export type MainStackParamList = {
  ExpenseReportsTabs: undefined;
  ExpenseReportDetail: { reportId: string };
  CreateExpenseReport: undefined;
  EditExpenseReport: { report: ExpenseReport };
  ExpenseDetail: { expenseId: string };
  CreateExpense: { reportId: string };
  EditExpense: { expenseId: string };
  Camera: { reportId: string };
  GenericCamera: undefined;
  GenericLiveOCRCamera: { reportId?: string };
  ArchivedExpenses: undefined;
  ArchivedExpenseReports: undefined;
  ChangePassword: undefined;
};

export type TabParamList = {
  ExpenseReports: undefined;
  GenericScan: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createStackNavigator<MainStackParamList>();

function ExpenseReportsTab() {
  return <ExpenseReportsScreen />;
}

function ProfileTab() {
  return <ProfileScreen />;
}

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof MaterialIcons.glyphMap;
          let iconSize = size;

          if (route.name === 'ExpenseReports') {
            iconName = 'receipt-long';
          } else if (route.name === 'GenericScan') {
            iconName = 'camera-alt';
            iconSize = size + 8; // Icona più grande per il pulsante centrale
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
        name="ExpenseReports" 
        component={ExpenseReportsTab}
        options={{ title: 'Note Spese' }}
      />
      <Tab.Screen 
        name="GenericScan" 
        component={GenericScanScreen}
        options={{ title: 'Scansiona' }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileTab}
        options={{ title: 'Account' }}
      />
    </Tab.Navigator>
  );
}

export function MainNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="ExpenseReportsTabs" 
        component={TabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="ExpenseReportDetail" 
        component={ExpenseReportDetailScreen}
        options={{ title: 'Dettaglio Nota Spese' }}
      />
      <Stack.Screen 
        name="CreateExpenseReport" 
        component={CreateExpenseReportScreen}
        options={{ title: 'Nuova Nota Spese' }}
      />
      <Stack.Screen 
        name="EditExpenseReport" 
        component={CreateExpenseReportScreen}
        options={{ title: 'Modifica Nota Spese' }}
      />
      <Stack.Screen 
        name="CreateExpense" 
        component={CreateExpenseScreen}
        options={{ title: 'Nuova Spesa' }}
      />
      <Stack.Screen 
        name="EditExpense" 
        component={ExpenseEditScreen}
        options={{ title: 'Modifica Spesa' }}
      />
      <Stack.Screen 
        name="ExpenseDetail" 
        component={ExpenseDetailScreen}
        options={{ title: 'Dettaglio Spesa' }}
      />
      <Stack.Screen 
        name="Camera" 
        component={CameraScreen}
        options={{ title: 'Scansiona Scontrino' }}
      />
      <Stack.Screen 
        name="GenericCamera" 
        component={CameraScreen}
        options={{ title: 'Scansione Generica' }}
      />
      <Stack.Screen 
        name="GenericLiveOCRCamera" 
        component={GenericLiveOCRScreen}
        options={{ 
          headerShown: false,
          gestureEnabled: false // Disabilita il gesture di back per evitare conflitti
        }}
      />
      <Stack.Screen 
        name="ArchivedExpenses" 
        component={ArchivedExpensesScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="ArchivedExpenseReports" 
        component={ArchivedExpenseReportsScreen}
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
