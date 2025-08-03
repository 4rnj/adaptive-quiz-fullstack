/**
 * CI/CD Security Integration System
 * Automated security scanning and integration for continuous deployment pipelines
 */

import { securityLogger, SecurityEventType, SecuritySeverity } from './securityLogging';
import { auditTrail, AuditCategory } from './auditTrail';
import { dependencyAudit } from './dependencyAudit';
import { vulnerabilityPatching } from './vulnerabilityPatching';
import { supplyChainMonitoring } from './supplyChainMonitoring';
import { sbomGenerator } from './sbomGenerator';
import { licenseCompliance } from './licenseCompliance';
import { securityAlerts, AlertType } from '../components/security/SecurityAlerts';

// CI/CD pipeline stages
export enum PipelineStage {
  PRE_BUILD = 'PRE_BUILD',
  BUILD = 'BUILD',
  TEST = 'TEST',
  SECURITY_SCAN = 'SECURITY_SCAN',
  DEPLOY = 'DEPLOY',
  POST_DEPLOY = 'POST_DEPLOY',
}

// Security scan types
export enum SecurityScanType {
  DEPENDENCY_AUDIT = 'DEPENDENCY_AUDIT',
  VULNERABILITY_SCAN = 'VULNERABILITY_SCAN',
  LICENSE_COMPLIANCE = 'LICENSE_COMPLIANCE',
  SUPPLY_CHAIN_ANALYSIS = 'SUPPLY_CHAIN_ANALYSIS',
  SBOM_GENERATION = 'SBOM_GENERATION',
  STATIC_CODE_ANALYSIS = 'STATIC_CODE_ANALYSIS',
  CONTAINER_SCAN = 'CONTAINER_SCAN',
  SECRET_DETECTION = 'SECRET_DETECTION',
  PENETRATION_TEST = 'PENETRATION_TEST',
}

// Security gate policies
export enum SecurityGatePolicy {
  STRICT = 'STRICT',       // Block on any security issue
  MODERATE = 'MODERATE',   // Block on high/critical issues
  PERMISSIVE = 'PERMISSIVE', // Warn on issues, don't block
  CUSTOM = 'CUSTOM',       // Custom rules
}

// Pipeline environment types
export enum PipelineEnvironment {
  DEVELOPMENT = 'DEVELOPMENT',
  STAGING = 'STAGING',
  PRODUCTION = 'PRODUCTION',
  TEST = 'TEST',
}

// Security scan result
export interface SecurityScanResult {
  scanId: string;
  scanType: SecurityScanType;
  stage: PipelineStage;
  environment: PipelineEnvironment;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'running' | 'passed' | 'failed' | 'warning' | 'skipped';
  findings: SecurityFinding[];
  metrics: {
    totalIssues: number;
    criticalIssues: number;
    highIssues: number;
    mediumIssues: number;
    lowIssues: number;
    blockerIssues: number;
  };
  artifacts: {
    reportPath?: string;
    sbomPath?: string;
    evidencePath?: string;
    logPath?: string;
  };
  metadata: {
    pipelineId: string;
    buildNumber: string;
    commitHash: string;
    branch: string;
    triggeredBy: string;
  };
}

// Security finding
export interface SecurityFinding {
  id: string;
  type: SecurityScanType;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  category: string;
  location: {
    file?: string;
    line?: number;
    package?: string;
    component?: string;
  };
  remediation: {
    effort: 'low' | 'medium' | 'high';
    priority: 'immediate' | 'high' | 'medium' | 'low';
    steps: string[];
    automatable: boolean;
  };
  references: string[];
  tags: string[];
  riskScore: number;
  confidence: number;
  falsePositive: boolean;
  suppressed: boolean;
  suppressionReason?: string;
}

// Security gate configuration
export interface SecurityGateConfig {
  environment: PipelineEnvironment;
  policy: SecurityGatePolicy;
  enabledScans: SecurityScanType[];
  thresholds: {
    critical: {
      max: number;
      action: 'block' | 'warn' | 'ignore';
    };
    high: {
      max: number;
      action: 'block' | 'warn' | 'ignore';
    };
    medium: {
      max: number;
      action: 'block' | 'warn' | 'ignore';
    };
    low: {
      max: number;
      action: 'block' | 'warn' | 'ignore';
    };
  };
  exemptions: Array<{
    type: SecurityScanType;
    pattern: string;
    reason: string;
    approver: string;
    expiresAt: number;
  }>;
  notifications: {
    onSuccess: string[];
    onFailure: string[];
    onWarning: string[];
  };
  artifacts: {
    preserveReports: boolean;
    uploadToStorage: boolean;
    retentionDays: number;
  };
}

// Pipeline security configuration
export interface PipelineSecurityConfig {
  enabled: boolean;
  globalSettings: {
    timeout: number;
    parallelScans: boolean;
    failFast: boolean;
    continueOnWarning: boolean;
  };
  gates: Record<PipelineEnvironment, SecurityGateConfig>;
  integrations: {
    jira: {
      enabled: boolean;
      createTickets: boolean;
      project: string;
    };
    slack: {
      enabled: boolean;
      webhook: string;
      channels: string[];
    };
    email: {
      enabled: boolean;
      recipients: string[];
    };
    securityCenter: {
      enabled: boolean;
      endpoint: string;
      apiKey: string;
    };
  };
  compliance: {
    requireSBOM: boolean;
    enforceSignatures: boolean;
    auditTrail: boolean;
    complianceFrameworks: string[];
  };
}

// Pipeline execution context
export interface PipelineContext {
  pipelineId: string;
  buildNumber: string;
  environment: PipelineEnvironment;
  commitHash: string;
  branch: string;
  triggeredBy: string;
  timestamp: number;
  workingDirectory: string;
  artifacts: Record<string, string>;
}

/**
 * CI/CD Security Integration Service
 * Comprehensive security scanning and integration for CI/CD pipelines
 */
export class CICDSecurityService {
  private static instance: CICDSecurityService;
  private config: PipelineSecurityConfig;
  private scanResults = new Map<string, SecurityScanResult>();
  private activeScans = new Set<string>();

  private constructor() {
    this.config = this.getDefaultConfig();
  }

  public static getInstance(): CICDSecurityService {
    if (!CICDSecurityService.instance) {
      CICDSecurityService.instance = new CICDSecurityService();
    }
    return CICDSecurityService.instance;
  }

  /**
   * Execute security gate for pipeline stage
   */
  public async executeSecurityGate(
    stage: PipelineStage,
    context: PipelineContext
  ): Promise<{
    passed: boolean;
    results: SecurityScanResult[];
    blockers: SecurityFinding[];
    warnings: SecurityFinding[];
  }> {
    try {
      console.log(`🛡️ Executing security gate for stage: ${stage}`);
      console.log(`📊 Environment: ${context.environment}`);
      
      if (!this.config.enabled) {
        console.log('⚠️ Security scanning disabled');
        return { passed: true, results: [], blockers: [], warnings: [] };
      }
      
      const gateConfig = this.config.gates[context.environment];
      if (!gateConfig) {
        console.log(`⚠️ No security gate configured for environment: ${context.environment}`);
        return { passed: true, results: [], blockers: [], warnings: [] };
      }
      
      // Execute security scans
      const results = await this.executeScans(gateConfig.enabledScans, stage, context);
      
      // Evaluate gate policy
      const evaluation = this.evaluateGatePolicy(results, gateConfig);
      
      // Generate artifacts
      await this.generateArtifacts(results, context, gateConfig);
      
      // Send notifications
      await this.sendNotifications(evaluation, gateConfig, context);
      
      // Log gate execution
      await securityLogger.logEvent(
        SecurityEventType.SECURITY_EVENT,
        {
          type: 'security_gate_executed',
          stage,
          environment: context.environment,
          passed: evaluation.passed,
          blockers: evaluation.blockers.length,
          warnings: evaluation.warnings.length,
          pipelineId: context.pipelineId,
          buildNumber: context.buildNumber,
        },
        {
          severity: evaluation.passed ? SecuritySeverity.INFO : SecuritySeverity.HIGH,
        }
      );
      
      // Record in audit trail
      await auditTrail.logAuditEvent(
        AuditCategory.SECURITY_EVENT,
        'security_gate_execution',
        {
          actor: {
            type: 'system',
            id: 'cicd_security_service',
          },
          target: {
            type: 'pipeline',
            id: context.pipelineId,
            name: `Pipeline ${context.pipelineId}`,
          },
          result: evaluation.passed ? 'success' : 'failure',
          context: {
            component: 'cicd_security',
            operation: 'security_gate',
            stage,
            environment: context.environment,
          },
          riskLevel: evaluation.passed ? 'low' : 'high',
        }
      );
      
      console.log(`${evaluation.passed ? '✅' : '❌'} Security gate ${evaluation.passed ? 'passed' : 'failed'}`);
      console.log(`📊 Blockers: ${evaluation.blockers.length}, Warnings: ${evaluation.warnings.length}`);
      
      return evaluation;
      
    } catch (error) {
      console.error('❌ Security gate execution failed:', error);
      
      await securityLogger.logEvent(
        SecurityEventType.SECURITY_EVENT,
        {
          type: 'security_gate_failed',
          stage,
          environment: context.environment,
          error: error instanceof Error ? error.message : 'Unknown error',
          pipelineId: context.pipelineId,
        },
        {
          severity: SecuritySeverity.CRITICAL,
        }
      );
      
      // Fail secure - block pipeline on error unless configured otherwise
      return {
        passed: false,
        results: [],
        blockers: [{
          id: 'security-gate-error',
          type: SecurityScanType.DEPENDENCY_AUDIT,
          severity: 'critical',
          title: 'Security Gate Error',
          description: 'Security gate execution failed',
          category: 'system',
          location: {},
          remediation: {
            effort: 'high',
            priority: 'immediate',
            steps: ['Contact security team', 'Review pipeline configuration'],
            automatable: false,
          },
          references: [],
          tags: ['system-error'],
          riskScore: 10,
          confidence: 1,
          falsePositive: false,
          suppressed: false,
        }],
        warnings: [],
      };
    }
  }

  /**
   * Execute individual security scan
   */
  public async executeScan(
    scanType: SecurityScanType,
    stage: PipelineStage,
    context: PipelineContext
  ): Promise<SecurityScanResult> {
    const scanId = this.generateScanId(scanType, context);
    const startTime = Date.now();
    
    console.log(`🔍 Executing ${scanType} scan...`);
    
    const result: SecurityScanResult = {
      scanId,
      scanType,
      stage,
      environment: context.environment,
      startTime,
      status: 'running',
      findings: [],
      metrics: {
        totalIssues: 0,
        criticalIssues: 0,
        highIssues: 0,
        mediumIssues: 0,
        lowIssues: 0,
        blockerIssues: 0,
      },
      artifacts: {},
      metadata: {
        pipelineId: context.pipelineId,
        buildNumber: context.buildNumber,
        commitHash: context.commitHash,
        branch: context.branch,
        triggeredBy: context.triggeredBy,
      },
    };
    
    this.activeScans.add(scanId);
    
    try {
      // Execute specific scan type
      const findings = await this.executeScanType(scanType, context);
      
      result.findings = findings;
      result.metrics = this.calculateMetrics(findings);
      result.status = this.determineScanStatus(result.metrics);
      result.endTime = Date.now();
      result.duration = result.endTime - startTime;
      
      console.log(`✅ ${scanType} scan completed: ${result.status}`);
      console.log(`📊 Found ${result.metrics.totalIssues} issues (${result.metrics.criticalIssues} critical)`);
      
    } catch (error) {
      result.status = 'failed';
      result.endTime = Date.now();
      result.duration = result.endTime - startTime;
      
      console.error(`❌ ${scanType} scan failed:`, error);
      
      // Add error as finding
      result.findings.push({
        id: `scan-error-${scanId}`,
        type: scanType,
        severity: 'high',
        title: `${scanType} Scan Failed`,
        description: error instanceof Error ? error.message : 'Scan execution failed',
        category: 'scan-error',
        location: {},
        remediation: {
          effort: 'medium',
          priority: 'high',
          steps: ['Review scan configuration', 'Check scan logs', 'Contact security team'],
          automatable: false,
        },
        references: [],
        tags: ['scan-error'],
        riskScore: 7,
        confidence: 1,
        falsePositive: false,
        suppressed: false,
      });
      
      result.metrics = this.calculateMetrics(result.findings);
    } finally {
      this.activeScans.delete(scanId);
      this.scanResults.set(scanId, result);
    }
    
    return result;
  }

  /**
   * Get scan results for pipeline
   */
  public getScanResults(pipelineId?: string): SecurityScanResult[] {
    if (!pipelineId) {
      return Array.from(this.scanResults.values());
    }
    
    return Array.from(this.scanResults.values())
      .filter(result => result.metadata.pipelineId === pipelineId)
      .sort((a, b) => b.startTime - a.startTime);
  }

  /**
   * Generate security report for pipeline
   */
  public generateSecurityReport(
    pipelineId: string
  ): {
    summary: {
      totalScans: number;
      passedScans: number;
      failedScans: number;
      totalFindings: number;
      criticalFindings: number;
      riskScore: number;
    };
    results: SecurityScanResult[];
    recommendations: string[];
  } {
    const results = this.getScanResults(pipelineId);
    
    const summary = {
      totalScans: results.length,
      passedScans: results.filter(r => r.status === 'passed').length,
      failedScans: results.filter(r => r.status === 'failed').length,
      totalFindings: results.reduce((sum, r) => sum + r.metrics.totalIssues, 0),
      criticalFindings: results.reduce((sum, r) => sum + r.metrics.criticalIssues, 0),
      riskScore: this.calculateOverallRiskScore(results),
    };
    
    const recommendations = this.generateRecommendations(results);
    
    return { summary, results, recommendations };
  }

  /**
   * Update security configuration
   */
  public updateConfiguration(updates: Partial<PipelineSecurityConfig>): void {
    this.config = { ...this.config, ...updates };
    
    console.log('🔧 Security configuration updated');
  }

  /**
   * Get current configuration
   */
  public getConfiguration(): PipelineSecurityConfig {
    return { ...this.config };
  }

  /**
   * Private helper methods
   */

  private async executeScans(
    scanTypes: SecurityScanType[],
    stage: PipelineStage,
    context: PipelineContext
  ): Promise<SecurityScanResult[]> {
    const results: SecurityScanResult[] = [];
    
    if (this.config.globalSettings.parallelScans) {
      // Execute scans in parallel
      const scanPromises = scanTypes.map(scanType => 
        this.executeScan(scanType, stage, context)
      );
      
      const scanResults = await Promise.allSettled(scanPromises);
      
      scanResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          console.error(`Scan ${scanTypes[index]} failed:`, result.reason);
        }
      });
    } else {
      // Execute scans sequentially
      for (const scanType of scanTypes) {
        try {
          const result = await this.executeScan(scanType, stage, context);
          results.push(result);
          
          // Check fail-fast setting
          if (this.config.globalSettings.failFast && result.status === 'failed') {
            console.log('⚡ Fail-fast enabled - stopping remaining scans');
            break;
          }
        } catch (error) {
          console.error(`Scan ${scanType} failed:`, error);
          
          if (this.config.globalSettings.failFast) {
            break;
          }
        }
      }
    }
    
    return results;
  }

  private async executeScanType(
    scanType: SecurityScanType,
    context: PipelineContext
  ): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];
    
    switch (scanType) {
      case SecurityScanType.DEPENDENCY_AUDIT:
        const auditSummary = await dependencyAudit.performFullAudit();
        findings.push(...this.convertAuditToFindings(auditSummary));
        break;
        
      case SecurityScanType.VULNERABILITY_SCAN:
        const vulnerabilityReport = await dependencyAudit.getVulnerabilityReport();
        findings.push(...this.convertVulnerabilitiesToFindings(vulnerabilityReport));
        break;
        
      case SecurityScanType.LICENSE_COMPLIANCE:
        const complianceReport = await licenseCompliance.performComplianceAnalysis();
        findings.push(...this.convertComplianceToFindings(complianceReport));
        break;
        
      case SecurityScanType.SUPPLY_CHAIN_ANALYSIS:
        const supplyChainMetrics = await supplyChainMonitoring.performSupplyChainAssessment();
        findings.push(...this.convertSupplyChainToFindings(supplyChainMetrics));
        break;
        
      case SecurityScanType.SBOM_GENERATION:
        await sbomGenerator.generateSBOM({
          format: 'CycloneDX',
          includeVulnerabilities: true,
          includeLicenses: true,
          includeSupplyChainRisk: true,
        });
        // SBOM generation typically doesn't produce findings unless there are errors
        break;
        
      case SecurityScanType.SECRET_DETECTION:
        findings.push(...await this.scanForSecrets(context));
        break;
        
      case SecurityScanType.STATIC_CODE_ANALYSIS:
        findings.push(...await this.performStaticAnalysis(context));
        break;
        
      default:
        console.log(`⚠️ Scan type ${scanType} not implemented`);
    }
    
    return findings;
  }

  private async scanForSecrets(context: PipelineContext): Promise<SecurityFinding[]> {
    // Simplified secret detection - in production would use tools like GitLeaks, TruffleHog
    const findings: SecurityFinding[] = [];
    
    const secretPatterns = [
      { pattern: /sk-[a-zA-Z0-9]{48}/, type: 'OpenAI API Key' },
      { pattern: /AKIA[0-9A-Z]{16}/, type: 'AWS Access Key' },
      { pattern: /ghp_[a-zA-Z0-9]{36}/, type: 'GitHub Personal Access Token' },
      { pattern: /xoxb-[0-9]{12}-[0-9]{12}-[a-zA-Z0-9]{24}/, type: 'Slack Bot Token' },
    ];
    
    // In production, would scan actual files
    const mockFileContent = `
      const config = {
        apiKey: 'sk-abc123def456...',  // This would be detected
        database: 'postgresql://user:pass@localhost'
      };
    `;
    
    secretPatterns.forEach((secretPattern, index) => {
      if (secretPattern.pattern.test(mockFileContent)) {
        findings.push({
          id: `secret-${index}`,
          type: SecurityScanType.SECRET_DETECTION,
          severity: 'critical',
          title: `${secretPattern.type} Detected`,
          description: `Potential ${secretPattern.type} found in source code`,
          category: 'secret-detection',
          location: {
            file: 'config.js',
            line: 2,
          },
          remediation: {
            effort: 'low',
            priority: 'immediate',
            steps: [
              'Remove secret from source code',
              'Rotate the exposed secret',
              'Use environment variables or secret management',
              'Add to .gitignore patterns',
            ],
            automatable: false,
          },
          references: [
            'https://owasp.org/www-community/vulnerabilities/Insecure_Storage',
          ],
          tags: ['secret', 'credential'],
          riskScore: 9,
          confidence: 0.9,
          falsePositive: false,
          suppressed: false,
        });
      }
    });
    
    return findings;
  }

  private async performStaticAnalysis(context: PipelineContext): Promise<SecurityFinding[]> {
    // Simplified static analysis - in production would use tools like SonarQube, CodeQL
    const findings: SecurityFinding[] = [];
    
    // Mock static analysis findings
    const staticIssues = [
      {
        title: 'Potential XSS Vulnerability',
        description: 'User input is rendered without proper sanitization',
        severity: 'high' as const,
        category: 'security',
        file: 'components/UserProfile.tsx',
        line: 45,
      },
      {
        title: 'Hardcoded Password',
        description: 'Password appears to be hardcoded in source',
        severity: 'critical' as const,
        category: 'security',
        file: 'utils/database.ts',
        line: 12,
      },
    ];
    
    staticIssues.forEach((issue, index) => {
      findings.push({
        id: `static-${index}`,
        type: SecurityScanType.STATIC_CODE_ANALYSIS,
        severity: issue.severity,
        title: issue.title,
        description: issue.description,
        category: issue.category,
        location: {
          file: issue.file,
          line: issue.line,
        },
        remediation: {
          effort: 'medium',
          priority: issue.severity === 'critical' ? 'immediate' : 'high',
          steps: [
            'Review code for security best practices',
            'Implement proper input sanitization',
            'Use parameterized queries',
            'Follow OWASP guidelines',
          ],
          automatable: false,
        },
        references: [
          'https://owasp.org/www-project-top-ten/',
        ],
        tags: ['static-analysis', 'code-quality'],
        riskScore: issue.severity === 'critical' ? 9 : 7,
        confidence: 0.8,
        falsePositive: false,
        suppressed: false,
      });
    });
    
    return findings;
  }

  private convertAuditToFindings(auditSummary: any): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    
    if (auditSummary.totalVulnerabilities > 0) {
      findings.push({
        id: 'dependency-vulnerabilities',
        type: SecurityScanType.DEPENDENCY_AUDIT,
        severity: auditSummary.severityBreakdown.CRITICAL > 0 ? 'critical' : 'high',
        title: 'Vulnerable Dependencies Detected',
        description: `Found ${auditSummary.totalVulnerabilities} vulnerabilities in dependencies`,
        category: 'dependency',
        location: {},
        remediation: {
          effort: 'medium',
          priority: 'high',
          steps: ['Update vulnerable packages', 'Review security advisories', 'Apply security patches'],
          automatable: true,
        },
        references: [],
        tags: ['dependency', 'vulnerability'],
        riskScore: Math.min(10, auditSummary.riskScore),
        confidence: 0.9,
        falsePositive: false,
        suppressed: false,
      });
    }
    
    return findings;
  }

  private convertVulnerabilitiesToFindings(vulnerabilityReport: any): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    
    // Convert critical and high vulnerabilities to findings
    [...vulnerabilityReport.critical, ...vulnerabilityReport.high].forEach((result, index) => {
      result.vulnerabilities.forEach((vuln: any) => {
        findings.push({
          id: `vuln-${index}-${vuln.id}`,
          type: SecurityScanType.VULNERABILITY_SCAN,
          severity: vuln.severity.toLowerCase(),
          title: vuln.title,
          description: vuln.description,
          category: 'vulnerability',
          location: {
            package: result.package.name,
          },
          remediation: {
            effort: 'low',
            priority: vuln.severity === 'CRITICAL' ? 'immediate' : 'high',
            steps: [vuln.recommendation],
            automatable: true,
          },
          references: vuln.references || [],
          tags: ['vulnerability', result.package.name],
          riskScore: vuln.cvssScore || 7,
          confidence: 0.95,
          falsePositive: false,
          suppressed: false,
        });
      });
    });
    
    return findings;
  }

  private convertComplianceToFindings(complianceReport: any): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    
    complianceReport.violations.forEach((violation: any, index: number) => {
      findings.push({
        id: `license-${index}`,
        type: SecurityScanType.LICENSE_COMPLIANCE,
        severity: violation.severity.toLowerCase(),
        title: 'License Compliance Violation',
        description: violation.violation,
        category: 'license',
        location: {
          package: violation.packageName,
        },
        remediation: {
          effort: 'medium',
          priority: 'medium',
          steps: [violation.recommendation],
          automatable: false,
        },
        references: [],
        tags: ['license', 'compliance'],
        riskScore: this.severityToRiskScore(violation.severity),
        confidence: 0.9,
        falsePositive: false,
        suppressed: false,
      });
    });
    
    return findings;
  }

  private convertSupplyChainToFindings(metrics: any): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    
    if (metrics.riskPackages > 0) {
      findings.push({
        id: 'supply-chain-risk',
        type: SecurityScanType.SUPPLY_CHAIN_ANALYSIS,
        severity: metrics.securityPosture === 'critical' ? 'critical' : 'medium',
        title: 'Supply Chain Risk Detected',
        description: `Found ${metrics.riskPackages} high-risk packages in supply chain`,
        category: 'supply-chain',
        location: {},
        remediation: {
          effort: 'high',
          priority: 'medium',
          steps: ['Review package trust scores', 'Consider alternative packages', 'Implement monitoring'],
          automatable: false,
        },
        references: [],
        tags: ['supply-chain', 'risk'],
        riskScore: 10 - metrics.complianceScore / 10,
        confidence: 0.8,
        falsePositive: false,
        suppressed: false,
      });
    }
    
    return findings;
  }

  private evaluateGatePolicy(
    results: SecurityScanResult[],
    gateConfig: SecurityGateConfig
  ): {
    passed: boolean;
    blockers: SecurityFinding[];
    warnings: SecurityFinding[];
  } {
    const blockers: SecurityFinding[] = [];
    const warnings: SecurityFinding[] = [];
    
    for (const result of results) {
      for (const finding of result.findings) {
        const threshold = gateConfig.thresholds[finding.severity as keyof typeof gateConfig.thresholds];
        
        if (threshold.action === 'block') {
          blockers.push(finding);
        } else if (threshold.action === 'warn') {
          warnings.push(finding);
        }
      }
    }
    
    // Check exemptions
    const exemptedBlockers = blockers.filter(blocker => {
      return !gateConfig.exemptions.some(exemption => 
        exemption.type === blocker.type &&
        exemption.expiresAt > Date.now() &&
        this.matchesPattern(blocker, exemption.pattern)
      );
    });
    
    const passed = exemptedBlockers.length === 0;
    
    return { passed, blockers: exemptedBlockers, warnings };
  }

  private matchesPattern(finding: SecurityFinding, pattern: string): boolean {
    // Simple pattern matching - in production would support regex, etc.
    return finding.title.includes(pattern) || 
           finding.category.includes(pattern) ||
           finding.location.package?.includes(pattern) ||
           false;
  }

  private calculateMetrics(findings: SecurityFinding[]): SecurityScanResult['metrics'] {
    const metrics = {
      totalIssues: findings.length,
      criticalIssues: findings.filter(f => f.severity === 'critical').length,
      highIssues: findings.filter(f => f.severity === 'high').length,
      mediumIssues: findings.filter(f => f.severity === 'medium').length,
      lowIssues: findings.filter(f => f.severity === 'low').length,
      blockerIssues: findings.filter(f => f.severity === 'critical' || f.severity === 'high').length,
    };
    
    return metrics;
  }

  private determineScanStatus(metrics: SecurityScanResult['metrics']): SecurityScanResult['status'] {
    if (metrics.criticalIssues > 0) return 'failed';
    if (metrics.highIssues > 0) return 'warning';
    if (metrics.totalIssues > 0) return 'warning';
    return 'passed';
  }

  private async generateArtifacts(
    results: SecurityScanResult[],
    context: PipelineContext,
    gateConfig: SecurityGateConfig
  ): Promise<void> {
    if (!gateConfig.artifacts.preserveReports) return;
    
    // In production, would generate actual artifact files
    console.log('📄 Generating security artifacts...');
    
    // Generate JSON report
    const report = {
      metadata: context,
      results,
      timestamp: Date.now(),
    };
    
    console.log(`💾 Security report generated: ${JSON.stringify(report, null, 2).length} bytes`);
  }

  private async sendNotifications(
    evaluation: any,
    gateConfig: SecurityGateConfig,
    context: PipelineContext
  ): Promise<void> {
    const { passed, blockers, warnings } = evaluation;
    
    let recipients: string[] = [];
    
    if (passed) {
      recipients = gateConfig.notifications.onSuccess;
    } else if (blockers.length > 0) {
      recipients = gateConfig.notifications.onFailure;
    } else if (warnings.length > 0) {
      recipients = gateConfig.notifications.onWarning;
    }
    
    if (recipients.length > 0) {
      console.log(`📧 Sending notifications to: ${recipients.join(', ')}`);
      
      // In production, would send actual notifications
      const message = passed 
        ? '✅ Security gate passed'
        : `❌ Security gate failed: ${blockers.length} blockers, ${warnings.length} warnings`;
      
      console.log(`📨 Notification: ${message}`);
    }
  }

  private calculateOverallRiskScore(results: SecurityScanResult[]): number {
    if (results.length === 0) return 0;
    
    const totalFindings = results.reduce((sum, r) => sum + r.metrics.totalIssues, 0);
    const criticalFindings = results.reduce((sum, r) => sum + r.metrics.criticalIssues, 0);
    const highFindings = results.reduce((sum, r) => sum + r.metrics.highIssues, 0);
    
    // Calculate weighted risk score (0-10)
    const riskScore = Math.min(10, 
      (criticalFindings * 3) + 
      (highFindings * 2) + 
      (totalFindings * 0.5)
    );
    
    return Math.round(riskScore * 10) / 10;
  }

  private generateRecommendations(results: SecurityScanResult[]): string[] {
    const recommendations = [];
    
    const failedScans = results.filter(r => r.status === 'failed');
    const criticalFindings = results.reduce((sum, r) => sum + r.metrics.criticalIssues, 0);
    const highFindings = results.reduce((sum, r) => sum + r.metrics.highIssues, 0);
    
    if (failedScans.length > 0) {
      recommendations.push(`🚨 Address ${failedScans.length} failed security scans`);
    }
    
    if (criticalFindings > 0) {
      recommendations.push(`🔴 Resolve ${criticalFindings} critical security issues immediately`);
    }
    
    if (highFindings > 0) {
      recommendations.push(`🟡 Address ${highFindings} high-severity security issues`);
    }
    
    // Add general recommendations
    recommendations.push('Enable automated security scanning in all environments');
    recommendations.push('Implement security training for development team');
    recommendations.push('Regular security reviews and updates');
    recommendations.push('Establish incident response procedures');
    
    return recommendations;
  }

  private severityToRiskScore(severity: string): number {
    switch (severity.toUpperCase()) {
      case 'CRITICAL': return 10;
      case 'HIGH': return 8;
      case 'MEDIUM': return 5;
      case 'LOW': return 2;
      default: return 1;
    }
  }

  private generateScanId(scanType: SecurityScanType, context: PipelineContext): string {
    return `${scanType.toLowerCase()}_${context.pipelineId}_${context.buildNumber}_${Date.now()}`;
  }

  private getDefaultConfig(): PipelineSecurityConfig {
    return {
      enabled: true,
      globalSettings: {
        timeout: 1800000, // 30 minutes
        parallelScans: true,
        failFast: false,
        continueOnWarning: true,
      },
      gates: {
        [PipelineEnvironment.DEVELOPMENT]: {
          environment: PipelineEnvironment.DEVELOPMENT,
          policy: SecurityGatePolicy.PERMISSIVE,
          enabledScans: [
            SecurityScanType.DEPENDENCY_AUDIT,
            SecurityScanType.SECRET_DETECTION,
          ],
          thresholds: {
            critical: { max: 5, action: 'warn' },
            high: { max: 10, action: 'warn' },
            medium: { max: 20, action: 'ignore' },
            low: { max: 50, action: 'ignore' },
          },
          exemptions: [],
          notifications: {
            onSuccess: [],
            onFailure: ['dev-team@company.com'],
            onWarning: [],
          },
          artifacts: {
            preserveReports: true,
            uploadToStorage: false,
            retentionDays: 7,
          },
        },
        [PipelineEnvironment.STAGING]: {
          environment: PipelineEnvironment.STAGING,
          policy: SecurityGatePolicy.MODERATE,
          enabledScans: [
            SecurityScanType.DEPENDENCY_AUDIT,
            SecurityScanType.VULNERABILITY_SCAN,
            SecurityScanType.LICENSE_COMPLIANCE,
            SecurityScanType.SECRET_DETECTION,
            SecurityScanType.STATIC_CODE_ANALYSIS,
          ],
          thresholds: {
            critical: { max: 0, action: 'block' },
            high: { max: 2, action: 'warn' },
            medium: { max: 10, action: 'warn' },
            low: { max: 30, action: 'ignore' },
          },
          exemptions: [],
          notifications: {
            onSuccess: [],
            onFailure: ['security-team@company.com', 'dev-team@company.com'],
            onWarning: ['dev-team@company.com'],
          },
          artifacts: {
            preserveReports: true,
            uploadToStorage: true,
            retentionDays: 30,
          },
        },
        [PipelineEnvironment.PRODUCTION]: {
          environment: PipelineEnvironment.PRODUCTION,
          policy: SecurityGatePolicy.STRICT,
          enabledScans: [
            SecurityScanType.DEPENDENCY_AUDIT,
            SecurityScanType.VULNERABILITY_SCAN,
            SecurityScanType.LICENSE_COMPLIANCE,
            SecurityScanType.SUPPLY_CHAIN_ANALYSIS,
            SecurityScanType.SBOM_GENERATION,
            SecurityScanType.SECRET_DETECTION,
            SecurityScanType.STATIC_CODE_ANALYSIS,
          ],
          thresholds: {
            critical: { max: 0, action: 'block' },
            high: { max: 0, action: 'block' },
            medium: { max: 3, action: 'warn' },
            low: { max: 10, action: 'warn' },
          },
          exemptions: [],
          notifications: {
            onSuccess: ['ops-team@company.com'],
            onFailure: ['security-team@company.com', 'ops-team@company.com', 'dev-team@company.com'],
            onWarning: ['security-team@company.com', 'dev-team@company.com'],
          },
          artifacts: {
            preserveReports: true,
            uploadToStorage: true,
            retentionDays: 365,
          },
        },
        [PipelineEnvironment.TEST]: {
          environment: PipelineEnvironment.TEST,
          policy: SecurityGatePolicy.MODERATE,
          enabledScans: [
            SecurityScanType.DEPENDENCY_AUDIT,
            SecurityScanType.VULNERABILITY_SCAN,
          ],
          thresholds: {
            critical: { max: 1, action: 'warn' },
            high: { max: 5, action: 'warn' },
            medium: { max: 15, action: 'ignore' },
            low: { max: 40, action: 'ignore' },
          },
          exemptions: [],
          notifications: {
            onSuccess: [],
            onFailure: ['dev-team@company.com'],
            onWarning: [],
          },
          artifacts: {
            preserveReports: true,
            uploadToStorage: false,
            retentionDays: 14,
          },
        },
      },
      integrations: {
        jira: {
          enabled: false,
          createTickets: false,
          project: 'SEC',
        },
        slack: {
          enabled: false,
          webhook: '',
          channels: ['#security-alerts'],
        },
        email: {
          enabled: true,
          recipients: ['security-team@company.com'],
        },
        securityCenter: {
          enabled: false,
          endpoint: '',
          apiKey: '',
        },
      },
      compliance: {
        requireSBOM: true,
        enforceSignatures: false,
        auditTrail: true,
        complianceFrameworks: ['SOC2', 'NIST'],
      },
    };
  }
}

// Global instance
export const cicdSecurity = CICDSecurityService.getInstance();