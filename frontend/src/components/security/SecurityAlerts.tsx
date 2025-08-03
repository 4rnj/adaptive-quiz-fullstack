/**
 * Real-time Security Alerts and Notifications
 * Comprehensive security alerting system with multiple notification channels
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ExclamationTriangleIcon,
  ShieldExclamationIcon,
  XMarkIcon,
  BellIcon,
  CogIcon,
  CheckCircleIcon,
  ClockIcon,
  ArrowTopRightOnSquareIcon
} from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { 
  SecurityEventType, 
  SecuritySeverity, 
  SecurityLogEntry,
  securityLogger 
} from '@/utils/securityLogging';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/utils/cn';
import { toast } from 'react-hot-toast';

// Alert types and priorities
export enum AlertType {
  CRITICAL_THREAT = 'CRITICAL_THREAT',
  AUTHENTICATION_FAILURE = 'AUTHENTICATION_FAILURE',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  DATA_BREACH = 'DATA_BREACH',
  SYSTEM_INTRUSION = 'SYSTEM_INTRUSION',
  POLICY_VIOLATION = 'POLICY_VIOLATION',
  ANOMALY_DETECTED = 'ANOMALY_DETECTED',
  BRUTE_FORCE = 'BRUTE_FORCE',
  SESSION_HIJACK = 'SESSION_HIJACK',
  PRIVILEGE_ESCALATION = 'PRIVILEGE_ESCALATION',
}

// Alert priority levels
export enum AlertPriority {
  P1 = 'P1', // Critical - immediate response required
  P2 = 'P2', // High - response within 30 minutes
  P3 = 'P3', // Medium - response within 2 hours
  P4 = 'P4', // Low - response within 24 hours
}

// Security alert structure
export interface SecurityAlert {
  id: string;
  timestamp: number;
  type: AlertType;
  priority: AlertPriority;
  severity: SecuritySeverity;
  title: string;
  description: string;
  details: {
    source: string;
    affectedUser?: string;
    ipAddress?: string;
    userAgent?: string;
    location?: string;
    resource?: string;
    action?: string;
    riskScore?: number;
  };
  status: 'active' | 'acknowledged' | 'resolved' | 'false_positive';
  acknowledgedBy?: string;
  acknowledgedAt?: number;
  resolvedAt?: number;
  actions: {
    suggested: string[];
    taken: string[];
  };
  relatedEvents: string[]; // Event IDs
  escalated: boolean;
  escalatedTo?: string;
  expiresAt?: number;
}

// Alert rules and configurations
export interface AlertRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  eventTypes: SecurityEventType[];
  conditions: {
    severity?: SecuritySeverity[];
    threshold?: number;
    timeWindow?: number; // milliseconds
    riskScoreMin?: number;
  };
  actions: {
    notify: boolean;
    escalate: boolean;
    block: boolean;
    logDetails: boolean;
  };
  priority: AlertPriority;
  cooldownPeriod: number; // milliseconds
}

// Notification preferences
export interface NotificationPreferences {
  enabled: boolean;
  channels: {
    browser: boolean;
    email: boolean;
    sms: boolean;
    slack: boolean;
  };
  priorityFilter: AlertPriority[];
  quietHours: {
    enabled: boolean;
    start: string; // HH:MM
    end: string; // HH:MM
  };
  aggregation: {
    enabled: boolean;
    window: number; // minutes
    maxAlerts: number;
  };
}

/**
 * Security Alerts Service
 */
class SecurityAlertsService {
  private static instance: SecurityAlertsService;
  private alerts: Map<string, SecurityAlert> = new Map();
  private rules: Map<string, AlertRule> = new Map();
  private preferences: NotificationPreferences;
  private alertListeners: Set<(alert: SecurityAlert) => void> = new Set();
  private cooldowns: Map<string, number> = new Map();

  private constructor() {
    this.preferences = this.getDefaultPreferences();
    this.initializeDefaultRules();
    this.startAlertMonitoring();
  }

  public static getInstance(): SecurityAlertsService {
    if (!SecurityAlertsService.instance) {
      SecurityAlertsService.instance = new SecurityAlertsService();
    }
    return SecurityAlertsService.instance;
  }

  /**
   * Create a security alert
   */
  public async createAlert(
    type: AlertType,
    details: Partial<SecurityAlert['details']>,
    relatedEvents: string[] = []
  ): Promise<SecurityAlert> {
    const alertConfig = this.getAlertConfig(type);
    
    const alert: SecurityAlert = {
      id: this.generateAlertId(),
      timestamp: Date.now(),
      type,
      priority: alertConfig.priority,
      severity: alertConfig.severity,
      title: alertConfig.title,
      description: alertConfig.description,
      details: {
        source: 'security_monitoring',
        ...details,
      },
      status: 'active',
      actions: {
        suggested: alertConfig.suggestedActions,
        taken: [],
      },
      relatedEvents,
      escalated: false,
      expiresAt: alertConfig.expiresIn ? Date.now() + alertConfig.expiresIn : undefined,
    };

    // Store alert
    this.alerts.set(alert.id, alert);

    // Check cooldown
    if (this.isInCooldown(type)) {
      return alert;
    }

    // Apply cooldown
    this.cooldowns.set(type, Date.now() + this.getCooldownPeriod(type));

    // Process alert
    await this.processAlert(alert);

    return alert;
  }

  /**
   * Process alert through the notification pipeline
   */
  private async processAlert(alert: SecurityAlert): Promise<void> {
    // Check if notifications are enabled
    if (!this.preferences.enabled) {
      return;
    }

    // Check priority filter
    if (!this.preferences.priorityFilter.includes(alert.priority)) {
      return;
    }

    // Check quiet hours
    if (this.isQuietHours()) {
      // Only allow P1 alerts during quiet hours
      if (alert.priority !== AlertPriority.P1) {
        return;
      }
    }

    // Send notifications
    await this.sendNotifications(alert);

    // Notify listeners
    this.alertListeners.forEach(listener => {
      try {
        listener(alert);
      } catch (error) {
        console.error('Alert listener error:', error);
      }
    });

    // Auto-escalate P1 alerts if not acknowledged within 5 minutes
    if (alert.priority === AlertPriority.P1) {
      setTimeout(() => {
        const currentAlert = this.alerts.get(alert.id);
        if (currentAlert && currentAlert.status === 'active') {
          this.escalateAlert(alert.id, 'Auto-escalation due to no acknowledgment');
        }
      }, 5 * 60 * 1000);
    }
  }

  /**
   * Send notifications through enabled channels
   */
  private async sendNotifications(alert: SecurityAlert): Promise<void> {
    const { channels } = this.preferences;

    // Browser notification
    if (channels.browser && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(`Security Alert: ${alert.title}`, {
          body: alert.description,
          icon: '/security-icon.png',
          tag: alert.id,
          requireInteraction: alert.priority === AlertPriority.P1,
        });
      } else if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }

    // Toast notification
    const toastOptions = {
      duration: alert.priority === AlertPriority.P1 ? 0 : 10000, // P1 alerts don't auto-dismiss
      id: alert.id,
    };

    switch (alert.severity) {
      case SecuritySeverity.CRITICAL:
        toast.error(alert.title, toastOptions);
        break;
      case SecuritySeverity.HIGH:
        toast.error(alert.title, toastOptions);
        break;
      case SecuritySeverity.MEDIUM:
        toast(alert.title, { ...toastOptions, icon: '⚠️' });
        break;
      default:
        toast(alert.title, toastOptions);
    }

    // Email notification (would integrate with email service)
    if (channels.email) {
      await this.sendEmailAlert(alert);
    }

    // SMS notification (would integrate with SMS service)
    if (channels.sms && alert.priority === AlertPriority.P1) {
      await this.sendSMSAlert(alert);
    }

    // Slack notification (would integrate with Slack API)
    if (channels.slack) {
      await this.sendSlackAlert(alert);
    }
  }

  /**
   * Acknowledge an alert
   */
  public acknowledgeAlert(alertId: string, acknowledgedBy: string): void {
    const alert = this.alerts.get(alertId);
    if (alert && alert.status === 'active') {
      alert.status = 'acknowledged';
      alert.acknowledgedBy = acknowledgedBy;
      alert.acknowledgedAt = Date.now();
      
      // Dismiss toast notification
      toast.dismiss(alertId);
    }
  }

  /**
   * Resolve an alert
   */
  public resolveAlert(alertId: string, resolution: string): void {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.status = 'resolved';
      alert.resolvedAt = Date.now();
      alert.actions.taken.push(`Resolved: ${resolution}`);
      
      // Dismiss toast notification
      toast.dismiss(alertId);
    }
  }

  /**
   * Mark alert as false positive
   */
  public markFalsePositive(alertId: string, reason: string): void {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.status = 'false_positive';
      alert.actions.taken.push(`False positive: ${reason}`);
      
      // Dismiss toast notification
      toast.dismiss(alertId);
    }
  }

  /**
   * Escalate an alert
   */
  public escalateAlert(alertId: string, reason: string): void {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.escalated = true;
      alert.escalatedTo = 'security_team';
      alert.actions.taken.push(`Escalated: ${reason}`);
      
      // Send escalation notification
      toast.error(`Alert ${alertId} escalated to security team`, {
        duration: 0,
        id: `escalation_${alertId}`,
      });
    }
  }

  /**
   * Get active alerts
   */
  public getActiveAlerts(): SecurityAlert[] {
    return Array.from(this.alerts.values())
      .filter(alert => alert.status === 'active')
      .sort((a, b) => {
        // Sort by priority first, then timestamp
        const priorityOrder = { P1: 0, P2: 1, P3: 2, P4: 3 };
        const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder];
        const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder];
        
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }
        
        return b.timestamp - a.timestamp;
      });
  }

  /**
   * Get alert history
   */
  public getAlertHistory(limit: number = 100): SecurityAlert[] {
    return Array.from(this.alerts.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Subscribe to alert updates
   */
  public subscribeToAlerts(listener: (alert: SecurityAlert) => void): () => void {
    this.alertListeners.add(listener);
    return () => this.alertListeners.delete(listener);
  }

  /**
   * Update notification preferences
   */
  public updatePreferences(preferences: Partial<NotificationPreferences>): void {
    this.preferences = { ...this.preferences, ...preferences };
    // Save to storage
    localStorage.setItem('security_alert_preferences', JSON.stringify(this.preferences));
  }

  /**
   * Get notification preferences
   */
  public getPreferences(): NotificationPreferences {
    return { ...this.preferences };
  }

  /**
   * Private helper methods
   */

  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getAlertConfig(type: AlertType) {
    const configs: Record<AlertType, {
      priority: AlertPriority;
      severity: SecuritySeverity;
      title: string;
      description: string;
      suggestedActions: string[];
      expiresIn?: number;
    }> = {
      [AlertType.CRITICAL_THREAT]: {
        priority: AlertPriority.P1,
        severity: SecuritySeverity.CRITICAL,
        title: 'Critical Security Threat Detected',
        description: 'A critical security threat has been identified that requires immediate attention.',
        suggestedActions: ['Isolate affected systems', 'Contact security team', 'Review access logs'],
      },
      [AlertType.AUTHENTICATION_FAILURE]: {
        priority: AlertPriority.P3,
        severity: SecuritySeverity.MEDIUM,
        title: 'Authentication Failure',
        description: 'Multiple failed authentication attempts detected.',
        suggestedActions: ['Check account security', 'Review recent login attempts', 'Consider password reset'],
      },
      [AlertType.SUSPICIOUS_ACTIVITY]: {
        priority: AlertPriority.P2,
        severity: SecuritySeverity.HIGH,
        title: 'Suspicious Activity Detected',
        description: 'Unusual activity patterns have been detected in your account.',
        suggestedActions: ['Review recent activity', 'Check account settings', 'Enable 2FA'],
      },
      [AlertType.DATA_BREACH]: {
        priority: AlertPriority.P1,
        severity: SecuritySeverity.CRITICAL,
        title: 'Potential Data Breach',
        description: 'Unauthorized access to sensitive data has been detected.',
        suggestedActions: ['Immediately secure affected systems', 'Notify data protection officer', 'Prepare breach response'],
      },
      [AlertType.SYSTEM_INTRUSION]: {
        priority: AlertPriority.P1,
        severity: SecuritySeverity.CRITICAL,
        title: 'System Intrusion Detected',
        description: 'Unauthorized system access has been detected.',
        suggestedActions: ['Isolate affected systems', 'Preserve evidence', 'Contact incident response team'],
      },
      [AlertType.POLICY_VIOLATION]: {
        priority: AlertPriority.P3,
        severity: SecuritySeverity.MEDIUM,
        title: 'Security Policy Violation',
        description: 'A security policy violation has been detected.',
        suggestedActions: ['Review policy compliance', 'Provide user training', 'Document incident'],
      },
      [AlertType.ANOMALY_DETECTED]: {
        priority: AlertPriority.P2,
        severity: SecuritySeverity.HIGH,
        title: 'Security Anomaly Detected',
        description: 'Unusual behavior patterns have been identified.',
        suggestedActions: ['Investigate behavior patterns', 'Review user activity', 'Monitor closely'],
      },
      [AlertType.BRUTE_FORCE]: {
        priority: AlertPriority.P2,
        severity: SecuritySeverity.HIGH,
        title: 'Brute Force Attack Detected',
        description: 'Multiple failed login attempts suggest a brute force attack.',
        suggestedActions: ['Block suspicious IP', 'Enable account lockout', 'Review security logs'],
      },
      [AlertType.SESSION_HIJACK]: {
        priority: AlertPriority.P1,
        severity: SecuritySeverity.CRITICAL,
        title: 'Session Hijacking Attempt',
        description: 'A session hijacking attempt has been detected.',
        suggestedActions: ['Terminate all sessions', 'Force re-authentication', 'Review session security'],
      },
      [AlertType.PRIVILEGE_ESCALATION]: {
        priority: AlertPriority.P1,
        severity: SecuritySeverity.CRITICAL,
        title: 'Privilege Escalation Attempt',
        description: 'An attempt to escalate privileges has been detected.',
        suggestedActions: ['Review permissions', 'Audit user roles', 'Investigate access patterns'],
      },
    };

    return configs[type];
  }

  private isInCooldown(type: AlertType): boolean {
    const lastAlert = this.cooldowns.get(type);
    return lastAlert ? Date.now() < lastAlert : false;
  }

  private getCooldownPeriod(type: AlertType): number {
    const cooldowns: Partial<Record<AlertType, number>> = {
      [AlertType.AUTHENTICATION_FAILURE]: 5 * 60 * 1000, // 5 minutes
      [AlertType.SUSPICIOUS_ACTIVITY]: 15 * 60 * 1000, // 15 minutes
      [AlertType.BRUTE_FORCE]: 10 * 60 * 1000, // 10 minutes
    };
    
    return cooldowns[type] || 60 * 1000; // Default 1 minute
  }

  private isQuietHours(): boolean {
    if (!this.preferences.quietHours.enabled) return false;
    
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const { start, end } = this.preferences.quietHours;
    
    if (start <= end) {
      return currentTime >= start && currentTime <= end;
    } else {
      // Spans midnight
      return currentTime >= start || currentTime <= end;
    }
  }

  private async sendEmailAlert(alert: SecurityAlert): Promise<void> {
    // In production, integrate with email service
    console.log('Email alert:', alert);
  }

  private async sendSMSAlert(alert: SecurityAlert): Promise<void> {
    // In production, integrate with SMS service
    console.log('SMS alert:', alert);
  }

  private async sendSlackAlert(alert: SecurityAlert): Promise<void> {
    // In production, integrate with Slack API
    console.log('Slack alert:', alert);
  }

  private getDefaultPreferences(): NotificationPreferences {
    const stored = localStorage.getItem('security_alert_preferences');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (error) {
        console.error('Failed to parse stored preferences:', error);
      }
    }

    return {
      enabled: true,
      channels: {
        browser: true,
        email: false,
        sms: false,
        slack: false,
      },
      priorityFilter: [AlertPriority.P1, AlertPriority.P2, AlertPriority.P3],
      quietHours: {
        enabled: false,
        start: '22:00',
        end: '08:00',
      },
      aggregation: {
        enabled: true,
        window: 5,
        maxAlerts: 3,
      },
    };
  }

  private initializeDefaultRules(): void {
    // Initialize with default alert rules
    // In production, these would be loaded from configuration
  }

  private startAlertMonitoring(): void {
    // Monitor security events and create alerts
    const checkForAlerts = async () => {
      try {
        const recentEvents = securityLogger.getRecentEvents(10, {
          severity: [SecuritySeverity.HIGH, SecuritySeverity.CRITICAL],
        });

        for (const event of recentEvents) {
          await this.processSecurityEvent(event);
        }
      } catch (error) {
        console.error('Alert monitoring error:', error);
      }
    };

    // Check every 30 seconds
    setInterval(checkForAlerts, 30000);

    // Listen for security events
    window.addEventListener('securityEvent', async (event: CustomEvent) => {
      const { event: eventType, data } = event.detail;
      await this.handleSecurityEvent(eventType, data);
    });
  }

  private async processSecurityEvent(event: SecurityLogEntry): Promise<void> {
    // Map security events to alerts
    const alertMappings: Partial<Record<SecurityEventType, AlertType>> = {
      [SecurityEventType.BRUTE_FORCE_DETECTED]: AlertType.BRUTE_FORCE,
      [SecurityEventType.SUSPICIOUS_ACTIVITY]: AlertType.SUSPICIOUS_ACTIVITY,
      [SecurityEventType.XSS_ATTEMPT]: AlertType.CRITICAL_THREAT,
      [SecurityEventType.INJECTION_ATTEMPT]: AlertType.CRITICAL_THREAT,
      [SecurityEventType.SESSION_EXPIRED]: AlertType.SESSION_HIJACK,
    };

    const alertType = alertMappings[event.eventType];
    if (alertType) {
      await this.createAlert(alertType, {
        source: 'security_event',
        affectedUser: event.userId,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        riskScore: event.riskScore,
      }, [event.id]);
    }
  }

  private async handleSecurityEvent(eventType: string, data: any): Promise<void> {
    // Handle real-time security events
    switch (eventType) {
      case 'critical':
        await this.createAlert(AlertType.CRITICAL_THREAT, data);
        break;
      case 'anomaly':
        await this.createAlert(AlertType.ANOMALY_DETECTED, data);
        break;
    }
  }
}

// Global instance
export const securityAlerts = SecurityAlertsService.getInstance();

/**
 * Security Alerts Component
 */
export const SecurityAlerts: React.FC<{ className?: string }> = ({ className }) => {
  const { user } = useAuthStore();
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences>(securityAlerts.getPreferences());
  const [showSettings, setShowSettings] = useState(false);

  // Load alerts
  useEffect(() => {
    setAlerts(securityAlerts.getActiveAlerts());

    // Subscribe to new alerts
    const unsubscribe = securityAlerts.subscribeToAlerts((alert) => {
      setAlerts(current => [alert, ...current.filter(a => a.id !== alert.id)]);
    });

    return unsubscribe;
  }, []);

  // Handle alert actions
  const handleAcknowledge = (alertId: string) => {
    securityAlerts.acknowledgeAlert(alertId, user?.email || 'user');
    setAlerts(current => current.filter(alert => alert.id !== alertId));
  };

  const handleResolve = (alertId: string) => {
    securityAlerts.resolveAlert(alertId, 'Resolved by user');
    setAlerts(current => current.filter(alert => alert.id !== alertId));
  };

  const handleFalsePositive = (alertId: string) => {
    securityAlerts.markFalsePositive(alertId, 'Marked as false positive by user');
    setAlerts(current => current.filter(alert => alert.id !== alertId));
  };

  const handleEscalate = (alertId: string) => {
    securityAlerts.escalateAlert(alertId, 'Escalated by user');
  };

  // Update preferences
  const updatePreferences = (updates: Partial<NotificationPreferences>) => {
    const newPreferences = { ...preferences, ...updates };
    setPreferences(newPreferences);
    securityAlerts.updatePreferences(newPreferences);
  };

  // Get priority color
  const getPriorityColor = (priority: AlertPriority) => {
    switch (priority) {
      case AlertPriority.P1:
        return 'border-red-500 bg-red-50 dark:bg-red-900/20';
      case AlertPriority.P2:
        return 'border-orange-500 bg-orange-50 dark:bg-orange-900/20';
      case AlertPriority.P3:
        return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20';
      default:
        return 'border-blue-500 bg-blue-50 dark:bg-blue-900/20';
    }
  };

  if (alerts.length === 0 && !showSettings) {
    return null;
  }

  return (
    <div className={cn("fixed top-4 right-4 z-50 max-w-sm space-y-2", className)}>
      {/* Settings Button */}
      <div className="flex justify-end">
        <Button
          onClick={() => setShowSettings(!showSettings)}
          variant="outline"
          size="sm"
          className="bg-white dark:bg-gray-800 shadow-lg"
        >
          <CogIcon className="w-4 h-4" />
        </Button>
      </div>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
          >
            <Card className="shadow-lg">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Alert Settings</h3>
                  <Button
                    onClick={() => setShowSettings(false)}
                    variant="ghost"
                    size="sm"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Enable Notifications */}
                <div className="flex items-center justify-between">
                  <span className="text-sm">Enable Notifications</span>
                  <Switch
                    checked={preferences.enabled}
                    onCheckedChange={(enabled) => updatePreferences({ enabled })}
                  />
                </div>

                {/* Notification Channels */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Channels</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs">Browser</span>
                      <Switch
                        checked={preferences.channels.browser}
                        onCheckedChange={(browser) => 
                          updatePreferences({ 
                            channels: { ...preferences.channels, browser } 
                          })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs">Email</span>
                      <Switch
                        checked={preferences.channels.email}
                        onCheckedChange={(email) => 
                          updatePreferences({ 
                            channels: { ...preferences.channels, email } 
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* Priority Filter */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Priority Levels</p>
                  {Object.values(AlertPriority).map(priority => (
                    <div key={priority} className="flex items-center justify-between">
                      <span className="text-xs">{priority}</span>
                      <Switch
                        checked={preferences.priorityFilter.includes(priority)}
                        onCheckedChange={(checked) => {
                          const newFilter = checked
                            ? [...preferences.priorityFilter, priority]
                            : preferences.priorityFilter.filter(p => p !== priority);
                          updatePreferences({ priorityFilter: newFilter });
                        }}
                      />
                    </div>
                  ))}
                </div>

                {/* Quiet Hours */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Quiet Hours</span>
                    <Switch
                      checked={preferences.quietHours.enabled}
                      onCheckedChange={(enabled) => 
                        updatePreferences({ 
                          quietHours: { ...preferences.quietHours, enabled } 
                        })
                      }
                    />
                  </div>
                  {preferences.quietHours.enabled && (
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="time"
                        value={preferences.quietHours.start}
                        onChange={(e) => 
                          updatePreferences({ 
                            quietHours: { 
                              ...preferences.quietHours, 
                              start: e.target.value 
                            } 
                          })
                        }
                        className="text-xs px-2 py-1 border rounded"
                      />
                      <input
                        type="time"
                        value={preferences.quietHours.end}
                        onChange={(e) => 
                          updatePreferences({ 
                            quietHours: { 
                              ...preferences.quietHours, 
                              end: e.target.value 
                            } 
                          })
                        }
                        className="text-xs px-2 py-1 border rounded"
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active Alerts */}
      <AnimatePresence>
        {alerts.map((alert) => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, scale: 0.95, x: 100 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.95, x: 100 }}
            className={cn(
              "border-l-4 rounded-lg shadow-lg bg-white dark:bg-gray-800",
              getPriorityColor(alert.priority)
            )}
          >
            <div className="p-4">
              {/* Header */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {alert.priority === AlertPriority.P1 ? (
                    <ShieldExclamationIcon className="w-5 h-5 text-red-600" />
                  ) : (
                    <ExclamationTriangleIcon className="w-5 h-5 text-orange-600" />
                  )}
                  <span className={cn(
                    "text-xs px-2 py-1 rounded font-medium",
                    alert.priority === AlertPriority.P1 ? 'bg-red-100 text-red-800' :
                    alert.priority === AlertPriority.P2 ? 'bg-orange-100 text-orange-800' :
                    'bg-yellow-100 text-yellow-800'
                  )}>
                    {alert.priority}
                  </span>
                </div>
                <Button
                  onClick={() => handleAcknowledge(alert.id)}
                  variant="ghost"
                  size="sm"
                >
                  <XMarkIcon className="w-4 h-4" />
                </Button>
              </div>

              {/* Content */}
              <div className="mb-3">
                <h4 className="font-semibold text-sm mb-1">{alert.title}</h4>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                  {alert.description}
                </p>
                
                {/* Details */}
                {alert.details.affectedUser && (
                  <p className="text-xs text-gray-500">
                    User: {alert.details.affectedUser}
                  </p>
                )}
                {alert.details.ipAddress && (
                  <p className="text-xs text-gray-500">
                    IP: {alert.details.ipAddress}
                  </p>
                )}
                
                {/* Timestamp */}
                <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                  <ClockIcon className="w-3 h-3" />
                  {new Date(alert.timestamp).toLocaleTimeString()}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-1">
                <Button
                  onClick={() => handleAcknowledge(alert.id)}
                  size="sm"
                  variant="outline"
                  className="flex-1 text-xs"
                >
                  <CheckCircleIcon className="w-3 h-3 mr-1" />
                  Acknowledge
                </Button>
                <Button
                  onClick={() => handleResolve(alert.id)}
                  size="sm"
                  variant="outline"
                  className="flex-1 text-xs"
                >
                  Resolve
                </Button>
                {alert.priority === AlertPriority.P1 && (
                  <Button
                    onClick={() => handleEscalate(alert.id)}
                    size="sm"
                    variant="outline"
                    className="text-xs"
                  >
                    <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};