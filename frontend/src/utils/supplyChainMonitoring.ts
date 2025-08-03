/**
 * Supply Chain Security Monitoring System
 * Comprehensive monitoring and analysis of software supply chain risks
 */

import { securityLogger, SecurityEventType, SecuritySeverity } from './securityLogging';
import { auditTrail, AuditCategory } from './auditTrail';
import { dependencyAudit, PackageInfo, Vulnerability, VulnerabilitySeverity } from './dependencyAudit';
import { vulnerabilityPatching } from './vulnerabilityPatching';
import { securityAlerts, AlertType } from '../components/security/SecurityAlerts';

// Supply chain risk categories
export enum SupplyChainRiskCategory {
  DEPENDENCY_RISK = 'DEPENDENCY_RISK',
  MAINTAINER_RISK = 'MAINTAINER_RISK',
  INFRASTRUCTURE_RISK = 'INFRASTRUCTURE_RISK',
  TYPOSQUATTING = 'TYPOSQUATTING',
  MALICIOUS_PACKAGE = 'MALICIOUS_PACKAGE',
  ABANDONED_PROJECT = 'ABANDONED_PROJECT',
  WEAK_SIGNATURES = 'WEAK_SIGNATURES',
  SUPPLY_CHAIN_ATTACK = 'SUPPLY_CHAIN_ATTACK',
}

// Risk severity levels
export enum SupplyChainRiskLevel {
  MINIMAL = 'MINIMAL',
  LOW = 'LOW',
  MODERATE = 'MODERATE',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
  CATASTROPHIC = 'CATASTROPHIC',
}

// Monitoring event types
export enum SupplyChainEventType {
  NEW_DEPENDENCY_ADDED = 'NEW_DEPENDENCY_ADDED',
  DEPENDENCY_UPDATED = 'DEPENDENCY_UPDATED',
  VULNERABILITY_DISCOVERED = 'VULNERABILITY_DISCOVERED',
  SUSPICIOUS_PACKAGE = 'SUSPICIOUS_PACKAGE',
  MAINTAINER_CHANGE = 'MAINTAINER_CHANGE',
  PACKAGE_DEPRECATED = 'PACKAGE_DEPRECATED',
  UNUSUAL_DOWNLOAD_PATTERN = 'UNUSUAL_DOWNLOAD_PATTERN',
  SIGNATURE_VERIFICATION_FAILED = 'SIGNATURE_VERIFICATION_FAILED',
  SUPPLY_CHAIN_INCIDENT = 'SUPPLY_CHAIN_INCIDENT',
}

// Package trust indicators
export interface PackageTrustIndicators {
  downloadCount: number;
  weeklyDownloads: number;
  openIssues: number;
  closedIssues: number;
  lastUpdate: number;
  maintainerCount: number;
  hasTests: boolean;
  hasDocumentation: boolean;
  hasTypeDefinitions: boolean;
  hasValidSignature: boolean;
  githubStars: number;
  githubForks: number;
  npmUserCount: number;
  trustScore: number; // 0-100
}

// Maintainer information
export interface MaintainerInfo {
  username: string;
  email?: string;
  npmProfile?: string;
  githubProfile?: string;
  joinedDate?: number;
  packageCount: number;
  totalDownloads: number;
  verifiedEmail: boolean;
  twoFactorEnabled: boolean;
  suspiciousActivity: boolean;
  trustScore: number; // 0-100
  riskFlags: string[];
}

// Supply chain risk assessment
export interface SupplyChainRiskAssessment {
  packageName: string;
  version: string;
  riskLevel: SupplyChainRiskLevel;
  riskScore: number; // 0-100
  categories: SupplyChainRiskCategory[];
  findings: Array<{
    category: SupplyChainRiskCategory;
    severity: SecuritySeverity;
    description: string;
    evidence: string[];
    mitigation: string[];
  }>;
  trustIndicators: PackageTrustIndicators;
  maintainers: MaintainerInfo[];
  recommendations: string[];
  lastAssessment: number;
  nextAssessment: number;
}

// Supply chain monitoring configuration
export interface SupplyChainConfig {
  monitoring: {
    enabled: boolean;
    scanInterval: number; // milliseconds
    realTimeAlerts: boolean;
    alertThreshold: SupplyChainRiskLevel;
  };
  riskAssessment: {
    includeDevDependencies: boolean;
    trustScoreThreshold: number; // 0-100
    maintainerRiskThreshold: number; // 0-100
    ageThreshold: number; // days
  };
  automation: {
    autoBlockSuspiciousPackages: boolean;
    autoUpdateTrustedPackages: boolean;
    quarantineUnknownPackages: boolean;
    requireApprovalThreshold: SupplyChainRiskLevel;
  };
  notifications: {
    channels: string[];
    severityFilter: SecuritySeverity[];
    aggregationWindow: number; // minutes
  };
  compliance: {
    requireSBOM: boolean;
    enforceSignatureVerification: boolean;
    mandatorySecurityScanning: boolean;
    documentationRequirements: string[];
  };
}

// Supply chain monitoring event
export interface SupplyChainEvent {
  id: string;
  timestamp: number;
  type: SupplyChainEventType;
  packageName: string;
  version?: string;
  severity: SecuritySeverity;
  riskLevel: SupplyChainRiskLevel;
  details: Record<string, any>;
  source: string;
  automated: boolean;
  acknowledged: boolean;
  resolved: boolean;
}

// Supply chain security metrics
export interface SupplyChainMetrics {
  totalPackages: number;
  trustedPackages: number;
  riskPackages: number;
  suspiciousPackages: number;
  vulnerablePackages: number;
  outdatedPackages: number;
  averageTrustScore: number;
  riskDistribution: Record<SupplyChainRiskLevel, number>;
  categoryDistribution: Record<SupplyChainRiskCategory, number>;
  maintainerTrustScores: {
    avg: number;
    min: number;
    max: number;
    distribution: Record<string, number>;
  };
  complianceScore: number; // 0-100
  securityPosture: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
}

/**
 * Supply Chain Security Monitoring Service
 * Comprehensive monitoring and risk assessment of software dependencies
 */
export class SupplyChainMonitoringService {
  private static instance: SupplyChainMonitoringService;
  private config: SupplyChainConfig;
  private riskAssessments = new Map<string, SupplyChainRiskAssessment>();
  private events = new Map<string, SupplyChainEvent>();
  private metrics: SupplyChainMetrics | null = null;
  private monitoringActive = false;
  private lastScanTime = 0;

  private constructor() {
    this.config = this.getDefaultConfig();
    this.initializeMonitoring();
  }

  public static getInstance(): SupplyChainMonitoringService {
    if (!SupplyChainMonitoringService.instance) {
      SupplyChainMonitoringService.instance = new SupplyChainMonitoringService();
    }
    return SupplyChainMonitoringService.instance;
  }

  /**
   * Perform comprehensive supply chain risk assessment
   */
  public async performSupplyChainAssessment(): Promise<SupplyChainMetrics> {
    try {
      console.log('🔍 Starting supply chain security assessment...');
      
      // Get installed packages
      const auditResults = await dependencyAudit.getAuditResults();
      console.log(`📦 Analyzing ${auditResults.length} packages for supply chain risks`);
      
      // Assess each package
      const assessments: SupplyChainRiskAssessment[] = [];
      
      for (const result of auditResults) {
        const assessment = await this.assessPackageRisk(result.package);
        assessments.push(assessment);
        this.riskAssessments.set(`${assessment.packageName}@${assessment.version}`, assessment);
      }
      
      // Calculate metrics
      this.metrics = this.calculateSupplyChainMetrics(assessments);
      
      // Generate alerts for high-risk packages
      await this.generateRiskAlerts(assessments);
      
      // Log assessment completion
      await securityLogger.logEvent(
        SecurityEventType.SECURITY_EVENT,
        {
          type: 'supply_chain_assessment_completed',
          totalPackages: assessments.length,
          riskPackages: assessments.filter(a => a.riskLevel === SupplyChainRiskLevel.HIGH || 
                                               a.riskLevel === SupplyChainRiskLevel.CRITICAL).length,
          averageTrustScore: this.metrics.averageTrustScore,
          complianceScore: this.metrics.complianceScore,
        },
        {
          severity: SecuritySeverity.INFO,
        }
      );
      
      // Record in audit trail
      await auditTrail.logAuditEvent(
        AuditCategory.SECURITY_EVENT,
        'supply_chain_assessment',
        {
          actor: {
            type: 'system',
            id: 'supply_chain_monitoring',
          },
          target: {
            type: 'dependency_tree',
            id: 'application_dependencies',
            name: 'Application Dependencies',
          },
          result: 'success',
          context: {
            component: 'supply_chain_monitoring',
            operation: 'risk_assessment',
          },
          riskLevel: this.getOverallRiskLevel(this.metrics),
        }
      );
      
      this.lastScanTime = Date.now();
      
      console.log('✅ Supply chain assessment completed');
      console.log(`📊 Compliance Score: ${this.metrics.complianceScore}%`);
      console.log(`🛡️ Security Posture: ${this.metrics.securityPosture}`);
      
      return this.metrics;
      
    } catch (error) {
      console.error('❌ Supply chain assessment failed:', error);
      
      await securityLogger.logEvent(
        SecurityEventType.SECURITY_EVENT,
        {
          type: 'supply_chain_assessment_failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        {
          severity: SecuritySeverity.HIGH,
        }
      );
      
      throw error;
    }
  }

  /**
   * Monitor supply chain in real-time
   */
  public startRealTimeMonitoring(): void {
    if (this.monitoringActive) {
      console.log('⚠️ Supply chain monitoring is already active');
      return;
    }
    
    this.monitoringActive = true;
    console.log('🚀 Starting real-time supply chain monitoring...');
    
    // Periodic full assessments
    const assessmentInterval = setInterval(async () => {
      try {
        await this.performSupplyChainAssessment();
      } catch (error) {
        console.error('Periodic assessment failed:', error);
      }
    }, this.config.monitoring.scanInterval);
    
    // Listen for dependency changes
    this.watchForDependencyChanges();
    
    // Monitor external threat intelligence feeds
    this.monitorThreatIntelligence();
    
    // Start cleanup when monitoring stops
    const cleanup = () => {
      clearInterval(assessmentInterval);
      this.monitoringActive = false;
      console.log('🛑 Supply chain monitoring stopped');
    };
    
    // Stop monitoring on page unload
    window.addEventListener('beforeunload', cleanup);
  }

  /**
   * Stop real-time monitoring
   */
  public stopRealTimeMonitoring(): void {
    this.monitoringActive = false;
  }

  /**
   * Get supply chain risk assessment for a specific package
   */
  public getPackageRiskAssessment(packageName: string, version?: string): SupplyChainRiskAssessment | null {
    const key = version ? `${packageName}@${version}` : packageName;
    
    // Try exact match first
    let assessment = this.riskAssessments.get(key);
    
    // If no exact match and no version specified, find any version
    if (!assessment && !version) {
      for (const [key, value] of this.riskAssessments) {
        if (key.startsWith(`${packageName}@`)) {
          assessment = value;
          break;
        }
      }
    }
    
    return assessment || null;
  }

  /**
   * Get current supply chain metrics
   */
  public getSupplyChainMetrics(): SupplyChainMetrics | null {
    return this.metrics;
  }

  /**
   * Get recent supply chain events
   */
  public getRecentEvents(limit: number = 50): SupplyChainEvent[] {
    return Array.from(this.events.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Acknowledge supply chain event
   */
  public acknowledgeEvent(eventId: string, acknowledgedBy: string): void {
    const event = this.events.get(eventId);
    if (event) {
      event.acknowledged = true;
      this.logEvent(SupplyChainEventType.SUPPLY_CHAIN_INCIDENT, {
        action: 'event_acknowledged',
        eventId,
        acknowledgedBy,
      });
    }
  }

  /**
   * Resolve supply chain event
   */
  public resolveEvent(eventId: string, resolvedBy: string, resolution: string): void {
    const event = this.events.get(eventId);
    if (event) {
      event.resolved = true;
      this.logEvent(SupplyChainEventType.SUPPLY_CHAIN_INCIDENT, {
        action: 'event_resolved',
        eventId,
        resolvedBy,
        resolution,
      });
    }
  }

  /**
   * Export supply chain security report
   */
  public exportSecurityReport(): {
    summary: SupplyChainMetrics;
    assessments: SupplyChainRiskAssessment[];
    events: SupplyChainEvent[];
    recommendations: string[];
  } {
    const assessments = Array.from(this.riskAssessments.values());
    const events = this.getRecentEvents(100);
    
    const recommendations = this.generateSupplyChainRecommendations(assessments);
    
    return {
      summary: this.metrics || this.getDefaultMetrics(),
      assessments,
      events,
      recommendations,
    };
  }

  /**
   * Private helper methods
   */

  private async assessPackageRisk(pkg: PackageInfo): Promise<SupplyChainRiskAssessment> {
    console.log(`🔍 Assessing supply chain risk for ${pkg.name}@${pkg.version}`);
    
    // Get trust indicators
    const trustIndicators = await this.getTrustIndicators(pkg);
    
    // Get maintainer information
    const maintainers = await this.getMaintainerInfo(pkg);
    
    // Analyze risk factors
    const riskFindings = await this.analyzeRiskFactors(pkg, trustIndicators, maintainers);
    
    // Calculate overall risk score
    const riskScore = this.calculateRiskScore(riskFindings, trustIndicators, maintainers);
    const riskLevel = this.determineRiskLevel(riskScore);
    
    // Generate recommendations
    const recommendations = this.generatePackageRecommendations(riskFindings, riskLevel);
    
    const assessment: SupplyChainRiskAssessment = {
      packageName: pkg.name,
      version: pkg.version,
      riskLevel,
      riskScore,
      categories: riskFindings.map(f => f.category),
      findings: riskFindings,
      trustIndicators,
      maintainers,
      recommendations,
      lastAssessment: Date.now(),
      nextAssessment: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days
    };
    
    return assessment;
  }

  private async getTrustIndicators(pkg: PackageInfo): Promise<PackageTrustIndicators> {
    // In production, this would query npm registry, GitHub API, etc.
    // For demo, simulate trust indicators
    
    const popularPackages = ['react', 'axios', 'lodash', 'typescript'];
    const isPopular = popularPackages.includes(pkg.name);
    
    const baseTrustScore = isPopular ? 85 : 65;
    const randomVariation = (Math.random() - 0.5) * 20;
    const trustScore = Math.max(0, Math.min(100, baseTrustScore + randomVariation));
    
    return {
      downloadCount: isPopular ? 50000000 : 100000,
      weeklyDownloads: isPopular ? 2000000 : 10000,
      openIssues: Math.floor(Math.random() * 50),
      closedIssues: Math.floor(Math.random() * 500) + 100,
      lastUpdate: Date.now() - (Math.random() * 90 * 24 * 60 * 60 * 1000), // Last 90 days
      maintainerCount: Math.floor(Math.random() * 5) + 1,
      hasTests: Math.random() > 0.2,
      hasDocumentation: Math.random() > 0.3,
      hasTypeDefinitions: pkg.name.includes('types') || Math.random() > 0.4,
      hasValidSignature: Math.random() > 0.1,
      githubStars: isPopular ? 50000 : 1000,
      githubForks: isPopular ? 5000 : 100,
      npmUserCount: Math.floor(Math.random() * 1000) + 100,
      trustScore,
    };
  }

  private async getMaintainerInfo(pkg: PackageInfo): Promise<MaintainerInfo[]> {
    // In production, query npm registry and GitHub for maintainer info
    // For demo, simulate maintainer data
    
    const maintainerCount = Math.floor(Math.random() * 3) + 1;
    const maintainers: MaintainerInfo[] = [];
    
    for (let i = 0; i < maintainerCount; i++) {
      const trustScore = Math.random() * 40 + 60; // 60-100
      const riskFlags: string[] = [];
      
      if (trustScore < 70) {
        riskFlags.push('Low maintainer activity');
      }
      if (Math.random() < 0.1) {
        riskFlags.push('Unverified email');
      }
      if (Math.random() < 0.05) {
        riskFlags.push('No 2FA enabled');
      }
      
      maintainers.push({
        username: `maintainer${i + 1}`,
        email: `maintainer${i + 1}@example.com`,
        npmProfile: `https://www.npmjs.com/~maintainer${i + 1}`,
        githubProfile: `https://github.com/maintainer${i + 1}`,
        joinedDate: Date.now() - (Math.random() * 2000 * 24 * 60 * 60 * 1000), // Last 5 years
        packageCount: Math.floor(Math.random() * 50) + 1,
        totalDownloads: Math.floor(Math.random() * 10000000),
        verifiedEmail: Math.random() > 0.1,
        twoFactorEnabled: Math.random() > 0.2,
        suspiciousActivity: Math.random() < 0.05,
        trustScore,
        riskFlags,
      });
    }
    
    return maintainers;
  }

  private async analyzeRiskFactors(
    pkg: PackageInfo,
    trustIndicators: PackageTrustIndicators,
    maintainers: MaintainerInfo[]
  ): Promise<Array<{
    category: SupplyChainRiskCategory;
    severity: SecuritySeverity;
    description: string;
    evidence: string[];
    mitigation: string[];
  }>> {
    const findings = [];
    
    // Check for low trust score
    if (trustIndicators.trustScore < this.config.riskAssessment.trustScoreThreshold) {
      findings.push({
        category: SupplyChainRiskCategory.DEPENDENCY_RISK,
        severity: SecuritySeverity.MEDIUM,
        description: 'Package has low trust score',
        evidence: [
          `Trust score: ${trustIndicators.trustScore}%`,
          `Below threshold: ${this.config.riskAssessment.trustScoreThreshold}%`,
        ],
        mitigation: [
          'Review package alternatives',
          'Implement additional monitoring',
          'Consider forking the package',
        ],
      });
    }
    
    // Check for outdated packages
    const daysSinceUpdate = (Date.now() - trustIndicators.lastUpdate) / (24 * 60 * 60 * 1000);
    if (daysSinceUpdate > this.config.riskAssessment.ageThreshold) {
      findings.push({
        category: SupplyChainRiskCategory.ABANDONED_PROJECT,
        severity: SecuritySeverity.HIGH,
        description: 'Package appears to be abandoned',
        evidence: [
          `Last update: ${Math.floor(daysSinceUpdate)} days ago`,
          `Threshold: ${this.config.riskAssessment.ageThreshold} days`,
        ],
        mitigation: [
          'Find actively maintained alternative',
          'Fork and maintain internally',
          'Schedule regular security reviews',
        ],
      });
    }
    
    // Check maintainer risks
    const averageMaintainerTrust = maintainers.reduce((sum, m) => sum + m.trustScore, 0) / maintainers.length;
    if (averageMaintainerTrust < this.config.riskAssessment.maintainerRiskThreshold) {
      findings.push({
        category: SupplyChainRiskCategory.MAINTAINER_RISK,
        severity: SecuritySeverity.HIGH,
        description: 'Maintainers have low trust scores',
        evidence: [
          `Average maintainer trust: ${averageMaintainerTrust.toFixed(1)}%`,
          `Risk flags: ${maintainers.flatMap(m => m.riskFlags).join(', ')}`,
        ],
        mitigation: [
          'Review maintainer history',
          'Enable additional monitoring',
          'Consider package alternatives',
        ],
      });
    }
    
    // Check for missing security features
    if (!trustIndicators.hasValidSignature) {
      findings.push({
        category: SupplyChainRiskCategory.WEAK_SIGNATURES,
        severity: SecuritySeverity.MEDIUM,
        description: 'Package lacks valid digital signature',
        evidence: ['No valid signature found'],
        mitigation: [
          'Verify package integrity manually',
          'Enable signature verification in CI/CD',
          'Consider switching to signed alternatives',
        ],
      });
    }
    
    // Check for typosquatting patterns
    if (this.detectTyposquatting(pkg.name)) {
      findings.push({
        category: SupplyChainRiskCategory.TYPOSQUATTING,
        severity: SecuritySeverity.CRITICAL,
        description: 'Package name suggests possible typosquatting',
        evidence: [`Suspicious name pattern: ${pkg.name}`],
        mitigation: [
          'IMMEDIATE: Stop using this package',
          'Verify intended package name',
          'Report to npm security team',
        ],
      });
    }
    
    return findings;
  }

  private calculateRiskScore(
    findings: any[],
    trustIndicators: PackageTrustIndicators,
    maintainers: MaintainerInfo[]
  ): number {
    let riskScore = 0;
    
    // Base risk from trust score (inverted)
    riskScore += (100 - trustIndicators.trustScore) * 0.3;
    
    // Risk from findings
    findings.forEach(finding => {
      switch (finding.severity) {
        case SecuritySeverity.CRITICAL:
          riskScore += 25;
          break;
        case SecuritySeverity.HIGH:
          riskScore += 15;
          break;
        case SecuritySeverity.MEDIUM:
          riskScore += 10;
          break;
        case SecuritySeverity.LOW:
          riskScore += 5;
          break;
      }
    });
    
    // Risk from maintainer trust
    const avgMaintainerTrust = maintainers.reduce((sum, m) => sum + m.trustScore, 0) / maintainers.length;
    riskScore += (100 - avgMaintainerTrust) * 0.2;
    
    // Risk modifiers
    if (trustIndicators.downloadCount < 1000) riskScore += 10; // Low adoption
    if (trustIndicators.maintainerCount === 1) riskScore += 5; // Single point of failure
    if (!trustIndicators.hasTests) riskScore += 5; // No tests
    
    return Math.max(0, Math.min(100, riskScore));
  }

  private determineRiskLevel(riskScore: number): SupplyChainRiskLevel {
    if (riskScore >= 90) return SupplyChainRiskLevel.CATASTROPHIC;
    if (riskScore >= 75) return SupplyChainRiskLevel.CRITICAL;
    if (riskScore >= 60) return SupplyChainRiskLevel.HIGH;
    if (riskScore >= 40) return SupplyChainRiskLevel.MODERATE;
    if (riskScore >= 20) return SupplyChainRiskLevel.LOW;
    return SupplyChainRiskLevel.MINIMAL;
  }

  private generatePackageRecommendations(findings: any[], riskLevel: SupplyChainRiskLevel): string[] {
    const recommendations = [];
    
    switch (riskLevel) {
      case SupplyChainRiskLevel.CATASTROPHIC:
      case SupplyChainRiskLevel.CRITICAL:
        recommendations.push('IMMEDIATE ACTION REQUIRED: Stop using this package');
        recommendations.push('Find secure alternatives immediately');
        recommendations.push('Audit code that uses this package');
        break;
        
      case SupplyChainRiskLevel.HIGH:
        recommendations.push('Schedule immediate security review');
        recommendations.push('Implement additional monitoring');
        recommendations.push('Consider migration to alternatives');
        break;
        
      case SupplyChainRiskLevel.MODERATE:
        recommendations.push('Regular security monitoring recommended');
        recommendations.push('Review during next maintenance cycle');
        break;
        
      case SupplyChainRiskLevel.LOW:
        recommendations.push('Monitor for updates and security advisories');
        break;
        
      default:
        recommendations.push('Continue normal monitoring');
    }
    
    // Add specific recommendations based on findings
    findings.forEach(finding => {
      recommendations.push(...finding.mitigation);
    });
    
    return [...new Set(recommendations)]; // Remove duplicates
  }

  private calculateSupplyChainMetrics(assessments: SupplyChainRiskAssessment[]): SupplyChainMetrics {
    const totalPackages = assessments.length;
    const trustedPackages = assessments.filter(a => a.riskLevel === SupplyChainRiskLevel.MINIMAL || 
                                                   a.riskLevel === SupplyChainRiskLevel.LOW).length;
    const riskPackages = assessments.filter(a => a.riskLevel === SupplyChainRiskLevel.HIGH || 
                                               a.riskLevel === SupplyChainRiskLevel.CRITICAL ||
                                               a.riskLevel === SupplyChainRiskLevel.CATASTROPHIC).length;
    const suspiciousPackages = assessments.filter(a => 
      a.categories.includes(SupplyChainRiskCategory.TYPOSQUATTING) ||
      a.categories.includes(SupplyChainRiskCategory.MALICIOUS_PACKAGE)
    ).length;
    
    const vulnerablePackages = assessments.filter(a => 
      a.categories.includes(SupplyChainRiskCategory.DEPENDENCY_RISK)
    ).length;
    
    const outdatedPackages = assessments.filter(a => 
      a.categories.includes(SupplyChainRiskCategory.ABANDONED_PROJECT)
    ).length;
    
    const averageTrustScore = assessments.reduce((sum, a) => sum + a.trustIndicators.trustScore, 0) / totalPackages;
    
    // Risk distribution
    const riskDistribution: Record<SupplyChainRiskLevel, number> = {
      [SupplyChainRiskLevel.MINIMAL]: 0,
      [SupplyChainRiskLevel.LOW]: 0,
      [SupplyChainRiskLevel.MODERATE]: 0,
      [SupplyChainRiskLevel.HIGH]: 0,
      [SupplyChainRiskLevel.CRITICAL]: 0,
      [SupplyChainRiskLevel.CATASTROPHIC]: 0,
    };
    
    assessments.forEach(a => {
      riskDistribution[a.riskLevel]++;
    });
    
    // Category distribution
    const categoryDistribution: Record<SupplyChainRiskCategory, number> = {
      [SupplyChainRiskCategory.DEPENDENCY_RISK]: 0,
      [SupplyChainRiskCategory.MAINTAINER_RISK]: 0,
      [SupplyChainRiskCategory.INFRASTRUCTURE_RISK]: 0,
      [SupplyChainRiskCategory.TYPOSQUATTING]: 0,
      [SupplyChainRiskCategory.MALICIOUS_PACKAGE]: 0,
      [SupplyChainRiskCategory.ABANDONED_PROJECT]: 0,
      [SupplyChainRiskCategory.WEAK_SIGNATURES]: 0,
      [SupplyChainRiskCategory.SUPPLY_CHAIN_ATTACK]: 0,
    };
    
    assessments.forEach(a => {
      a.categories.forEach(category => {
        categoryDistribution[category]++;
      });
    });
    
    // Maintainer trust scores
    const allMaintainers = assessments.flatMap(a => a.maintainers);
    const maintainerTrustScores = allMaintainers.map(m => m.trustScore);
    
    const maintainerTrustStats = {
      avg: maintainerTrustScores.reduce((sum, score) => sum + score, 0) / maintainerTrustScores.length,
      min: Math.min(...maintainerTrustScores),
      max: Math.max(...maintainerTrustScores),
      distribution: {
        'excellent (90-100)': maintainerTrustScores.filter(s => s >= 90).length,
        'good (75-89)': maintainerTrustScores.filter(s => s >= 75 && s < 90).length,
        'fair (60-74)': maintainerTrustScores.filter(s => s >= 60 && s < 75).length,
        'poor (40-59)': maintainerTrustScores.filter(s => s >= 40 && s < 60).length,
        'critical (<40)': maintainerTrustScores.filter(s => s < 40).length,
      },
    };
    
    // Compliance score (0-100)
    let complianceScore = 100;
    if (riskPackages > 0) complianceScore -= riskPackages * 10;
    if (suspiciousPackages > 0) complianceScore -= suspiciousPackages * 20;
    if (vulnerablePackages > 0) complianceScore -= vulnerablePackages * 5;
    complianceScore = Math.max(0, complianceScore);
    
    // Security posture
    let securityPosture: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
    if (complianceScore >= 95) securityPosture = 'excellent';
    else if (complianceScore >= 85) securityPosture = 'good';
    else if (complianceScore >= 70) securityPosture = 'fair';
    else if (complianceScore >= 50) securityPosture = 'poor';
    else securityPosture = 'critical';
    
    return {
      totalPackages,
      trustedPackages,
      riskPackages,
      suspiciousPackages,
      vulnerablePackages,
      outdatedPackages,
      averageTrustScore: Math.round(averageTrustScore * 10) / 10,
      riskDistribution,
      categoryDistribution,
      maintainerTrustScores: maintainerTrustStats,
      complianceScore: Math.round(complianceScore),
      securityPosture,
    };
  }

  private async generateRiskAlerts(assessments: SupplyChainRiskAssessment[]): Promise<void> {
    const highRiskPackages = assessments.filter(a => 
      a.riskLevel === SupplyChainRiskLevel.HIGH ||
      a.riskLevel === SupplyChainRiskLevel.CRITICAL ||
      a.riskLevel === SupplyChainRiskLevel.CATASTROPHIC
    );
    
    for (const assessment of highRiskPackages) {
      let alertType: AlertType;
      
      if (assessment.categories.includes(SupplyChainRiskCategory.TYPOSQUATTING)) {
        alertType = AlertType.CRITICAL_THREAT;
      } else if (assessment.categories.includes(SupplyChainRiskCategory.MALICIOUS_PACKAGE)) {
        alertType = AlertType.CRITICAL_THREAT;
      } else if (assessment.riskLevel === SupplyChainRiskLevel.CRITICAL) {
        alertType = AlertType.CRITICAL_THREAT;
      } else {
        alertType = AlertType.SUSPICIOUS_ACTIVITY;
      }
      
      await securityAlerts.createAlert(alertType, {
        source: 'supply_chain_monitoring',
        affectedUser: 'system',
        riskScore: assessment.riskScore / 100,
        resource: `${assessment.packageName}@${assessment.version}`,
        action: 'risk_assessment',
      });
    }
  }

  private detectTyposquatting(packageName: string): boolean {
    // Simple typosquatting detection
    const commonPackages = ['react', 'angular', 'vue', 'lodash', 'axios', 'express'];
    
    for (const commonPkg of commonPackages) {
      if (packageName !== commonPkg && this.calculateLevenshteinDistance(packageName, commonPkg) <= 2) {
        return true;
      }
    }
    
    return false;
  }

  private calculateLevenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  private generateSupplyChainRecommendations(assessments: SupplyChainRiskAssessment[]): string[] {
    const recommendations = [];
    
    const criticalPackages = assessments.filter(a => a.riskLevel === SupplyChainRiskLevel.CRITICAL);
    const highRiskPackages = assessments.filter(a => a.riskLevel === SupplyChainRiskLevel.HIGH);
    const abandonedPackages = assessments.filter(a => 
      a.categories.includes(SupplyChainRiskCategory.ABANDONED_PROJECT)
    );
    
    if (criticalPackages.length > 0) {
      recommendations.push(`🚨 URGENT: ${criticalPackages.length} packages require immediate attention`);
    }
    
    if (highRiskPackages.length > 0) {
      recommendations.push(`⚠️ ${highRiskPackages.length} high-risk packages need review`);
    }
    
    if (abandonedPackages.length > 0) {
      recommendations.push(`📅 ${abandonedPackages.length} packages appear abandoned - consider alternatives`);
    }
    
    // Add general recommendations
    recommendations.push('Implement automated dependency scanning in CI/CD pipeline');
    recommendations.push('Enable real-time security monitoring for all dependencies');
    recommendations.push('Establish dependency approval process for new packages');
    recommendations.push('Regular supply chain risk assessments (weekly)');
    recommendations.push('Maintain Software Bill of Materials (SBOM)');
    
    return recommendations;
  }

  private watchForDependencyChanges(): void {
    // In production, this would monitor package.json changes, git hooks, etc.
    console.log('👁️ Watching for dependency changes...');
  }

  private monitorThreatIntelligence(): void {
    // In production, this would integrate with threat intelligence feeds
    console.log('🔍 Monitoring threat intelligence feeds...');
  }

  private logEvent(type: SupplyChainEventType, details: Record<string, any>): void {
    const event: SupplyChainEvent = {
      id: this.generateId('event'),
      timestamp: Date.now(),
      type,
      packageName: details.packageName || 'unknown',
      version: details.version,
      severity: details.severity || SecuritySeverity.INFO,
      riskLevel: details.riskLevel || SupplyChainRiskLevel.LOW,
      details,
      source: 'supply_chain_monitoring',
      automated: true,
      acknowledged: false,
      resolved: false,
    };
    
    this.events.set(event.id, event);
  }

  private getOverallRiskLevel(metrics: SupplyChainMetrics): 'low' | 'medium' | 'high' | 'critical' {
    if (metrics.securityPosture === 'critical' || metrics.securityPosture === 'poor') {
      return 'critical';
    }
    if (metrics.securityPosture === 'fair') {
      return 'high';
    }
    if (metrics.securityPosture === 'good') {
      return 'medium';
    }
    return 'low';
  }

  private getDefaultMetrics(): SupplyChainMetrics {
    return {
      totalPackages: 0,
      trustedPackages: 0,
      riskPackages: 0,
      suspiciousPackages: 0,
      vulnerablePackages: 0,
      outdatedPackages: 0,
      averageTrustScore: 0,
      riskDistribution: {
        [SupplyChainRiskLevel.MINIMAL]: 0,
        [SupplyChainRiskLevel.LOW]: 0,
        [SupplyChainRiskLevel.MODERATE]: 0,
        [SupplyChainRiskLevel.HIGH]: 0,
        [SupplyChainRiskLevel.CRITICAL]: 0,
        [SupplyChainRiskLevel.CATASTROPHIC]: 0,
      },
      categoryDistribution: {
        [SupplyChainRiskCategory.DEPENDENCY_RISK]: 0,
        [SupplyChainRiskCategory.MAINTAINER_RISK]: 0,
        [SupplyChainRiskCategory.INFRASTRUCTURE_RISK]: 0,
        [SupplyChainRiskCategory.TYPOSQUATTING]: 0,
        [SupplyChainRiskCategory.MALICIOUS_PACKAGE]: 0,
        [SupplyChainRiskCategory.ABANDONED_PROJECT]: 0,
        [SupplyChainRiskCategory.WEAK_SIGNATURES]: 0,
        [SupplyChainRiskCategory.SUPPLY_CHAIN_ATTACK]: 0,
      },
      maintainerTrustScores: {
        avg: 0,
        min: 0,
        max: 0,
        distribution: {
          'excellent (90-100)': 0,
          'good (75-89)': 0,
          'fair (60-74)': 0,
          'poor (40-59)': 0,
          'critical (<40)': 0,
        },
      },
      complianceScore: 0,
      securityPosture: 'critical',
    };
  }

  private initializeMonitoring(): void {
    // Initialize with default configuration
    console.log('🔧 Initializing supply chain monitoring...');
  }

  private getDefaultConfig(): SupplyChainConfig {
    return {
      monitoring: {
        enabled: true,
        scanInterval: 24 * 60 * 60 * 1000, // 24 hours
        realTimeAlerts: true,
        alertThreshold: SupplyChainRiskLevel.HIGH,
      },
      riskAssessment: {
        includeDevDependencies: true,
        trustScoreThreshold: 70,
        maintainerRiskThreshold: 60,
        ageThreshold: 365, // days
      },
      automation: {
        autoBlockSuspiciousPackages: false,
        autoUpdateTrustedPackages: false,
        quarantineUnknownPackages: false,
        requireApprovalThreshold: SupplyChainRiskLevel.HIGH,
      },
      notifications: {
        channels: ['browser', 'email'],
        severityFilter: [SecuritySeverity.MEDIUM, SecuritySeverity.HIGH, SecuritySeverity.CRITICAL],
        aggregationWindow: 15, // minutes
      },
      compliance: {
        requireSBOM: true,
        enforceSignatureVerification: false,
        mandatorySecurityScanning: true,
        documentationRequirements: ['README', 'LICENSE', 'SECURITY'],
      },
    };
  }

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Global instance
export const supplyChainMonitoring = SupplyChainMonitoringService.getInstance();