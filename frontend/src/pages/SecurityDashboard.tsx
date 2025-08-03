/**
 * Security Monitoring Dashboard
 * Real-time security monitoring, threat detection, and audit visualization
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  ChartBarIcon,
  ClockIcon,
  UserGroupIcon,
  GlobeAltIcon,
  LockClosedIcon,
  DocumentTextIcon,
  BellAlertIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  FunnelIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { 
  securityLogger, 
  SecurityEventType, 
  SecuritySeverity,
  SecurityMetrics,
  SecurityLogEntry 
} from '@/utils/securityLogging';
import { 
  threatDetector,
  AnomalyDetectionResult 
} from '@/utils/threatDetection';
import { 
  auditTrail,
  AuditCategory,
  AuditEvent,
  AuditReport 
} from '@/utils/auditTrail';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/utils/cn';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Dashboard tabs
type TabType = 'overview' | 'threats' | 'audit' | 'analytics';

// Time range options
type TimeRange = '1h' | '24h' | '7d' | '30d' | 'custom';

interface SecurityDashboardProps {
  className?: string;
}

export const SecurityDashboard: React.FC<SecurityDashboardProps> = ({ className }) => {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [isLoading, setIsLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  
  // Security data states
  const [metrics, setMetrics] = useState<SecurityMetrics | null>(null);
  const [recentEvents, setRecentEvents] = useState<SecurityLogEntry[]>([]);
  const [threats, setThreats] = useState<AnomalyDetectionResult[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [userThreatAssessment, setUserThreatAssessment] = useState<any>(null);
  
  // Chart data states
  const [eventTrendData, setEventTrendData] = useState<any>(null);
  const [severityDistribution, setSeverityDistribution] = useState<any>(null);
  const [topThreatsData, setTopThreatsData] = useState<any>(null);

  /**
   * Get time range in milliseconds
   */
  const getTimeRangeMs = useCallback((): { start: number; end: number } => {
    const end = Date.now();
    let start = end;
    
    switch (timeRange) {
      case '1h':
        start = end - 60 * 60 * 1000;
        break;
      case '24h':
        start = end - 24 * 60 * 60 * 1000;
        break;
      case '7d':
        start = end - 7 * 24 * 60 * 60 * 1000;
        break;
      case '30d':
        start = end - 30 * 24 * 60 * 60 * 1000;
        break;
    }
    
    return { start, end };
  }, [timeRange]);

  /**
   * Load security metrics
   */
  const loadMetrics = useCallback(async () => {
    try {
      const { start, end } = getTimeRangeMs();
      const metricsData = await securityLogger.getMetrics(start, end);
      setMetrics(metricsData);
      
      // Update chart data
      updateChartData(metricsData);
    } catch (error) {
      console.error('Failed to load security metrics:', error);
    }
  }, [getTimeRangeMs]);

  /**
   * Load recent security events
   */
  const loadRecentEvents = useCallback(async () => {
    try {
      const events = securityLogger.getRecentEvents(50, {
        severity: [SecuritySeverity.HIGH, SecuritySeverity.CRITICAL],
      });
      setRecentEvents(events);
      
      // Analyze events for threats
      const threatResults: AnomalyDetectionResult[] = [];
      for (const event of events.slice(0, 10)) {
        const result = await threatDetector.analyzeEvent(event);
        if (result.isAnomaly) {
          threatResults.push(result);
        }
      }
      setThreats(threatResults);
    } catch (error) {
      console.error('Failed to load recent events:', error);
    }
  }, []);

  /**
   * Load audit trail
   */
  const loadAuditTrail = useCallback(async () => {
    try {
      const { start, end } = getTimeRangeMs();
      const events = await auditTrail.searchAuditEvents({
        startTime: start,
        endTime: end,
        limit: 100,
      });
      setAuditEvents(events);
    } catch (error) {
      console.error('Failed to load audit trail:', error);
    }
  }, [getTimeRangeMs]);

  /**
   * Load user threat assessment
   */
  const loadUserThreatAssessment = useCallback(async () => {
    if (!user) return;
    
    try {
      const assessment = await threatDetector.getUserThreatAssessment(user.id);
      setUserThreatAssessment(assessment);
    } catch (error) {
      console.error('Failed to load threat assessment:', error);
    }
  }, [user]);

  /**
   * Update chart data from metrics
   */
  const updateChartData = (metricsData: SecurityMetrics) => {
    // Event trend line chart
    const trendLabels = Object.keys(metricsData.eventsByType).slice(0, 5);
    const trendData = trendLabels.map(type => metricsData.eventsByType[type as SecurityEventType] || 0);
    
    setEventTrendData({
      labels: trendLabels,
      datasets: [{
        label: 'Security Events',
        data: trendData,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
        fill: true,
      }],
    });

    // Severity distribution pie chart
    const severityData = Object.values(SecuritySeverity).map(
      severity => metricsData.eventsBySeverity[severity] || 0
    );
    
    setSeverityDistribution({
      labels: Object.values(SecuritySeverity),
      datasets: [{
        data: severityData,
        backgroundColor: [
          'rgba(34, 197, 94, 0.8)',   // INFO - green
          'rgba(250, 204, 21, 0.8)',  // LOW - yellow
          'rgba(251, 146, 60, 0.8)',  // MEDIUM - orange
          'rgba(239, 68, 68, 0.8)',   // HIGH - red
          'rgba(127, 29, 29, 0.8)',   // CRITICAL - dark red
        ],
      }],
    });

    // Top threats bar chart
    const threatsData = metricsData.topThreats.slice(0, 5);
    
    setTopThreatsData({
      labels: threatsData.map(t => t.type.replace(/_/g, ' ')),
      datasets: [{
        label: 'Threat Count',
        data: threatsData.map(t => t.count),
        backgroundColor: 'rgba(239, 68, 68, 0.8)',
      }],
    });
  };

  /**
   * Initial data load
   */
  useEffect(() => {
    const loadAllData = async () => {
      setIsLoading(true);
      await Promise.all([
        loadMetrics(),
        loadRecentEvents(),
        loadAuditTrail(),
        loadUserThreatAssessment(),
      ]);
      setIsLoading(false);
    };
    
    loadAllData();
  }, [loadMetrics, loadRecentEvents, loadAuditTrail, loadUserThreatAssessment]);

  /**
   * Auto-refresh setup
   */
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      loadMetrics();
      loadRecentEvents();
    }, 30000); // 30 seconds
    
    return () => clearInterval(interval);
  }, [autoRefresh, loadMetrics, loadRecentEvents]);

  /**
   * Handle security alerts
   */
  useEffect(() => {
    const handleSecurityAlert = (event: CustomEvent) => {
      const { log, type } = event.detail;
      console.warn('Security Alert:', type, log);
      // In production, show notification or trigger alert
    };
    
    window.addEventListener('securityAlert', handleSecurityAlert as EventListener);
    window.addEventListener('securityAnomaly', handleSecurityAlert as EventListener);
    
    return () => {
      window.removeEventListener('securityAlert', handleSecurityAlert as EventListener);
      window.removeEventListener('securityAnomaly', handleSecurityAlert as EventListener);
    };
  }, []);

  /**
   * Export security report
   */
  const exportSecurityReport = async () => {
    try {
      const { start, end } = getTimeRangeMs();
      
      // Generate audit report
      const report = await auditTrail.generateAuditReport(
        {
          startTime: start,
          endTime: end,
        },
        'Security Dashboard Export',
        user?.email || 'system'
      );
      
      // Export as JSON
      const reportJson = JSON.stringify(report, null, 2);
      const blob = new Blob([reportJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `security_report_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export report:', error);
    }
  };

  /**
   * Get severity color
   */
  const getSeverityColor = (severity: SecuritySeverity) => {
    switch (severity) {
      case SecuritySeverity.CRITICAL:
        return 'text-red-800 bg-red-100 dark:bg-red-900/30 dark:text-red-200';
      case SecuritySeverity.HIGH:
        return 'text-orange-800 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-200';
      case SecuritySeverity.MEDIUM:
        return 'text-yellow-800 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-200';
      case SecuritySeverity.LOW:
        return 'text-blue-800 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-200';
      default:
        return 'text-gray-800 bg-gray-100 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  /**
   * Format timestamp
   */
  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    
    return date.toLocaleDateString();
  };

  /**
   * Render overview tab
   */
  const renderOverview = () => {
    if (!metrics) return null;
    
    return (
      <div className="space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total Events</p>
                  <p className="text-2xl font-bold">{metrics.totalEvents}</p>
                </div>
                <ChartBarIcon className="w-8 h-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Failed Logins</p>
                  <p className="text-2xl font-bold">{metrics.failedLogins}</p>
                </div>
                <LockClosedIcon className="w-8 h-8 text-red-600" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Suspicious Activities</p>
                  <p className="text-2xl font-bold">{metrics.suspiciousActivities}</p>
                </div>
                <ExclamationTriangleIcon className="w-8 h-8 text-yellow-600" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Avg Risk Score</p>
                  <p className="text-2xl font-bold">
                    {(metrics.averageRiskScore * 100).toFixed(1)}%
                  </p>
                </div>
                <ShieldCheckIcon className="w-8 h-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Event Trend */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold">Event Trend</h3>
            </CardHeader>
            <CardContent>
              {eventTrendData && (
                <Line
                  data={eventTrendData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                    },
                    scales: {
                      y: { beginAtZero: true },
                    },
                  }}
                  height={200}
                />
              )}
            </CardContent>
          </Card>

          {/* Severity Distribution */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold">Severity Distribution</h3>
            </CardHeader>
            <CardContent>
              {severityDistribution && (
                <Doughnut
                  data={severityDistribution}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { position: 'right' },
                    },
                  }}
                  height={200}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent High-Risk Events */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold">Recent High-Risk Events</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentEvents.slice(0, 5).map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
                >
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "px-2 py-1 text-xs font-medium rounded",
                      getSeverityColor(event.severity)
                    )}>
                      {event.severity}
                    </span>
                    <div>
                      <p className="font-medium">{event.eventType.replace(/_/g, ' ')}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {event.userId || event.ipAddress || 'Unknown'}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-500">
                    {formatTimestamp(event.timestamp)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  /**
   * Render threats tab
   */
  const renderThreats = () => {
    return (
      <div className="space-y-6">
        {/* User Threat Assessment */}
        {userThreatAssessment && (
          <Card>
            <CardHeader>
              <h3 className="font-semibold">Your Security Status</h3>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Risk Level</p>
                  <p className={cn(
                    "text-2xl font-bold capitalize",
                    userThreatAssessment.riskLevel === 'critical' ? 'text-red-600' :
                    userThreatAssessment.riskLevel === 'high' ? 'text-orange-600' :
                    userThreatAssessment.riskLevel === 'medium' ? 'text-yellow-600' :
                    'text-green-600'
                  )}>
                    {userThreatAssessment.riskLevel}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Risk Score</p>
                  <p className="text-2xl font-bold">
                    {(userThreatAssessment.riskScore * 100).toFixed(0)}%
                  </p>
                </div>
              </div>
              
              {userThreatAssessment.recentThreats.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Recent Threats:</p>
                  {userThreatAssessment.recentThreats.map((threat: string, index: number) => (
                    <div key={index} className="flex items-center gap-2 text-sm">
                      <ExclamationTriangleIcon className="w-4 h-4 text-yellow-600" />
                      <span>{threat}</span>
                    </div>
                  ))}
                </div>
              )}
              
              {userThreatAssessment.recommendations.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium">Recommendations:</p>
                  {userThreatAssessment.recommendations.map((rec: string, index: number) => (
                    <div key={index} className="flex items-center gap-2 text-sm">
                      <ShieldCheckIcon className="w-4 h-4 text-blue-600" />
                      <span>{rec}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Top Threats Chart */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold">Top Security Threats</h3>
          </CardHeader>
          <CardContent>
            {topThreatsData && (
              <Bar
                data={topThreatsData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                  },
                  scales: {
                    y: { beginAtZero: true },
                  },
                }}
                height={250}
              />
            )}
          </CardContent>
        </Card>

        {/* Detected Anomalies */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold">Detected Anomalies</h3>
          </CardHeader>
          <CardContent>
            {threats.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No anomalies detected</p>
            ) : (
              <div className="space-y-3">
                {threats.map((threat, index) => (
                  <div
                    key={index}
                    className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">Anomaly Detected</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          Score: {(threat.anomalyScore * 100).toFixed(0)}% | 
                          Confidence: {(threat.confidence * 100).toFixed(0)}%
                        </p>
                        <div className="mt-2 space-y-1">
                          {threat.anomalyTypes.map((type, i) => (
                            <span
                              key={i}
                              className="inline-block px-2 py-1 text-xs bg-red-100 dark:bg-red-800 rounded mr-2"
                            >
                              {type.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      </div>
                      <BellAlertIcon className="w-6 h-6 text-red-600" />
                    </div>
                    {threat.suggestedActions.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-700">
                        <p className="text-sm font-medium">Suggested Actions:</p>
                        <ul className="text-sm text-gray-600 dark:text-gray-400 mt-1 list-disc list-inside">
                          {threat.suggestedActions.map((action, i) => (
                            <li key={i}>{action.replace(/_/g, ' ')}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  /**
   * Render audit tab
   */
  const renderAudit = () => {
    return (
      <div className="space-y-6">
        {/* Audit Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total Audit Events</p>
                  <p className="text-2xl font-bold">{auditEvents.length}</p>
                </div>
                <DocumentTextIcon className="w-8 h-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Failed Actions</p>
                  <p className="text-2xl font-bold">
                    {auditEvents.filter(e => e.result === 'failure').length}
                  </p>
                </div>
                <ExclamationTriangleIcon className="w-8 h-8 text-red-600" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">High Risk Events</p>
                  <p className="text-2xl font-bold">
                    {auditEvents.filter(e => 
                      e.security.riskLevel === 'high' || 
                      e.security.riskLevel === 'critical'
                    ).length}
                  </p>
                </div>
                <ShieldCheckIcon className="w-8 h-8 text-yellow-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Audit Trail */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Audit Trail</h3>
              <Button onClick={exportSecurityReport} variant="outline" size="sm">
                Export Report
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Time</th>
                    <th className="text-left p-2">Category</th>
                    <th className="text-left p-2">Action</th>
                    <th className="text-left p-2">Actor</th>
                    <th className="text-left p-2">Result</th>
                    <th className="text-left p-2">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {auditEvents.slice(0, 20).map((event) => (
                    <tr key={event.id} className="border-b">
                      <td className="p-2">{formatTimestamp(event.timestamp)}</td>
                      <td className="p-2">
                        <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">
                          {event.category.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="p-2">{event.action.replace(/_/g, ' ')}</td>
                      <td className="p-2">{event.actor.id}</td>
                      <td className="p-2">
                        <span className={cn(
                          "text-xs px-2 py-1 rounded",
                          event.result === 'success' 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200'
                        )}>
                          {event.result}
                        </span>
                      </td>
                      <td className="p-2">
                        <span className={cn(
                          "text-xs px-2 py-1 rounded",
                          event.security.riskLevel === 'critical' ? 'bg-red-100 text-red-800' :
                          event.security.riskLevel === 'high' ? 'bg-orange-100 text-orange-800' :
                          event.security.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        )}>
                          {event.security.riskLevel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  /**
   * Render analytics tab
   */
  const renderAnalytics = () => {
    if (!metrics) return null;
    
    return (
      <div className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Success Rate</p>
                  <p className="text-2xl font-bold">
                    {((metrics.successfulLogins / (metrics.successfulLogins + metrics.failedLogins)) * 100).toFixed(1)}%
                  </p>
                </div>
                <ArrowTrendingUpIcon className="w-8 h-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Blocked Requests</p>
                  <p className="text-2xl font-bold">{metrics.blockedRequests}</p>
                </div>
                <LockClosedIcon className="w-8 h-8 text-red-600" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Unique Users</p>
                  <p className="text-2xl font-bold">{metrics.uniqueUsers}</p>
                </div>
                <UserGroupIcon className="w-8 h-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Unique IPs</p>
                  <p className="text-2xl font-bold">{metrics.uniqueIPs}</p>
                </div>
                <GlobeAltIcon className="w-8 h-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Metrics */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold">Event Type Distribution</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(metrics.eventsByType)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-sm">{type.replace(/_/g, ' ')}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${(count / metrics.totalEvents) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium w-12 text-right">{count}</span>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        {/* Time Range Analysis */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold">Time Range Analysis</h3>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-600 dark:text-gray-400">Period Start</p>
                <p className="font-medium">{new Date(metrics.timeRange.start).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-gray-600 dark:text-gray-400">Period End</p>
                <p className="font-medium">{new Date(metrics.timeRange.end).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-gray-600 dark:text-gray-400">Duration</p>
                <p className="font-medium">
                  {Math.round((metrics.timeRange.end - metrics.timeRange.start) / (1000 * 60 * 60))} hours
                </p>
              </div>
              <div>
                <p className="text-gray-600 dark:text-gray-400">Events/Hour</p>
                <p className="font-medium">
                  {Math.round(metrics.totalEvents / ((metrics.timeRange.end - metrics.timeRange.start) / (1000 * 60 * 60)))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Tab configuration
  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: ChartBarIcon },
    { id: 'threats' as TabType, label: 'Threats', icon: ExclamationTriangleIcon },
    { id: 'audit' as TabType, label: 'Audit Trail', icon: DocumentTextIcon },
    { id: 'analytics' as TabType, label: 'Analytics', icon: ArrowTrendingUpIcon },
  ];

  return (
    <div className={cn("min-h-screen bg-gray-50 dark:bg-gray-900", className)}>
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                Security Dashboard
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Monitor security events, threats, and system health
              </p>
            </div>
            
            {/* Controls */}
            <div className="flex items-center gap-4">
              {/* Time Range Selector */}
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as TimeRange)}
                className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700"
              >
                <option value="1h">Last Hour</option>
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
              </select>
              
              {/* Auto Refresh Toggle */}
              <Button
                onClick={() => setAutoRefresh(!autoRefresh)}
                variant={autoRefresh ? 'default' : 'outline'}
                size="sm"
              >
                <ArrowPathIcon className={cn("w-4 h-4", autoRefresh && "animate-spin")} />
                {autoRefresh ? 'Auto' : 'Manual'}
              </Button>
              
              {/* Refresh Button */}
              <Button
                onClick={() => {
                  loadMetrics();
                  loadRecentEvents();
                  loadAuditTrail();
                }}
                variant="outline"
                size="sm"
              >
                <ArrowPathIcon className="w-4 h-4" />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 mb-8 bg-gray-200 dark:bg-gray-800 rounded-lg p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
          >
            {isLoading ? (
              <div className="flex items-center justify-center py-32">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600 dark:text-gray-400">Loading security data...</p>
                </div>
              </div>
            ) : (
              <>
                {activeTab === 'overview' && renderOverview()}
                {activeTab === 'threats' && renderThreats()}
                {activeTab === 'audit' && renderAudit()}
                {activeTab === 'analytics' && renderAnalytics()}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};