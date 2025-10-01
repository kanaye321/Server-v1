
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  Cpu,
  Database,
  HardDrive,
  Monitor,
  RefreshCw,
  Server,
  Settings,
  TrendingUp,
  TrendingDown,
  Wifi,
  Zap,
  Eye,
  XCircle
} from 'lucide-react';

// Zabbix configuration schema
const zabbixConfigSchema = z.object({
  url: z.string().url('Please enter a valid URL'),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  apiVersion: z.string().default('2.4'),
  autoRefresh: z.boolean().default(true),
  refreshInterval: z.number().min(30).max(600).default(60)
});

type ZabbixConfig = z.infer<typeof zabbixConfigSchema>;

// Interfaces for Zabbix data
interface ZabbixHost {
  hostid: string;
  host: string;
  name: string;
  status: string;
  available: string;
  cpu_usage?: number;
  memory_usage?: number;
  uptime?: number;
  last_seen?: string;
  groups?: string[];
}

interface ZabbixProblem {
  eventid: string;
  name: string;
  severity: number;
  acknowledged: string;
  clock: string;
  hosts: Array<{ host: string; name: string }>;
  age: string;
}

interface ServerMetrics {
  hosts: ZabbixHost[];
  problems: ZabbixProblem[];
  totalHosts: number;
  availableHosts: number;
  unavailableHosts: number;
  avgCpuUsage: number;
  avgMemoryUsage: number;
}

export default function ServerMonitoring() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isConfigured, setIsConfigured] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Form for Zabbix configuration
  const form = useForm<ZabbixConfig>({
    resolver: zodResolver(zabbixConfigSchema),
    defaultValues: {
      url: '',
      username: '',
      password: '',
      apiVersion: '2.4',
      autoRefresh: true,
      refreshInterval: 60
    }
  });

  // Load saved configuration
  useEffect(() => {
    const loadConfig = () => {
      try {
        const savedConfig = localStorage.getItem('zabbix-server-config');
        if (savedConfig) {
          const config = JSON.parse(savedConfig);
          form.reset(config);
          setIsConfigured(true);
        }
      } catch (error) {
        console.error('Failed to load saved config:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadConfig();
  }, [form]);

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: async (config: ZabbixConfig) => {
      const response = await fetch('/api/server-monitoring/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
        credentials: 'include'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Connection test failed');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Connection Successful",
        description: `Connected to Zabbix server successfully. ${data.hostCount ? `Found ${data.hostCount} hosts.` : ''}`
      });
    },
    onError: (error) => {
      toast({
        title: "Connection Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Save configuration mutation (with connection testing)
  const saveConfigMutation = useMutation({
    mutationFn: async (config: ZabbixConfig) => {
      // First test the connection
      const testResponse = await fetch('/api/server-monitoring/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
        credentials: 'include'
      });

      if (!testResponse.ok) {
        const error = await testResponse.json();
        throw new Error(error.message || 'Connection test failed');
      }

      // If connection test passes, save the configuration
      localStorage.setItem('zabbix-server-config', JSON.stringify(config));
      return config;
    },
    onSuccess: (config) => {
      setIsConfigured(true);
      setShowSettings(false);
      toast({
        title: "Configuration Saved",
        description: "Zabbix configuration saved and connection verified successfully"
      });
      // Trigger data refresh
      queryClient.invalidateQueries({ queryKey: ['/api/server-monitoring/metrics'] });
    },
    onError: (error) => {
      toast({
        title: "Configuration Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Fetch monitoring data
  const { data: metrics, isLoading: isFetchingMetrics, error, refetch } = useQuery({
    queryKey: ['/api/server-monitoring/metrics'],
    queryFn: async (): Promise<ServerMetrics> => {
      const config = JSON.parse(localStorage.getItem('zabbix-server-config') || '{}');
      
      if (!config.url || !config.username || !config.password) {
        throw new Error('Zabbix configuration is incomplete. Please check settings.');
      }
      
      const response = await fetch('/api/server-monitoring/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      
      // Validate the response structure
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response format from server');
      }
      
      // Ensure required fields exist with defaults
      return {
        hosts: data.hosts || [],
        problems: data.problems || [],
        totalHosts: data.totalHosts || 0,
        availableHosts: data.availableHosts || 0,
        unavailableHosts: data.unavailableHosts || 0,
        avgCpuUsage: data.avgCpuUsage || 0,
        avgMemoryUsage: data.avgMemoryUsage || 0
      };
    },
    enabled: isConfigured,
    refetchInterval: form.watch('autoRefresh') ? form.watch('refreshInterval') * 1000 : false,
    retry: (failureCount, error) => {
      // Don't retry authentication errors
      if (error.message.includes('Authentication') || error.message.includes('401')) {
        return false;
      }
      // Retry network errors up to 3 times
      return failureCount < 3;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000)
  });

  const handleSubmit = (data: ZabbixConfig) => {
    saveConfigMutation.mutate(data);
  };

  const getSeverityColor = (severity: number) => {
    switch (severity) {
      case 5: return 'bg-red-500'; // Disaster
      case 4: return 'bg-orange-500'; // High
      case 3: return 'bg-yellow-500'; // Average
      case 2: return 'bg-blue-500'; // Warning
      case 1: return 'bg-green-500'; // Information
      default: return 'bg-gray-500'; // Not classified
    }
  };

  const getSeverityText = (severity: number) => {
    switch (severity) {
      case 5: return 'Disaster';
      case 4: return 'High';
      case 3: return 'Average';
      case 2: return 'Warning';
      case 1: return 'Information';
      default: return 'Not Classified';
    }
  };

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Show loading state while initializing
  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold">Server Monitoring</h1>
          <div className="flex justify-center items-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin mr-2" />
            <p>Initializing...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isConfigured || showSettings) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Server Monitoring</h1>
            <p className="text-muted-foreground">Configure Zabbix connection to monitor servers</p>
          </div>
          {isConfigured && (
            <Button variant="outline" onClick={() => setShowSettings(false)}>
              Cancel
            </Button>
          )}
        </div>

        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Zabbix Configuration
            </CardTitle>
            <CardDescription>
              Enter your Zabbix server credentials to start monitoring
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label htmlFor="url">Zabbix Server URL</Label>
                  <Input
                    id="url"
                    placeholder="https://your-zabbix-server.com/zabbix"
                    {...form.register('url')}
                  />
                  {form.formState.errors.url && (
                    <p className="text-sm text-red-500">{form.formState.errors.url.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      placeholder="admin"
                      {...form.register('username')}
                    />
                    {form.formState.errors.username && (
                      <p className="text-sm text-red-500">{form.formState.errors.username.message}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      {...form.register('password')}
                    />
                    {form.formState.errors.password && (
                      <p className="text-sm text-red-500">{form.formState.errors.password.message}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="apiVersion">API Version</Label>
                    <Input
                      id="apiVersion"
                      placeholder="2.4"
                      {...form.register('apiVersion')}
                    />
                  </div>

                  <div>
                    <Label htmlFor="refreshInterval">Refresh Interval (seconds)</Label>
                    <Input
                      id="refreshInterval"
                      type="number"
                      min="30"
                      max="600"
                      {...form.register('refreshInterval', { valueAsNumber: true })}
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="autoRefresh"
                    {...form.register('autoRefresh')}
                  />
                  <Label htmlFor="autoRefresh">Auto-refresh data</Label>
                </div>
              </div>

              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={testConnectionMutation.isPending}
                  onClick={() => testConnectionMutation.mutate(form.getValues())}
                >
                  {testConnectionMutation.isPending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Testing Connection...
                    </>
                  ) : (
                    'Test Connection'
                  )}
                </Button>

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={saveConfigMutation.isPending}
                >
                  {saveConfigMutation.isPending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Saving Configuration...
                    </>
                  ) : (
                    'Save Configuration & Connect'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isFetchingMetrics) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Server Monitoring</h1>
          <Button variant="outline" onClick={() => setShowSettings(true)}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </div>
        <div className="text-center space-y-4 py-12">
          <RefreshCw className="h-8 w-8 animate-spin mr-2 inline-block" />
          <p>Loading monitoring data from Zabbix server...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Server Monitoring</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowSettings(true)}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
            <Button onClick={() => refetch()} disabled={isFetchingMetrics}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetchingMetrics ? 'animate-spin' : ''}`} />
              Retry
            </Button>
          </div>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <p><strong>Failed to load monitoring data:</strong></p>
              <p className="text-sm">{error.message}</p>
              {error.message.includes('Authentication') && (
                <p className="text-sm text-muted-foreground">
                  This appears to be an authentication issue. Please check your Zabbix credentials in Settings.
                </p>
              )}
              {error.message.includes('Network') && (
                <p className="text-sm text-muted-foreground">
                  This appears to be a network connectivity issue. Please verify your Zabbix server URL and network connection.
                </p>
              )}
              <div className="flex gap-2 mt-3">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => refetch()} 
                  disabled={isFetchingMetrics}
                >
                  {isFetchingMetrics ? (
                    <>
                      <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
                      Retrying...
                    </>
                  ) : (
                    'Try Again'
                  )}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowSettings(true)}
                >
                  Check Settings
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Main monitoring view with real data
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Server Monitoring</h1>
          <p className="text-muted-foreground">
            Real-time server monitoring via Zabbix integration
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowSettings(true)}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
          <Button onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Hosts</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.totalHosts || 0}</div>
            <p className="text-xs text-muted-foreground">
              Monitored servers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{metrics?.availableHosts || 0}</div>
            <p className="text-xs text-muted-foreground">
              Online servers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unavailable</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{metrics?.unavailableHosts || 0}</div>
            <p className="text-xs text-muted-foreground">
              Offline servers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Problems</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{metrics?.problems?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              Current alerts
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="hosts">Host Details</TabsTrigger>
          <TabsTrigger value="problems">Current Problems</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Hosts by CPU */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="h-5 w-5" />
                  Top Hosts by CPU Utilization
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {metrics?.hosts
                    ?.filter(host => host.cpu_usage !== undefined)
                    ?.sort((a, b) => (b.cpu_usage || 0) - (a.cpu_usage || 0))
                    ?.slice(0, 5)
                    ?.map((host) => (
                      <div key={host.hostid} className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{host.name}</p>
                          <p className="text-xs text-muted-foreground">{host.host}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Progress value={host.cpu_usage || 0} className="w-20" />
                          <span className="text-sm font-medium w-12">{host.cpu_usage?.toFixed(1) || 0}%</span>
                        </div>
                      </div>
                    ))}
                  {(!metrics?.hosts || metrics.hosts.filter(h => h.cpu_usage !== undefined).length === 0) && (
                    <p className="text-sm text-muted-foreground text-center py-4">No CPU data available</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Memory Utilization */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="h-5 w-5" />
                  Memory Utilization
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {metrics?.hosts
                    ?.filter(host => host.memory_usage !== undefined)
                    ?.sort((a, b) => (b.memory_usage || 0) - (a.memory_usage || 0))
                    ?.slice(0, 5)
                    ?.map((host) => (
                      <div key={host.hostid} className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{host.name}</p>
                          <p className="text-xs text-muted-foreground">{host.host}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Progress value={host.memory_usage || 0} className="w-20" />
                          <span className="text-sm font-medium w-12">{host.memory_usage?.toFixed(1) || 0}%</span>
                        </div>
                      </div>
                    ))}
                  {(!metrics?.hosts || metrics.hosts.filter(h => h.memory_usage !== undefined).length === 0) && (
                    <p className="text-sm text-muted-foreground text-center py-4">No memory data available</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Problems by Severity */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Problems by Severity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[5, 4, 3, 2, 1, 0].map(severity => {
                    const count = metrics?.problems?.filter(p => p.severity === severity).length || 0;
                    return (
                      <div key={severity} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${getSeverityColor(severity)}`} />
                          <span className="text-sm">{getSeverityText(severity)}</span>
                        </div>
                        <Badge variant="outline">{count}</Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Host Availability */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Host Availability
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-sm">Available</span>
                    <span className="text-sm font-medium text-green-600">
                      {metrics?.availableHosts || 0} / {metrics?.totalHosts || 0}
                    </span>
                  </div>
                  <Progress 
                    value={metrics?.totalHosts ? (metrics.availableHosts / metrics.totalHosts) * 100 : 0} 
                    className="h-2"
                  />
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full" />
                      <span>Online: {metrics?.availableHosts || 0}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-red-500 rounded-full" />
                      <span>Offline: {metrics?.unavailableHosts || 0}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="hosts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Information</CardTitle>
              <CardDescription>Complete list of monitored hosts with system information</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Host Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>CPU %</TableHead>
                      <TableHead>Memory %</TableHead>
                      <TableHead>Uptime</TableHead>
                      <TableHead>Last Seen</TableHead>
                      <TableHead>Groups</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metrics?.hosts?.map((host) => (
                      <TableRow key={host.hostid}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{host.name}</p>
                            <p className="text-sm text-muted-foreground">{host.host}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={host.available === '1' ? 'default' : 'destructive'}
                          >
                            {host.available === '1' ? 'Available' : 'Unavailable'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {host.cpu_usage !== undefined ? (
                              <>
                                <Progress value={host.cpu_usage} className="w-16" />
                                <span className="text-sm">{host.cpu_usage.toFixed(1)}%</span>
                              </>
                            ) : (
                              <span className="text-sm text-muted-foreground">N/A</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {host.memory_usage !== undefined ? (
                              <>
                                <Progress value={host.memory_usage} className="w-16" />
                                <span className="text-sm">{host.memory_usage.toFixed(1)}%</span>
                              </>
                            ) : (
                              <span className="text-sm text-muted-foreground">N/A</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {host.uptime ? formatUptime(host.uptime) : 'N/A'}
                        </TableCell>
                        <TableCell>
                          {host.last_seen ? new Date(host.last_seen).toLocaleString() : 'N/A'}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {host.groups?.slice(0, 2).map((group, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {group}
                              </Badge>
                            ))}
                            {(host.groups?.length || 0) > 2 && (
                              <Badge variant="outline" className="text-xs">
                                +{(host.groups?.length || 0) - 2}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!metrics?.hosts || metrics.hosts.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No hosts data available from Zabbix server
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="problems" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Current Problems</CardTitle>
              <CardDescription>Active alerts and issues requiring attention</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Severity</TableHead>
                      <TableHead>Problem</TableHead>
                      <TableHead>Host</TableHead>
                      <TableHead>Age</TableHead>
                      <TableHead>Acknowledged</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metrics?.problems?.map((problem) => (
                      <TableRow key={problem.eventid}>
                        <TableCell>
                          <Badge className={`${getSeverityColor(problem.severity)} text-white`}>
                            {getSeverityText(problem.severity)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{problem.name}</p>
                        </TableCell>
                        <TableCell>
                          {problem.hosts.map((host, index) => (
                            <div key={index}>
                              <p className="text-sm">{host.name}</p>
                              <p className="text-xs text-muted-foreground">{host.host}</p>
                            </div>
                          ))}
                        </TableCell>
                        <TableCell>{problem.age}</TableCell>
                        <TableCell>
                          <Badge variant={problem.acknowledged === '1' ? 'default' : 'secondary'}>
                            {problem.acknowledged === '1' ? 'Yes' : 'No'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(parseInt(problem.clock) * 1000).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!metrics?.problems || metrics.problems.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No current problems found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Server Uptime and Downtime</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {metrics?.hosts
                    ?.filter(host => host.uptime !== undefined)
                    ?.sort((a, b) => (b.uptime || 0) - (a.uptime || 0))
                    ?.slice(0, 10)
                    ?.map((host) => (
                      <div key={host.hostid} className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{host.name}</p>
                          <p className="text-xs text-muted-foreground">{host.host}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">{formatUptime(host.uptime || 0)}</p>
                          <p className="text-xs text-muted-foreground">uptime</p>
                        </div>
                      </div>
                    ))}
                  {(!metrics?.hosts || metrics.hosts.filter(h => h.uptime !== undefined).length === 0) && (
                    <p className="text-sm text-muted-foreground text-center py-4">No uptime data available</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>System Information Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-4 bg-blue-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-700">
                        {metrics?.avgCpuUsage?.toFixed(1) || 0}%
                      </div>
                      <div className="text-sm text-blue-600">Avg CPU Usage</div>
                    </div>
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-700">
                        {metrics?.avgMemoryUsage?.toFixed(1) || 0}%
                      </div>
                      <div className="text-sm text-green-600">Avg Memory Usage</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-4 bg-purple-50 rounded-lg">
                      <div className="text-2xl font-bold text-purple-700">
                        {((metrics?.totalHosts || 0) === 0 ? 0 : (metrics?.availableHosts || 0) / (metrics?.totalHosts || 1) * 100).toFixed(1)}%
                      </div>
                      <div className="text-sm text-purple-600">Availability</div>
                    </div>
                    <div className="text-center p-4 bg-orange-50 rounded-lg">
                      <div className="text-2xl font-bold text-orange-700">
                        {metrics?.problems?.length || 0}
                      </div>
                      <div className="text-sm text-orange-600">Active Issues</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
