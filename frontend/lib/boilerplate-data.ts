export type ResourceKey = 'electricity' | 'water' | 'gas' | 'heating'

export type House = {
  id: string
  name: string
  address: string
  unitsCount: number
  occupancyRate: number
  manager: string
}

export type ResourceKpi = {
  key: ResourceKey
  label: string
  unit: string
  currentValue: number
  deltaPercent: number
  target: number
}

export type MeterHealth = {
  id: string
  houseName: string
  resource: ResourceKey
  signalStrength: 'good' | 'weak' | 'offline'
  lastSync: string
}

export type ResourceAlert = {
  id: string
  houseName: string
  resource: ResourceKey
  severity: 'low' | 'medium' | 'high'
  title: string
  detectedAt: string
}

export type MaintenanceTask = {
  id: string
  houseName: string
  scope: string
  status: 'planned' | 'in_progress' | 'blocked' | 'done'
  dueDate: string
}

export type IntegrationStatus = {
  id: string
  name: string
  status: 'healthy' | 'degraded' | 'down'
  lastIngestion: string
}

export type MonthlyReport = {
  id: string
  period: string
  totalConsumption: number
  unit: string
  anomalyCount: number
}

export const houses: House[] = [
  {
    id: 'house-1',
    name: 'Maple Residence',
    address: '12 Maple Street',
    unitsCount: 42,
    occupancyRate: 94,
    manager: 'Olivia Smith',
  },
  {
    id: 'house-2',
    name: 'River Park',
    address: '88 River Avenue',
    unitsCount: 60,
    occupancyRate: 89,
    manager: 'Lucas Martin',
  },
  {
    id: 'house-3',
    name: 'Oak Gardens',
    address: '31 Oak Lane',
    unitsCount: 28,
    occupancyRate: 96,
    manager: 'Emma Wilson',
  },
]

export const resourceKpis: ResourceKpi[] = [
  { key: 'electricity', label: 'Electricity', unit: 'kWh', currentValue: 11420, deltaPercent: 3.2, target: 10500 },
  { key: 'water', label: 'Water', unit: 'm3', currentValue: 2760, deltaPercent: -1.8, target: 2900 },
  { key: 'gas', label: 'Gas', unit: 'm3', currentValue: 1890, deltaPercent: 5.4, target: 1700 },
  { key: 'heating', label: 'Heating', unit: 'Gcal', currentValue: 342, deltaPercent: 1.1, target: 330 },
]

export const meterHealth: MeterHealth[] = [
  { id: 'm-1', houseName: 'Maple Residence', resource: 'electricity', signalStrength: 'good', lastSync: '2 min ago' },
  { id: 'm-2', houseName: 'Maple Residence', resource: 'water', signalStrength: 'weak', lastSync: '9 min ago' },
  { id: 'm-3', houseName: 'River Park', resource: 'gas', signalStrength: 'offline', lastSync: '53 min ago' },
  { id: 'm-4', houseName: 'Oak Gardens', resource: 'heating', signalStrength: 'good', lastSync: '1 min ago' },
]

export const resourceAlerts: ResourceAlert[] = [
  {
    id: 'a-1',
    houseName: 'River Park',
    resource: 'gas',
    severity: 'high',
    title: 'Unexpected night-time gas usage spike',
    detectedAt: '10:14',
  },
  {
    id: 'a-2',
    houseName: 'Maple Residence',
    resource: 'water',
    severity: 'medium',
    title: 'Persistent leak pattern in section B',
    detectedAt: '09:02',
  },
  {
    id: 'a-3',
    houseName: 'Oak Gardens',
    resource: 'electricity',
    severity: 'low',
    title: 'Elevator power draw above baseline',
    detectedAt: '07:48',
  },
]

export const maintenanceTasks: MaintenanceTask[] = [
  { id: 't-1', houseName: 'Maple Residence', scope: 'Replace water meter in block B', status: 'planned', dueDate: '2026-03-21' },
  { id: 't-2', houseName: 'River Park', scope: 'Inspect gas collector valve', status: 'in_progress', dueDate: '2026-03-20' },
  { id: 't-3', houseName: 'Oak Gardens', scope: 'Calibrate heating sensor array', status: 'blocked', dueDate: '2026-03-24' },
]

export const integrationStatuses: IntegrationStatus[] = [
  { id: 'i-1', name: 'Smart Meter Gateway', status: 'healthy', lastIngestion: '30 sec ago' },
  { id: 'i-2', name: 'Billing System', status: 'degraded', lastIngestion: '8 min ago' },
  { id: 'i-3', name: 'Weather API', status: 'healthy', lastIngestion: '3 min ago' },
  { id: 'i-4', name: 'Tenant Mobile App', status: 'down', lastIngestion: '41 min ago' },
]

export const monthlyReports: MonthlyReport[] = [
  { id: 'r-1', period: '2026-01', totalConsumption: 15980, unit: 'kWh eq.', anomalyCount: 4 },
  { id: 'r-2', period: '2026-02', totalConsumption: 15140, unit: 'kWh eq.', anomalyCount: 3 },
  { id: 'r-3', period: '2026-03', totalConsumption: 14870, unit: 'kWh eq.', anomalyCount: 2 },
]

export const formatPercent = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
