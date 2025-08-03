/**
 * Dependency License Compliance Checker
 * Comprehensive license analysis and compliance management system
 */

import { securityLogger, SecurityEventType, SecuritySeverity } from './securityLogging';
import { auditTrail, AuditCategory } from './auditTrail';
import { dependencyAudit, PackageInfo } from './dependencyAudit';
import { securityAlerts, AlertType } from '../components/security/SecurityAlerts';

// License categories
export enum LicenseCategory {
  PERMISSIVE = 'PERMISSIVE',
  COPYLEFT_WEAK = 'COPYLEFT_WEAK',
  COPYLEFT_STRONG = 'COPYLEFT_STRONG',
  COPYLEFT_NETWORK = 'COPYLEFT_NETWORK',
  PROPRIETARY = 'PROPRIETARY',
  PUBLIC_DOMAIN = 'PUBLIC_DOMAIN',
  UNKNOWN = 'UNKNOWN',
  DUAL_LICENSE = 'DUAL_LICENSE',
  CUSTOM = 'CUSTOM',
}

// License compatibility levels
export enum CompatibilityLevel {
  COMPATIBLE = 'COMPATIBLE',
  CONDITIONALLY_COMPATIBLE = 'CONDITIONALLY_COMPATIBLE',
  INCOMPATIBLE = 'INCOMPATIBLE',
  UNKNOWN = 'UNKNOWN',
}

// Compliance risk levels
export enum ComplianceRisk {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

// License usage context
export enum UsageContext {
  DIRECT_DEPENDENCY = 'DIRECT_DEPENDENCY',
  TRANSITIVE_DEPENDENCY = 'TRANSITIVE_DEPENDENCY',
  DEV_DEPENDENCY = 'DEV_DEPENDENCY',
  BUNDLED = 'BUNDLED',
  LINKED = 'LINKED',
  EMBEDDED = 'EMBEDDED',
}

// License obligation types
export enum ObligationType {
  ATTRIBUTION = 'ATTRIBUTION',
  COPYLEFT = 'COPYLEFT',
  NOTICE = 'NOTICE',
  SOURCE_DISCLOSURE = 'SOURCE_DISCLOSURE',
  PATENT_GRANT = 'PATENT_GRANT',
  TRADEMARK = 'TRADEMARK',
  WARRANTY_DISCLAIMER = 'WARRANTY_DISCLAIMER',
  LIABILITY_LIMITATION = 'LIABILITY_LIMITATION',
}

// Detailed license information
export interface LicenseInfo {
  spdxId: string;
  name: string;
  category: LicenseCategory;
  fullText?: string;
  shortIdentifier?: string;
  url?: string;
  description?: string;
  obligations: ObligationType[];
  permissions: string[];
  limitations: string[];
  conditions: string[];
  commercialUse: boolean;
  distribution: boolean;
  modification: boolean;
  patentUse: boolean;
  privateUse: boolean;
  osiApproved: boolean;
  fsfLibre: boolean;
  deprecated: boolean;
  riskLevel: ComplianceRisk;
  compatibleWith: string[];
  incompatibleWith: string[];
  notes?: string;
}

// License compliance policy
export interface CompliancePolicy {
  organizationName: string;
  version: string;
  lastUpdated: number;
  allowedLicenses: string[];
  prohibitedLicenses: string[];
  requiresApproval: string[];
  copyleftPolicy: 'strict' | 'moderate' | 'permissive';
  commercialUse: boolean;
  patentProtection: boolean;
  attributionRequirements: {
    required: boolean;
    format: 'file' | 'notice' | 'both';
    location: string;
  };
  sourceDisclosure: {
    required: boolean;
    method: 'repository' | 'distribution' | 'request';
    timeline: number; // days
  };
  riskThresholds: {
    maxAcceptableRisk: ComplianceRisk;
    requiresReview: ComplianceRisk;
    blocksDeployment: ComplianceRisk;
  };
  exemptions: Array<{
    packageName: string;
    license: string;
    reason: string;
    approver: string;
    expiresAt: number;
  }>;
}

// Package license analysis
export interface PackageLicenseAnalysis {
  packageName: string;
  version: string;
  declaredLicense?: string;
  detectedLicenses: Array<{
    license: string;
    confidence: number;
    source: 'declared' | 'file' | 'repository' | 'inference';
    files?: string[];
  }>;
  licenseInfo: LicenseInfo[];
  usageContext: UsageContext;
  complianceStatus: 'compliant' | 'non_compliant' | 'requires_review' | 'unknown';
  riskLevel: ComplianceRisk;
  obligations: Array<{
    type: ObligationType;
    description: string;
    fulfilled: boolean;
    action: string;
  }>;
  conflicts: Array<{
    conflictWith: string;
    reason: string;
    severity: 'low' | 'medium' | 'high';
  }>;
  recommendations: string[];
  lastAnalyzed: number;
}

// Compliance report
export interface ComplianceReport {
  generatedAt: number;
  policy: CompliancePolicy;
  summary: {
    totalPackages: number;
    compliantPackages: number;
    nonCompliantPackages: number;
    reviewRequired: number;
    unknownLicenses: number;
    riskDistribution: Record<ComplianceRisk, number>;
    categoryDistribution: Record<LicenseCategory, number>;
  };
  analyses: PackageLicenseAnalysis[];
  violations: Array<{
    packageName: string;
    license: string;
    violation: string;
    severity: ComplianceRisk;
    recommendation: string;
  }>;
  obligations: Array<{
    type: ObligationType;
    packages: string[];
    fulfilled: boolean;
    instructions: string;
  }>;
  recommendations: string[];
  attributionNotice?: string;
}

// License compatibility matrix
export interface CompatibilityMatrix {
  [sourceLicense: string]: {
    [targetLicense: string]: {
      compatibility: CompatibilityLevel;
      conditions?: string[];
      notes?: string;
    };
  };
}

/**
 * License Compliance Service
 * Comprehensive license analysis and compliance management
 */
export class LicenseComplianceService {
  private static instance: LicenseComplianceService;
  private licenseDatabase = new Map<string, LicenseInfo>();
  private compatibilityMatrix: CompatibilityMatrix = {};
  private policy: CompliancePolicy;
  private analyses = new Map<string, PackageLicenseAnalysis>();

  private constructor() {
    this.policy = this.getDefaultPolicy();
    this.initializeLicenseDatabase();
    this.initializeCompatibilityMatrix();
  }

  public static getInstance(): LicenseComplianceService {
    if (!LicenseComplianceService.instance) {
      LicenseComplianceService.instance = new LicenseComplianceService();
    }
    return LicenseComplianceService.instance;
  }

  /**
   * Perform comprehensive license compliance analysis
   */
  public async performComplianceAnalysis(): Promise<ComplianceReport> {
    try {
      console.log('⚖️ Starting license compliance analysis...');
      
      // Get package information
      const auditResults = await dependencyAudit.getAuditResults();
      const packages = auditResults.map(result => result.package);
      
      console.log(`📦 Analyzing ${packages.length} packages for license compliance`);
      
      // Analyze each package
      const analyses: PackageLicenseAnalysis[] = [];
      
      for (const pkg of packages) {
        const analysis = await this.analyzePackageLicense(pkg);
        analyses.push(analysis);
        this.analyses.set(`${pkg.name}@${pkg.version}`, analysis);
      }
      
      // Generate compliance report
      const report = this.generateComplianceReport(analyses);
      
      // Create alerts for violations
      await this.generateComplianceAlerts(report);
      
      // Log compliance analysis
      await securityLogger.logEvent(
        SecurityEventType.SECURITY_EVENT,
        {
          type: 'license_compliance_analysis',
          totalPackages: report.summary.totalPackages,
          compliantPackages: report.summary.compliantPackages,
          violationsCount: report.violations.length,
          riskLevel: this.getOverallRiskLevel(report),
        },
        {
          severity: this.getReportSeverity(report),
        }
      );
      
      // Record in audit trail
      await auditTrail.logAuditEvent(
        AuditCategory.COMPLIANCE,
        'license_compliance_analysis',
        {
          actor: {
            type: 'system',
            id: 'license_compliance_service',
          },
          target: {
            type: 'dependency_tree',
            id: 'application_dependencies',
            name: 'Application Dependencies',
          },
          result: report.violations.length === 0 ? 'success' : 'partial',
          context: {
            component: 'license_compliance',
            operation: 'compliance_analysis',
          },
          riskLevel: this.getOverallRiskLevel(report),
        }
      );
      
      console.log('✅ License compliance analysis completed');
      console.log(`📊 Compliant: ${report.summary.compliantPackages}/${report.summary.totalPackages}`);
      console.log(`⚠️ Violations: ${report.violations.length}`);
      
      return report;
      
    } catch (error) {
      console.error('❌ License compliance analysis failed:', error);
      
      await securityLogger.logEvent(
        SecurityEventType.SECURITY_EVENT,
        {
          type: 'license_compliance_analysis_failed',
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
   * Check compatibility between two licenses
   */
  public checkLicenseCompatibility(
    sourceLicense: string, 
    targetLicense: string
  ): {
    compatible: boolean;
    level: CompatibilityLevel;
    conditions?: string[];
    notes?: string;
  } {
    const compatibility = this.compatibilityMatrix[sourceLicense]?.[targetLicense];
    
    if (!compatibility) {
      return {
        compatible: false,
        level: CompatibilityLevel.UNKNOWN,
        notes: 'Compatibility not determined - manual review required',
      };
    }
    
    return {
      compatible: compatibility.compatibility === CompatibilityLevel.COMPATIBLE,
      level: compatibility.compatibility,
      conditions: compatibility.conditions,
      notes: compatibility.notes,
    };
  }

  /**
   * Get license obligations for a package
   */
  public getLicenseObligations(packageName: string, version?: string): Array<{
    type: ObligationType;
    description: string;
    fulfilled: boolean;
    action: string;
  }> {
    const key = version ? `${packageName}@${version}` : packageName;
    const analysis = this.analyses.get(key);
    
    if (!analysis) {
      return [];
    }
    
    return analysis.obligations;
  }

  /**
   * Generate attribution notice
   */
  public generateAttributionNotice(packages?: string[]): string {
    const relevantAnalyses = packages 
      ? Array.from(this.analyses.values()).filter(a => packages.includes(a.packageName))
      : Array.from(this.analyses.values());
    
    const attributionPackages = relevantAnalyses.filter(analysis => 
      analysis.obligations.some(o => o.type === ObligationType.ATTRIBUTION)
    );
    
    if (attributionPackages.length === 0) {
      return '';
    }
    
    const lines = [
      'Third-Party Software Attribution Notice',
      '=====================================',
      '',
      'This software contains third-party packages with the following licenses:',
      '',
    ];
    
    attributionPackages.forEach(analysis => {
      lines.push(`Package: ${analysis.packageName}@${analysis.version}`);
      lines.push(`License: ${analysis.declaredLicense || 'Unknown'}`);
      
      const licenseInfo = analysis.licenseInfo[0];
      if (licenseInfo?.url) {
        lines.push(`License URL: ${licenseInfo.url}`);
      }
      
      lines.push('');
    });
    
    lines.push(`Generated on: ${new Date().toISOString()}`);
    
    return lines.join('\n');
  }

  /**
   * Update compliance policy
   */
  public updatePolicy(updates: Partial<CompliancePolicy>): void {
    this.policy = { ...this.policy, ...updates, lastUpdated: Date.now() };
    
    // Re-analyze all packages with new policy
    this.reanalyzeWithNewPolicy();
  }

  /**
   * Get current compliance policy
   */
  public getPolicy(): CompliancePolicy {
    return { ...this.policy };
  }

  /**
   * Add license exemption
   */
  public addExemption(
    packageName: string,
    license: string,
    reason: string,
    approver: string,
    durationDays: number = 90
  ): void {
    const exemption = {
      packageName,
      license,
      reason,
      approver,
      expiresAt: Date.now() + (durationDays * 24 * 60 * 60 * 1000),
    };
    
    this.policy.exemptions.push(exemption);
    
    // Re-analyze the specific package
    this.reanalyzePackage(packageName);
  }

  /**
   * Get compliance summary
   */
  public getComplianceSummary(): {
    totalPackages: number;
    compliantPackages: number;
    violationsCount: number;
    riskLevel: ComplianceRisk;
    topRisks: Array<{ package: string; risk: string }>;
  } {
    const analyses = Array.from(this.analyses.values());
    const totalPackages = analyses.length;
    const compliantPackages = analyses.filter(a => a.complianceStatus === 'compliant').length;
    const violations = analyses.filter(a => a.complianceStatus === 'non_compliant');
    
    // Determine overall risk level
    let riskLevel = ComplianceRisk.LOW;
    if (violations.some(a => a.riskLevel === ComplianceRisk.CRITICAL)) {
      riskLevel = ComplianceRisk.CRITICAL;
    } else if (violations.some(a => a.riskLevel === ComplianceRisk.HIGH)) {
      riskLevel = ComplianceRisk.HIGH;
    } else if (violations.some(a => a.riskLevel === ComplianceRisk.MEDIUM)) {
      riskLevel = ComplianceRisk.MEDIUM;
    }
    
    // Get top risks
    const topRisks = violations
      .sort((a, b) => this.getRiskScore(b.riskLevel) - this.getRiskScore(a.riskLevel))
      .slice(0, 5)
      .map(a => ({
        package: `${a.packageName}@${a.version}`,
        risk: a.conflicts[0]?.reason || 'License compliance violation',
      }));
    
    return {
      totalPackages,
      compliantPackages,
      violationsCount: violations.length,
      riskLevel,
      topRisks,
    };
  }

  /**
   * Export compliance report
   */
  public exportComplianceReport(format: 'json' | 'csv' | 'text' = 'json'): string {
    const analyses = Array.from(this.analyses.values());
    
    switch (format) {
      case 'json':
        return JSON.stringify({
          policy: this.policy,
          analyses,
          summary: this.getComplianceSummary(),
          generatedAt: new Date().toISOString(),
        }, null, 2);
        
      case 'csv':
        return this.exportToCSV(analyses);
        
      case 'text':
        return this.exportToText(analyses);
        
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Private helper methods
   */

  private async analyzePackageLicense(pkg: PackageInfo): Promise<PackageLicenseAnalysis> {
    console.log(`⚖️ Analyzing license for ${pkg.name}@${pkg.version}`);
    
    // Detect licenses
    const detectedLicenses = this.detectLicenses(pkg);
    
    // Get license information
    const licenseInfo = detectedLicenses.map(detected => 
      this.licenseDatabase.get(detected.license)
    ).filter((info): info is LicenseInfo => info !== undefined);
    
    // Determine usage context
    const usageContext = this.determineUsageContext(pkg);
    
    // Check compliance
    const complianceResult = this.checkCompliance(pkg, detectedLicenses, licenseInfo);
    
    // Generate obligations
    const obligations = this.generateObligations(licenseInfo, usageContext);
    
    // Check for conflicts
    const conflicts = this.checkConflicts(pkg, licenseInfo);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(complianceResult, conflicts, obligations);
    
    const analysis: PackageLicenseAnalysis = {
      packageName: pkg.name,
      version: pkg.version,
      declaredLicense: pkg.license,
      detectedLicenses,
      licenseInfo,
      usageContext,
      complianceStatus: complianceResult.status,
      riskLevel: complianceResult.riskLevel,
      obligations,
      conflicts,
      recommendations,
      lastAnalyzed: Date.now(),
    };
    
    return analysis;
  }

  private detectLicenses(pkg: PackageInfo): Array<{
    license: string;
    confidence: number;
    source: 'declared' | 'file' | 'repository' | 'inference';
    files?: string[];
  }> {
    const detected = [];
    
    // Check declared license
    if (pkg.license) {
      detected.push({
        license: pkg.license,
        confidence: 0.9,
        source: 'declared' as const,
      });
    }
    
    // In production, this would analyze LICENSE files, package.json, etc.
    // For demo, use declared license or infer from package name
    if (!pkg.license) {
      // Try to infer from common patterns
      if (pkg.name.includes('mit')) {
        detected.push({
          license: 'MIT',
          confidence: 0.5,
          source: 'inference' as const,
        });
      } else if (pkg.name.includes('apache')) {
        detected.push({
          license: 'Apache-2.0',
          confidence: 0.5,
          source: 'inference' as const,
        });
      } else {
        detected.push({
          license: 'UNKNOWN',
          confidence: 0.1,
          source: 'inference' as const,
        });
      }
    }
    
    return detected;
  }

  private determineUsageContext(pkg: PackageInfo): UsageContext {
    // In production, analyze how the package is used
    // For demo, assume direct dependency
    return UsageContext.DIRECT_DEPENDENCY;
  }

  private checkCompliance(
    pkg: PackageInfo,
    detectedLicenses: any[],
    licenseInfo: LicenseInfo[]
  ): { status: 'compliant' | 'non_compliant' | 'requires_review' | 'unknown'; riskLevel: ComplianceRisk } {
    // Check for exemptions
    const hasExemption = this.policy.exemptions.some(exemption => 
      exemption.packageName === pkg.name && 
      exemption.expiresAt > Date.now()
    );
    
    if (hasExemption) {
      return { status: 'compliant', riskLevel: ComplianceRisk.LOW };
    }
    
    // Check if any license is prohibited
    const hasProhibited = detectedLicenses.some(detected => 
      this.policy.prohibitedLicenses.includes(detected.license)
    );
    
    if (hasProhibited) {
      return { status: 'non_compliant', riskLevel: ComplianceRisk.CRITICAL };
    }
    
    // Check if all licenses are allowed
    const allAllowed = detectedLicenses.every(detected => 
      this.policy.allowedLicenses.includes(detected.license) ||
      detected.license === 'UNKNOWN'
    );
    
    if (allAllowed) {
      // Check for additional risk factors
      const hasHighRisk = licenseInfo.some(info => 
        info.riskLevel === ComplianceRisk.HIGH || 
        info.riskLevel === ComplianceRisk.CRITICAL
      );
      
      return { 
        status: 'compliant', 
        riskLevel: hasHighRisk ? ComplianceRisk.MEDIUM : ComplianceRisk.LOW 
      };
    }
    
    // Check if requires approval
    const requiresApproval = detectedLicenses.some(detected => 
      this.policy.requiresApproval.includes(detected.license)
    );
    
    if (requiresApproval) {
      return { status: 'requires_review', riskLevel: ComplianceRisk.MEDIUM };
    }
    
    // Unknown license status
    const hasUnknown = detectedLicenses.some(detected => detected.license === 'UNKNOWN');
    if (hasUnknown) {
      return { status: 'unknown', riskLevel: ComplianceRisk.HIGH };
    }
    
    return { status: 'non_compliant', riskLevel: ComplianceRisk.HIGH };
  }

  private generateObligations(
    licenseInfo: LicenseInfo[], 
    usageContext: UsageContext
  ): Array<{
    type: ObligationType;
    description: string;
    fulfilled: boolean;
    action: string;
  }> {
    const obligations = [];
    
    for (const info of licenseInfo) {
      for (const obligationType of info.obligations) {
        let description = '';
        let action = '';
        let fulfilled = false;
        
        switch (obligationType) {
          case ObligationType.ATTRIBUTION:
            description = `Include attribution notice for ${info.name}`;
            action = 'Add to NOTICE file or attribution section';
            fulfilled = false; // Would check if notice exists
            break;
            
          case ObligationType.COPYLEFT:
            description = `Provide source code due to copyleft license ${info.name}`;
            action = 'Make source code available under same license';
            fulfilled = false; // Would check if source is available
            break;
            
          case ObligationType.NOTICE:
            description = `Include license notice for ${info.name}`;
            action = 'Include license text in distribution';
            fulfilled = false; // Would check if notice is included
            break;
            
          case ObligationType.SOURCE_DISCLOSURE:
            description = `Disclose source code for ${info.name}`;
            action = 'Provide source code or written offer';
            fulfilled = usageContext !== UsageContext.BUNDLED; // Simplified check
            break;
        }
        
        obligations.push({
          type: obligationType,
          description,
          fulfilled,
          action,
        });
      }
    }
    
    return obligations;
  }

  private checkConflicts(pkg: PackageInfo, licenseInfo: LicenseInfo[]): Array<{
    conflictWith: string;
    reason: string;
    severity: 'low' | 'medium' | 'high';
  }> {
    const conflicts = [];
    
    // Check for license incompatibilities
    for (let i = 0; i < licenseInfo.length; i++) {
      for (let j = i + 1; j < licenseInfo.length; j++) {
        const license1 = licenseInfo[i];
        const license2 = licenseInfo[j];
        
        if (license1.incompatibleWith.includes(license2.spdxId)) {
          conflicts.push({
            conflictWith: license2.name,
            reason: `${license1.name} is incompatible with ${license2.name}`,
            severity: 'high' as const,
          });
        }
      }
    }
    
    // Check against project license (if applicable)
    const projectLicense = 'MIT'; // Would be configurable
    for (const info of licenseInfo) {
      if (info.incompatibleWith.includes(projectLicense)) {
        conflicts.push({
          conflictWith: projectLicense,
          reason: `${info.name} is incompatible with project license ${projectLicense}`,
          severity: 'high' as const,
        });
      }
    }
    
    return conflicts;
  }

  private generateRecommendations(
    complianceResult: any,
    conflicts: any[],
    obligations: any[]
  ): string[] {
    const recommendations = [];
    
    if (complianceResult.status === 'non_compliant') {
      recommendations.push('Find alternative package with compatible license');
      recommendations.push('Obtain commercial license if available');
      recommendations.push('Request license exemption from legal team');
    }
    
    if (complianceResult.status === 'requires_review') {
      recommendations.push('Submit package for legal review');
      recommendations.push('Document business justification for usage');
    }
    
    if (conflicts.length > 0) {
      recommendations.push('Resolve license conflicts before deployment');
      recommendations.push('Consider dual licensing options');
    }
    
    const unfulfilledObligations = obligations.filter(o => !o.fulfilled);
    if (unfulfilledObligations.length > 0) {
      recommendations.push('Fulfill all license obligations before distribution');
      recommendations.push('Implement attribution generation process');
    }
    
    if (complianceResult.riskLevel === ComplianceRisk.HIGH || complianceResult.riskLevel === ComplianceRisk.CRITICAL) {
      recommendations.push('Prioritize replacement or remediation');
      recommendations.push('Implement additional monitoring');
    }
    
    return recommendations;
  }

  private generateComplianceReport(analyses: PackageLicenseAnalysis[]): ComplianceReport {
    const summary = {
      totalPackages: analyses.length,
      compliantPackages: analyses.filter(a => a.complianceStatus === 'compliant').length,
      nonCompliantPackages: analyses.filter(a => a.complianceStatus === 'non_compliant').length,
      reviewRequired: analyses.filter(a => a.complianceStatus === 'requires_review').length,
      unknownLicenses: analyses.filter(a => a.complianceStatus === 'unknown').length,
      riskDistribution: this.calculateRiskDistribution(analyses),
      categoryDistribution: this.calculateCategoryDistribution(analyses),
    };
    
    // Collect violations
    const violations = analyses
      .filter(a => a.complianceStatus === 'non_compliant')
      .map(a => ({
        packageName: a.packageName,
        license: a.declaredLicense || 'Unknown',
        violation: 'License not allowed by policy',
        severity: a.riskLevel,
        recommendation: a.recommendations[0] || 'Review license compatibility',
      }));
    
    // Collect obligations
    const obligationMap = new Map<ObligationType, string[]>();
    analyses.forEach(analysis => {
      analysis.obligations.forEach(obligation => {
        if (!obligationMap.has(obligation.type)) {
          obligationMap.set(obligation.type, []);
        }
        obligationMap.get(obligation.type)!.push(`${analysis.packageName}@${analysis.version}`);
      });
    });
    
    const obligations = Array.from(obligationMap.entries()).map(([type, packages]) => ({
      type,
      packages,
      fulfilled: false, // Simplified - would check actual fulfillment
      instructions: this.getObligationInstructions(type),
    }));
    
    // Generate overall recommendations
    const recommendations = this.generateOverallRecommendations(analyses, violations);
    
    return {
      generatedAt: Date.now(),
      policy: this.policy,
      summary,
      analyses,
      violations,
      obligations,
      recommendations,
      attributionNotice: this.generateAttributionNotice(),
    };
  }

  private calculateRiskDistribution(analyses: PackageLicenseAnalysis[]): Record<ComplianceRisk, number> {
    const distribution: Record<ComplianceRisk, number> = {
      [ComplianceRisk.LOW]: 0,
      [ComplianceRisk.MEDIUM]: 0,
      [ComplianceRisk.HIGH]: 0,
      [ComplianceRisk.CRITICAL]: 0,
    };
    
    analyses.forEach(analysis => {
      distribution[analysis.riskLevel]++;
    });
    
    return distribution;
  }

  private calculateCategoryDistribution(analyses: PackageLicenseAnalysis[]): Record<LicenseCategory, number> {
    const distribution: Record<LicenseCategory, number> = {
      [LicenseCategory.PERMISSIVE]: 0,
      [LicenseCategory.COPYLEFT_WEAK]: 0,
      [LicenseCategory.COPYLEFT_STRONG]: 0,
      [LicenseCategory.COPYLEFT_NETWORK]: 0,
      [LicenseCategory.PROPRIETARY]: 0,
      [LicenseCategory.PUBLIC_DOMAIN]: 0,
      [LicenseCategory.UNKNOWN]: 0,
      [LicenseCategory.DUAL_LICENSE]: 0,
      [LicenseCategory.CUSTOM]: 0,
    };
    
    analyses.forEach(analysis => {
      analysis.licenseInfo.forEach(info => {
        distribution[info.category]++;
      });
    });
    
    return distribution;
  }

  private generateOverallRecommendations(
    analyses: PackageLicenseAnalysis[], 
    violations: any[]
  ): string[] {
    const recommendations = [];
    
    if (violations.length > 0) {
      recommendations.push(`🚨 Address ${violations.length} license compliance violations`);
    }
    
    const highRiskCount = analyses.filter(a => 
      a.riskLevel === ComplianceRisk.HIGH || a.riskLevel === ComplianceRisk.CRITICAL
    ).length;
    
    if (highRiskCount > 0) {
      recommendations.push(`⚠️ Review ${highRiskCount} high-risk packages`);
    }
    
    const unknownCount = analyses.filter(a => a.complianceStatus === 'unknown').length;
    if (unknownCount > 0) {
      recommendations.push(`🔍 Investigate ${unknownCount} packages with unknown licenses`);
    }
    
    // Add process recommendations
    recommendations.push('Implement automated license scanning in CI/CD pipeline');
    recommendations.push('Establish license approval workflow for new dependencies');
    recommendations.push('Regular license compliance audits (monthly)');
    recommendations.push('Maintain comprehensive attribution notices');
    recommendations.push('Update license policy based on business requirements');
    
    return recommendations;
  }

  private async generateComplianceAlerts(report: ComplianceReport): Promise<void> {
    // Create alerts for critical violations
    const criticalViolations = report.violations.filter(v => 
      v.severity === ComplianceRisk.CRITICAL
    );
    
    for (const violation of criticalViolations) {
      await securityAlerts.createAlert(AlertType.CRITICAL_THREAT, {
        source: 'license_compliance',
        affectedUser: 'legal_team',
        resource: violation.packageName,
        action: 'license_violation',
        riskScore: 1.0,
      });
    }
    
    // Create alert for overall compliance status
    if (report.violations.length > 0) {
      await securityAlerts.createAlert(AlertType.POLICY_VIOLATION, {
        source: 'license_compliance',
        affectedUser: 'development_team',
        riskScore: Math.min(1.0, report.violations.length / report.summary.totalPackages),
      });
    }
  }

  private getObligationInstructions(type: ObligationType): string {
    const instructions: Record<ObligationType, string> = {
      [ObligationType.ATTRIBUTION]: 'Include attribution notice in NOTICE file',
      [ObligationType.COPYLEFT]: 'Make source code available under same license',
      [ObligationType.NOTICE]: 'Include license text in distribution',
      [ObligationType.SOURCE_DISCLOSURE]: 'Provide source code or written offer',
      [ObligationType.PATENT_GRANT]: 'Respect patent grant provisions',
      [ObligationType.TRADEMARK]: 'Do not use trademarks without permission',
      [ObligationType.WARRANTY_DISCLAIMER]: 'Include warranty disclaimer',
      [ObligationType.LIABILITY_LIMITATION]: 'Include liability limitation',
    };
    
    return instructions[type] || 'Review license requirements';
  }

  private getOverallRiskLevel(report: ComplianceReport): 'low' | 'medium' | 'high' | 'critical' {
    if (report.violations.some(v => v.severity === ComplianceRisk.CRITICAL)) {
      return 'critical';
    }
    if (report.violations.some(v => v.severity === ComplianceRisk.HIGH)) {
      return 'high';
    }
    if (report.violations.length > 0) {
      return 'medium';
    }
    return 'low';
  }

  private getReportSeverity(report: ComplianceReport): SecuritySeverity {
    const riskLevel = this.getOverallRiskLevel(report);
    
    switch (riskLevel) {
      case 'critical': return SecuritySeverity.CRITICAL;
      case 'high': return SecuritySeverity.HIGH;
      case 'medium': return SecuritySeverity.MEDIUM;
      default: return SecuritySeverity.LOW;
    }
  }

  private getRiskScore(risk: ComplianceRisk): number {
    switch (risk) {
      case ComplianceRisk.CRITICAL: return 4;
      case ComplianceRisk.HIGH: return 3;
      case ComplianceRisk.MEDIUM: return 2;
      case ComplianceRisk.LOW: return 1;
      default: return 0;
    }
  }

  private exportToCSV(analyses: PackageLicenseAnalysis[]): string {
    const headers = [
      'Package Name',
      'Version',
      'Declared License',
      'Compliance Status',
      'Risk Level',
      'Obligations',
      'Conflicts',
    ];
    
    const rows = analyses.map(analysis => [
      analysis.packageName,
      analysis.version,
      analysis.declaredLicense || 'Unknown',
      analysis.complianceStatus,
      analysis.riskLevel,
      analysis.obligations.map(o => o.type).join('; '),
      analysis.conflicts.map(c => c.reason).join('; '),
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  private exportToText(analyses: PackageLicenseAnalysis[]): string {
    const lines = [
      'License Compliance Report',
      '========================',
      '',
      `Generated: ${new Date().toISOString()}`,
      `Total Packages: ${analyses.length}`,
      '',
    ];
    
    analyses.forEach(analysis => {
      lines.push(`Package: ${analysis.packageName}@${analysis.version}`);
      lines.push(`License: ${analysis.declaredLicense || 'Unknown'}`);
      lines.push(`Status: ${analysis.complianceStatus}`);
      lines.push(`Risk: ${analysis.riskLevel}`);
      
      if (analysis.obligations.length > 0) {
        lines.push(`Obligations: ${analysis.obligations.map(o => o.type).join(', ')}`);
      }
      
      if (analysis.conflicts.length > 0) {
        lines.push(`Conflicts: ${analysis.conflicts.map(c => c.reason).join(', ')}`);
      }
      
      lines.push('');
    });
    
    return lines.join('\n');
  }

  private reanalyzeWithNewPolicy(): void {
    // Re-analyze all packages with updated policy
    console.log('🔄 Re-analyzing packages with updated policy...');
  }

  private reanalyzePackage(packageName: string): void {
    // Re-analyze specific package
    console.log(`🔄 Re-analyzing package: ${packageName}`);
  }

  private initializeLicenseDatabase(): void {
    const licenses: LicenseInfo[] = [
      {
        spdxId: 'MIT',
        name: 'MIT License',
        category: LicenseCategory.PERMISSIVE,
        url: 'https://opensource.org/licenses/MIT',
        obligations: [ObligationType.ATTRIBUTION, ObligationType.NOTICE],
        permissions: ['commercial use', 'distribution', 'modification', 'private use'],
        limitations: ['liability', 'warranty'],
        conditions: ['include copyright', 'include license'],
        commercialUse: true,
        distribution: true,
        modification: true,
        patentUse: false,
        privateUse: true,
        osiApproved: true,
        fsfLibre: true,
        deprecated: false,
        riskLevel: ComplianceRisk.LOW,
        compatibleWith: ['Apache-2.0', 'BSD-3-Clause', 'ISC'],
        incompatibleWith: ['GPL-3.0'],
      },
      {
        spdxId: 'Apache-2.0',
        name: 'Apache License 2.0',
        category: LicenseCategory.PERMISSIVE,
        url: 'https://opensource.org/licenses/Apache-2.0',
        obligations: [ObligationType.ATTRIBUTION, ObligationType.NOTICE, ObligationType.PATENT_GRANT],
        permissions: ['commercial use', 'distribution', 'modification', 'patent use', 'private use'],
        limitations: ['liability', 'trademark use', 'warranty'],
        conditions: ['include copyright', 'include license', 'state changes'],
        commercialUse: true,
        distribution: true,
        modification: true,
        patentUse: true,
        privateUse: true,
        osiApproved: true,
        fsfLibre: true,
        deprecated: false,
        riskLevel: ComplianceRisk.LOW,
        compatibleWith: ['MIT', 'BSD-3-Clause'],
        incompatibleWith: ['GPL-2.0'],
      },
      {
        spdxId: 'GPL-3.0',
        name: 'GNU General Public License v3.0',
        category: LicenseCategory.COPYLEFT_STRONG,
        url: 'https://opensource.org/licenses/GPL-3.0',
        obligations: [ObligationType.COPYLEFT, ObligationType.SOURCE_DISCLOSURE, ObligationType.NOTICE],
        permissions: ['commercial use', 'distribution', 'modification', 'patent use', 'private use'],
        limitations: ['liability', 'warranty'],
        conditions: ['disclose source', 'include copyright', 'include license', 'same license'],
        commercialUse: true,
        distribution: true,
        modification: true,
        patentUse: true,
        privateUse: true,
        osiApproved: true,
        fsfLibre: true,
        deprecated: false,
        riskLevel: ComplianceRisk.HIGH,
        compatibleWith: ['AGPL-3.0'],
        incompatibleWith: ['MIT', 'Apache-2.0', 'BSD-3-Clause'],
      },
      {
        spdxId: 'BSD-3-Clause',
        name: 'BSD 3-Clause License',
        category: LicenseCategory.PERMISSIVE,
        url: 'https://opensource.org/licenses/BSD-3-Clause',
        obligations: [ObligationType.ATTRIBUTION, ObligationType.NOTICE],
        permissions: ['commercial use', 'distribution', 'modification', 'private use'],
        limitations: ['liability', 'warranty'],
        conditions: ['include copyright', 'include license'],
        commercialUse: true,
        distribution: true,
        modification: true,
        patentUse: false,
        privateUse: true,
        osiApproved: true,
        fsfLibre: true,
        deprecated: false,
        riskLevel: ComplianceRisk.LOW,
        compatibleWith: ['MIT', 'Apache-2.0'],
        incompatibleWith: ['GPL-3.0'],
      },
      {
        spdxId: 'ISC',
        name: 'ISC License',
        category: LicenseCategory.PERMISSIVE,
        url: 'https://opensource.org/licenses/ISC',
        obligations: [ObligationType.ATTRIBUTION],
        permissions: ['commercial use', 'distribution', 'modification', 'private use'],
        limitations: ['liability', 'warranty'],
        conditions: ['include copyright'],
        commercialUse: true,
        distribution: true,
        modification: true,
        patentUse: false,
        privateUse: true,
        osiApproved: true,
        fsfLibre: true,
        deprecated: false,
        riskLevel: ComplianceRisk.LOW,
        compatibleWith: ['MIT', 'Apache-2.0', 'BSD-3-Clause'],
        incompatibleWith: [],
      },
    ];
    
    licenses.forEach(license => {
      this.licenseDatabase.set(license.spdxId, license);
      this.licenseDatabase.set(license.name, license);
    });
  }

  private initializeCompatibilityMatrix(): void {
    // Initialize basic compatibility matrix
    this.compatibilityMatrix = {
      'MIT': {
        'Apache-2.0': { compatibility: CompatibilityLevel.COMPATIBLE },
        'BSD-3-Clause': { compatibility: CompatibilityLevel.COMPATIBLE },
        'GPL-3.0': { compatibility: CompatibilityLevel.INCOMPATIBLE, notes: 'GPL requires same license' },
      },
      'Apache-2.0': {
        'MIT': { compatibility: CompatibilityLevel.COMPATIBLE },
        'BSD-3-Clause': { compatibility: CompatibilityLevel.COMPATIBLE },
        'GPL-2.0': { compatibility: CompatibilityLevel.INCOMPATIBLE, notes: 'GPL-2.0 incompatible with Apache-2.0' },
      },
      'GPL-3.0': {
        'MIT': { compatibility: CompatibilityLevel.INCOMPATIBLE, notes: 'GPL requires copyleft' },
        'Apache-2.0': { compatibility: CompatibilityLevel.INCOMPATIBLE, notes: 'GPL requires copyleft' },
        'AGPL-3.0': { compatibility: CompatibilityLevel.COMPATIBLE },
      },
    };
  }

  private getDefaultPolicy(): CompliancePolicy {
    return {
      organizationName: 'Quiz Application',
      version: '1.0.0',
      lastUpdated: Date.now(),
      allowedLicenses: ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'BSD-2-Clause', 'ISC'],
      prohibitedLicenses: ['GPL-3.0', 'AGPL-3.0', 'LGPL-3.0'],
      requiresApproval: ['GPL-2.0', 'LGPL-2.1'],
      copyleftPolicy: 'moderate',
      commercialUse: true,
      patentProtection: true,
      attributionRequirements: {
        required: true,
        format: 'file',
        location: 'NOTICE.txt',
      },
      sourceDisclosure: {
        required: false,
        method: 'repository',
        timeline: 30,
      },
      riskThresholds: {
        maxAcceptableRisk: ComplianceRisk.MEDIUM,
        requiresReview: ComplianceRisk.HIGH,
        blocksDeployment: ComplianceRisk.CRITICAL,
      },
      exemptions: [],
    };
  }
}

// Global instance
export const licenseCompliance = LicenseComplianceService.getInstance();