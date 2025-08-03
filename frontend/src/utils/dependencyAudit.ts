/**
 * Dependency Audit System
 * Comprehensive vulnerability scanning and supply chain security monitoring
 */

import { securityLogger, SecurityEventType, SecuritySeverity } from './securityLogging';
import { auditTrail, AuditCategory } from './auditTrail';

// Vulnerability severity levels following CVSS
export enum VulnerabilitySeverity {
  NONE = 'NONE',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

// Package information structure
export interface PackageInfo {
  name: string;
  version: string;
  description?: string;
  license?: string;
  homepage?: string;
  repository?: string;
  author?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  bundledDependencies?: string[];
  engines?: Record<string, string>;
  os?: string[];
  cpu?: string[];
  integrity?: string;
  resolved?: string;
  shasum?: string;
  tarball?: string;
  fileCount?: number;
  unpackedSize?: number;
  npm?: {
    signature?: string;
    fileCount?: number;
    unpackedSize?: number;
  };
}

// Vulnerability information
export interface Vulnerability {
  id: string; // CVE ID or advisory ID
  title: string;
  description: string;
  severity: VulnerabilitySeverity;
  cvssScore?: number;
  cvssVector?: string;
  cwe?: string[];
  references?: string[];
  publishedDate: string;
  modifiedDate?: string;
  affectedVersions: string;
  patchedVersions?: string;
  vulnerable_versions?: string;
  patched_versions?: string;
  recommendation: string;
  overview?: string;
  cves?: string[];
  access?: string;
  severity_source?: string;
  module_name?: string;
  findings?: Array<{
    version: string;
    paths: string[];
  }>;
}

// Package audit result
export interface PackageAuditResult {
  package: PackageInfo;
  vulnerabilities: Vulnerability[];
  riskScore: number;
  recommendedActions: string[];
  isDirectDependency: boolean;
  dependencyPath: string[];
  lastUpdated: string;
  maintenanceScore: number;
  licenseIssues: string[];
  deprecationWarnings: string[];
}

// Audit summary
export interface AuditSummary {
  totalPackages: number;
  vulnerablePackages: number;
  totalVulnerabilities: number;
  severityBreakdown: Record<VulnerabilitySeverity, number>;
  riskScore: number;
  recommendations: string[];
  compliance: {
    licenses: {
      compliant: boolean;
      issues: string[];
      allowedLicenses: string[];
      restrictedLicenses: string[];
    };
    security: {
      compliant: boolean;
      criticalVulns: number;
      highVulns: number;
      acceptableRisk: boolean;
    };
    maintenance: {
      outdatedPackages: number;
      deprecatedPackages: number;
      averageAge: number; // days
    };
  };
  auditDate: string;
  nextAuditDue: string;
}

// Supply chain risk assessment
export interface SupplyChainRisk {
  packageName: string;
  version: string;
  riskFactors: {
    maintainerTrust: number; // 0-1 score
    projectMaturity: number; // 0-1 score
    updateFrequency: number; // 0-1 score
    communitySupport: number; // 0-1 score
    securityHistory: number; // 0-1 score
    packagePopularity: number; // 0-1 score
  };
  overallRiskScore: number;
  recommendations: string[];
  trustIndicators: string[];
  warningFlags: string[];
}

// License compliance configuration
export interface LicenseConfig {
  allowedLicenses: string[];
  restrictedLicenses: string[];
  requireApproval: string[];
  copyleftPolicy: 'strict' | 'moderate' | 'permissive';
  commercialUseRequired: boolean;
  attributionRequired: boolean;
}

/**
 * Dependency Audit Service
 * Comprehensive dependency scanning and vulnerability management
 */
export class DependencyAuditService {
  private static instance: DependencyAuditService;
  private auditCache = new Map<string, PackageAuditResult>();
  private vulnerabilityDatabase = new Map<string, Vulnerability[]>();
  private licenseConfig: LicenseConfig;
  private lastAuditTime = 0;
  private readonly auditInterval = 24 * 60 * 60 * 1000; // 24 hours

  private constructor() {
    this.licenseConfig = this.getDefaultLicenseConfig();
    this.initializeVulnerabilityDatabase();
    this.startPeriodicAudits();
  }

  public static getInstance(): DependencyAuditService {
    if (!DependencyAuditService.instance) {
      DependencyAuditService.instance = new DependencyAuditService();
    }
    return DependencyAuditService.instance;
  }

  /**
   * Perform comprehensive dependency audit
   */
  public async performFullAudit(): Promise<AuditSummary> {
    try {
      console.log('🔍 Starting comprehensive dependency audit...');
      
      // Get package information
      const packages = await this.getInstalledPackages();
      console.log(`📦 Found ${packages.length} packages to audit`);
      
      // Audit each package
      const auditResults: PackageAuditResult[] = [];
      let totalVulnerabilities = 0;
      const severityBreakdown: Record<VulnerabilitySeverity, number> = {
        [VulnerabilitySeverity.NONE]: 0,
        [VulnerabilitySeverity.LOW]: 0,
        [VulnerabilitySeverity.MEDIUM]: 0,
        [VulnerabilitySeverity.HIGH]: 0,
        [VulnerabilitySeverity.CRITICAL]: 0,
      };

      for (const pkg of packages) {
        const result = await this.auditPackage(pkg);
        auditResults.push(result);
        
        totalVulnerabilities += result.vulnerabilities.length;
        result.vulnerabilities.forEach(vuln => {
          severityBreakdown[vuln.severity]++;
        });
        
        // Cache result
        this.auditCache.set(`${pkg.name}@${pkg.version}`, result);
      }

      // Calculate risk score
      const riskScore = this.calculateOverallRiskScore(auditResults);
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(auditResults);
      
      // Check compliance
      const compliance = await this.checkCompliance(auditResults);
      
      const summary: AuditSummary = {
        totalPackages: packages.length,
        vulnerablePackages: auditResults.filter(r => r.vulnerabilities.length > 0).length,
        totalVulnerabilities,
        severityBreakdown,
        riskScore,
        recommendations,
        compliance,
        auditDate: new Date().toISOString(),
        nextAuditDue: new Date(Date.now() + this.auditInterval).toISOString(),
      };

      // Log audit completion
      await securityLogger.logEvent(
        SecurityEventType.SECURITY_EVENT,
        {
          type: 'dependency_audit_completed',
          summary,
          criticalVulns: severityBreakdown[VulnerabilitySeverity.CRITICAL],
          highVulns: severityBreakdown[VulnerabilitySeverity.HIGH],
        },
        {
          severity: this.getSeverityFromRisk(riskScore),
        }
      );

      // Record in audit trail
      await auditTrail.logAuditEvent(
        AuditCategory.SECURITY_EVENT,
        'dependency_audit',
        {
          actor: {
            type: 'system',
            id: 'dependency_audit_service',
          },
          target: {
            type: 'dependency_tree',
            id: 'application_dependencies',
            name: 'Application Dependencies',
          },
          result: 'success',
          context: {
            component: 'dependency_audit',
            operation: 'full_audit',
          },
          riskLevel: this.getRiskLevelFromScore(riskScore),
        }
      );

      this.lastAuditTime = Date.now();
      
      console.log('✅ Dependency audit completed successfully');
      console.log(`📊 Risk Score: ${riskScore.toFixed(2)}/10`);
      console.log(`🚨 Critical: ${severityBreakdown[VulnerabilitySeverity.CRITICAL]}, High: ${severityBreakdown[VulnerabilitySeverity.HIGH]}`);
      
      return summary;
      
    } catch (error) {
      console.error('❌ Dependency audit failed:', error);
      
      await securityLogger.logEvent(
        SecurityEventType.SECURITY_EVENT,
        {
          type: 'dependency_audit_failed',
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
   * Audit a specific package
   */
  private async auditPackage(pkg: PackageInfo): Promise<PackageAuditResult> {
    // Check cache first
    const cacheKey = `${pkg.name}@${pkg.version}`;
    const cached = this.auditCache.get(cacheKey);
    if (cached && Date.now() - new Date(cached.lastUpdated).getTime() < 3600000) {
      return cached;
    }

    // Get vulnerabilities for this package
    const vulnerabilities = await this.getPackageVulnerabilities(pkg);
    
    // Calculate risk score
    const riskScore = this.calculatePackageRiskScore(pkg, vulnerabilities);
    
    // Generate recommendations
    const recommendedActions = this.generatePackageRecommendations(pkg, vulnerabilities);
    
    // Check maintenance score
    const maintenanceScore = await this.calculateMaintenanceScore(pkg);
    
    // Check license issues
    const licenseIssues = this.checkLicenseCompliance(pkg);
    
    // Check for deprecation
    const deprecationWarnings = await this.checkDeprecation(pkg);
    
    const result: PackageAuditResult = {
      package: pkg,
      vulnerabilities,
      riskScore,
      recommendedActions,
      isDirectDependency: await this.isDirectDependency(pkg.name),
      dependencyPath: await this.getDependencyPath(pkg.name),
      lastUpdated: new Date().toISOString(),
      maintenanceScore,
      licenseIssues,
      deprecationWarnings,
    };

    return result;
  }

  /**
   * Get vulnerabilities for a package
   */
  private async getPackageVulnerabilities(pkg: PackageInfo): Promise<Vulnerability[]> {
    // Check local database first
    const localVulns = this.vulnerabilityDatabase.get(pkg.name) || [];
    
    // In production, this would query external vulnerability databases
    // such as npm audit, Snyk, GitHub Security Advisories, etc.
    const externalVulns = await this.queryExternalVulnerabilityDatabase(pkg);
    
    // Combine and deduplicate
    const allVulns = [...localVulns, ...externalVulns];
    const uniqueVulns = this.deduplicateVulnerabilities(allVulns);
    
    // Filter by version
    return uniqueVulns.filter(vuln => this.isVersionAffected(pkg.version, vuln));
  }

  /**
   * Query external vulnerability databases
   */
  private async queryExternalVulnerabilityDatabase(pkg: PackageInfo): Promise<Vulnerability[]> {
    try {
      // This would integrate with real vulnerability databases
      // For now, we'll simulate with known vulnerabilities
      
      const knownVulnerablePackages: Record<string, Vulnerability[]> = {
        'lodash': [
          {
            id: 'CVE-2020-8203',
            title: 'Prototype Pollution in lodash',
            description: 'lodash versions prior to 4.17.19 are vulnerable to Prototype Pollution.',
            severity: VulnerabilitySeverity.HIGH,
            cvssScore: 7.4,
            affectedVersions: '<4.17.19',
            patchedVersions: '>=4.17.19',
            recommendation: 'Upgrade to lodash version 4.17.19 or later',
            publishedDate: '2020-07-15T00:00:00Z',
            cwe: ['CWE-1321'],
          }
        ],
        'axios': [
          {
            id: 'CVE-2023-45857',
            title: 'Cross-Site Request Forgery in axios',
            description: 'axios versions prior to 1.6.0 are vulnerable to CSRF.',
            severity: VulnerabilitySeverity.MEDIUM,
            cvssScore: 6.1,
            affectedVersions: '<1.6.0',
            patchedVersions: '>=1.6.0',
            recommendation: 'Upgrade to axios version 1.6.0 or later',
            publishedDate: '2023-11-08T00:00:00Z',
            cwe: ['CWE-352'],
          }
        ],
        'react': [
          {
            id: 'CVE-2023-26116',
            title: 'React Server-side Rendering Vulnerability',
            description: 'React versions prior to 18.2.0 have SSR vulnerabilities.',
            severity: VulnerabilitySeverity.LOW,
            cvssScore: 3.7,
            affectedVersions: '<18.2.0',
            patchedVersions: '>=18.2.0',
            recommendation: 'Upgrade to React version 18.2.0 or later',
            publishedDate: '2023-02-20T00:00:00Z',
            cwe: ['CWE-79'],
          }
        ],
      };

      return knownVulnerablePackages[pkg.name] || [];
      
    } catch (error) {
      console.error(`Failed to query vulnerability database for ${pkg.name}:`, error);
      return [];
    }
  }

  /**
   * Get installed packages from package.json and package-lock.json
   */
  private async getInstalledPackages(): Promise<PackageInfo[]> {
    try {
      // In a real implementation, this would read from package.json and package-lock.json
      // For demo purposes, we'll simulate with common packages
      
      const mockPackages: PackageInfo[] = [
        {
          name: 'react',
          version: '18.2.0',
          description: 'React is a JavaScript library for building user interfaces.',
          license: 'MIT',
          homepage: 'https://reactjs.org/',
          repository: 'https://github.com/facebook/react',
          author: 'Facebook',
        },
        {
          name: 'react-dom',
          version: '18.2.0',
          description: 'React package for working with the DOM.',
          license: 'MIT',
          homepage: 'https://reactjs.org/',
          repository: 'https://github.com/facebook/react',
          author: 'Facebook',
        },
        {
          name: 'axios',
          version: '1.5.0',
          description: 'Promise based HTTP client for the browser and node.js',
          license: 'MIT',
          homepage: 'https://axios-http.com',
          repository: 'https://github.com/axios/axios',
          author: 'Matt Zabriskie',
        },
        {
          name: 'lodash',
          version: '4.17.21',
          description: 'Lodash modular utilities.',
          license: 'MIT',
          homepage: 'https://lodash.com/',
          repository: 'https://github.com/lodash/lodash',
          author: 'John-David Dalton',
        },
        {
          name: 'zustand',
          version: '4.4.1',
          description: 'Bear necessities for state management in React',
          license: 'MIT',
          homepage: 'https://github.com/pmndrs/zustand',
          repository: 'https://github.com/pmndrs/zustand',
          author: 'Paul Henschel',
        },
        {
          name: 'framer-motion',
          version: '10.16.4',
          description: 'A simple and powerful React animation library',
          license: 'MIT',
          homepage: 'https://www.framer.com/motion/',
          repository: 'https://github.com/framer/motion',
          author: 'Framer',
        },
        {
          name: '@heroicons/react',
          version: '2.0.18',
          description: 'Beautiful hand-crafted SVG icons, by the makers of Tailwind CSS.',
          license: 'MIT',
          homepage: 'https://heroicons.com',
          repository: 'https://github.com/tailwindlabs/heroicons',
          author: 'Tailwind Labs',
        },
        {
          name: 'tailwindcss',
          version: '3.3.3',
          description: 'A utility-first CSS framework for rapidly building custom designs.',
          license: 'MIT',
          homepage: 'https://tailwindcss.com',
          repository: 'https://github.com/tailwindlabs/tailwindcss',
          author: 'Tailwind Labs',
        },
        {
          name: 'typescript',
          version: '5.2.2',
          description: 'TypeScript is a language for application scale JavaScript development',
          license: 'Apache-2.0',
          homepage: 'https://www.typescriptlang.org/',
          repository: 'https://github.com/Microsoft/TypeScript',
          author: 'Microsoft Corp.',
        },
        {
          name: 'vite',
          version: '4.4.9',
          description: 'Native-ESM powered web dev build tool',
          license: 'MIT',
          homepage: 'https://vitejs.dev',
          repository: 'https://github.com/vitejs/vite',
          author: 'Evan You',
        },
      ];

      return mockPackages;
      
    } catch (error) {
      console.error('Failed to get installed packages:', error);
      return [];
    }
  }

  /**
   * Calculate package risk score
   */
  private calculatePackageRiskScore(pkg: PackageInfo, vulnerabilities: Vulnerability[]): number {
    let score = 0;
    
    // Vulnerability score (0-7)
    vulnerabilities.forEach(vuln => {
      switch (vuln.severity) {
        case VulnerabilitySeverity.CRITICAL:
          score += 3;
          break;
        case VulnerabilitySeverity.HIGH:
          score += 2;
          break;
        case VulnerabilitySeverity.MEDIUM:
          score += 1;
          break;
        case VulnerabilitySeverity.LOW:
          score += 0.5;
          break;
      }
    });
    
    // License risk (0-1)
    if (this.hasLicenseIssues(pkg)) {
      score += 1;
    }
    
    // Maintenance risk (0-2)
    const age = this.getPackageAge(pkg);
    if (age > 365) { // Over 1 year old
      score += 1;
    }
    if (age > 730) { // Over 2 years old
      score += 1;
    }
    
    return Math.min(score, 10);
  }

  /**
   * Generate package-specific recommendations
   */
  private generatePackageRecommendations(pkg: PackageInfo, vulnerabilities: Vulnerability[]): string[] {
    const recommendations: string[] = [];
    
    if (vulnerabilities.length > 0) {
      const critical = vulnerabilities.filter(v => v.severity === VulnerabilitySeverity.CRITICAL);
      const high = vulnerabilities.filter(v => v.severity === VulnerabilitySeverity.HIGH);
      
      if (critical.length > 0) {
        recommendations.push(`URGENT: Update ${pkg.name} immediately - ${critical.length} critical vulnerabilities found`);
      }
      
      if (high.length > 0) {
        recommendations.push(`Update ${pkg.name} soon - ${high.length} high severity vulnerabilities found`);
      }
      
      // Specific version recommendations
      const latestSafe = this.findLatestSafeVersion(pkg, vulnerabilities);
      if (latestSafe) {
        recommendations.push(`Upgrade ${pkg.name} from ${pkg.version} to ${latestSafe}`);
      }
    }
    
    // License recommendations
    if (this.hasLicenseIssues(pkg)) {
      recommendations.push(`Review license compatibility for ${pkg.name} (${pkg.license})`);
    }
    
    // Maintenance recommendations
    if (this.getPackageAge(pkg) > 365) {
      recommendations.push(`Consider alternatives to ${pkg.name} - package may be outdated`);
    }
    
    return recommendations;
  }

  /**
   * Check compliance across multiple dimensions
   */
  private async checkCompliance(auditResults: PackageAuditResult[]): Promise<AuditSummary['compliance']> {
    // License compliance
    const licenseIssues: string[] = [];
    const restrictedLicenses: string[] = [];
    
    auditResults.forEach(result => {
      if (result.licenseIssues.length > 0) {
        licenseIssues.push(...result.licenseIssues);
      }
      
      if (result.package.license && this.licenseConfig.restrictedLicenses.includes(result.package.license)) {
        restrictedLicenses.push(`${result.package.name}: ${result.package.license}`);
      }
    });
    
    // Security compliance
    const criticalVulns = auditResults.reduce((sum, r) => 
      sum + r.vulnerabilities.filter(v => v.severity === VulnerabilitySeverity.CRITICAL).length, 0
    );
    const highVulns = auditResults.reduce((sum, r) => 
      sum + r.vulnerabilities.filter(v => v.severity === VulnerabilitySeverity.HIGH).length, 0
    );
    
    // Maintenance compliance
    const outdatedPackages = auditResults.filter(r => this.getPackageAge(r.package) > 365).length;
    const deprecatedPackages = auditResults.filter(r => r.deprecationWarnings.length > 0).length;
    const totalAge = auditResults.reduce((sum, r) => sum + this.getPackageAge(r.package), 0);
    const averageAge = totalAge / auditResults.length;
    
    return {
      licenses: {
        compliant: licenseIssues.length === 0 && restrictedLicenses.length === 0,
        issues: [...licenseIssues, ...restrictedLicenses],
        allowedLicenses: this.licenseConfig.allowedLicenses,
        restrictedLicenses: this.licenseConfig.restrictedLicenses,
      },
      security: {
        compliant: criticalVulns === 0 && highVulns <= 2, // Allow max 2 high vulns
        criticalVulns,
        highVulns,
        acceptableRisk: criticalVulns === 0 && highVulns <= 5,
      },
      maintenance: {
        outdatedPackages,
        deprecatedPackages,
        averageAge: Math.round(averageAge),
      },
    };
  }

  /**
   * Generate overall recommendations
   */
  private generateRecommendations(auditResults: PackageAuditResult[]): string[] {
    const recommendations: string[] = [];
    
    // Critical vulnerabilities
    const criticalPackages = auditResults.filter(r => 
      r.vulnerabilities.some(v => v.severity === VulnerabilitySeverity.CRITICAL)
    );
    
    if (criticalPackages.length > 0) {
      recommendations.push(
        `🚨 URGENT: ${criticalPackages.length} packages have critical vulnerabilities - update immediately`
      );
    }
    
    // High vulnerabilities
    const highVulnPackages = auditResults.filter(r => 
      r.vulnerabilities.some(v => v.severity === VulnerabilitySeverity.HIGH)
    );
    
    if (highVulnPackages.length > 0) {
      recommendations.push(
        `⚠️ ${highVulnPackages.length} packages have high severity vulnerabilities - schedule updates`
      );
    }
    
    // Outdated packages
    const outdatedPackages = auditResults.filter(r => this.getPackageAge(r.package) > 365);
    if (outdatedPackages.length > 0) {
      recommendations.push(
        `📅 ${outdatedPackages.length} packages are over 1 year old - consider updating`
      );
    }
    
    // License issues
    const licenseIssues = auditResults.filter(r => r.licenseIssues.length > 0);
    if (licenseIssues.length > 0) {
      recommendations.push(
        `⚖️ ${licenseIssues.length} packages have license compliance issues - review required`
      );
    }
    
    // Automated fixes
    const autoFixable = auditResults.filter(r => 
      r.vulnerabilities.some(v => v.patchedVersions)
    );
    
    if (autoFixable.length > 0) {
      recommendations.push(
        `🔧 Run 'npm audit fix' to automatically resolve ${autoFixable.length} vulnerabilities`
      );
    }
    
    return recommendations;
  }

  /**
   * Calculate overall risk score
   */
  private calculateOverallRiskScore(auditResults: PackageAuditResult[]): number {
    if (auditResults.length === 0) return 0;
    
    const totalRisk = auditResults.reduce((sum, result) => sum + result.riskScore, 0);
    const averageRisk = totalRisk / auditResults.length;
    
    // Apply multipliers for critical issues
    const criticalCount = auditResults.reduce((sum, r) => 
      sum + r.vulnerabilities.filter(v => v.severity === VulnerabilitySeverity.CRITICAL).length, 0
    );
    
    const highCount = auditResults.reduce((sum, r) => 
      sum + r.vulnerabilities.filter(v => v.severity === VulnerabilitySeverity.HIGH).length, 0
    );
    
    let riskMultiplier = 1;
    if (criticalCount > 0) riskMultiplier += 0.5;
    if (highCount > 2) riskMultiplier += 0.2;
    
    return Math.min(averageRisk * riskMultiplier, 10);
  }

  /**
   * Helper methods
   */
  
  private initializeVulnerabilityDatabase(): void {
    // Initialize with known vulnerabilities
    // In production, this would be loaded from a vulnerability database
  }

  private getDefaultLicenseConfig(): LicenseConfig {
    return {
      allowedLicenses: ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'BSD-2-Clause', 'ISC'],
      restrictedLicenses: ['GPL-3.0', 'AGPL-3.0', 'LGPL-3.0'],
      requireApproval: ['GPL-2.0', 'LGPL-2.1'],
      copyleftPolicy: 'moderate',
      commercialUseRequired: true,
      attributionRequired: true,
    };
  }

  private deduplicateVulnerabilities(vulns: Vulnerability[]): Vulnerability[] {
    const seen = new Set<string>();
    return vulns.filter(vuln => {
      if (seen.has(vuln.id)) return false;
      seen.add(vuln.id);
      return true;
    });
  }

  private isVersionAffected(version: string, vuln: Vulnerability): boolean {
    // Simple version checking - in production, use semver library
    try {
      if (vuln.affectedVersions.includes('<')) {
        const targetVersion = vuln.affectedVersions.replace('<', '').trim();
        return this.compareVersions(version, targetVersion) < 0;
      }
      return true;
    } catch {
      return false;
    }
  }

  private compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map(n => parseInt(n, 10));
    const bParts = b.split('.').map(n => parseInt(n, 10));
    
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;
      
      if (aPart < bPart) return -1;
      if (aPart > bPart) return 1;
    }
    
    return 0;
  }

  private async isDirectDependency(packageName: string): Promise<boolean> {
    // Check if package is in package.json dependencies
    // For simulation, assume popular packages are direct dependencies
    const directDeps = ['react', 'react-dom', 'axios', 'zustand', 'framer-motion'];
    return directDeps.includes(packageName);
  }

  private async getDependencyPath(packageName: string): Promise<string[]> {
    // Return dependency path - for simulation
    return [packageName];
  }

  private async calculateMaintenanceScore(pkg: PackageInfo): Promise<number> {
    // Calculate maintenance score based on age, updates, etc.
    const age = this.getPackageAge(pkg);
    let score = 10;
    
    if (age > 365) score -= 2; // -2 for over 1 year
    if (age > 730) score -= 3; // -3 more for over 2 years
    
    return Math.max(score, 0);
  }

  private checkLicenseCompliance(pkg: PackageInfo): string[] {
    const issues: string[] = [];
    
    if (!pkg.license) {
      issues.push('No license specified');
      return issues;
    }
    
    if (this.licenseConfig.restrictedLicenses.includes(pkg.license)) {
      issues.push(`Restricted license: ${pkg.license}`);
    }
    
    if (this.licenseConfig.requireApproval.includes(pkg.license)) {
      issues.push(`License requires approval: ${pkg.license}`);
    }
    
    return issues;
  }

  private async checkDeprecation(pkg: PackageInfo): Promise<string[]> {
    // Check if package is deprecated
    // In production, this would query npm registry
    const deprecatedPackages = ['request', 'node-uuid'];
    
    if (deprecatedPackages.includes(pkg.name)) {
      return [`Package ${pkg.name} is deprecated`];
    }
    
    return [];
  }

  private hasLicenseIssues(pkg: PackageInfo): boolean {
    return this.checkLicenseCompliance(pkg).length > 0;
  }

  private getPackageAge(pkg: PackageInfo): number {
    // Simulate package age - in production, get from registry
    const packageAges: Record<string, number> = {
      'react': 200,
      'axios': 150,
      'lodash': 400,
      'typescript': 300,
    };
    
    return packageAges[pkg.name] || 100;
  }

  private findLatestSafeVersion(pkg: PackageInfo, vulnerabilities: Vulnerability[]): string | null {
    // Find the latest version that's not affected by vulnerabilities
    // In production, query npm registry for versions
    const safeVersions: Record<string, string> = {
      'lodash': '4.17.21',
      'axios': '1.6.0',
    };
    
    return safeVersions[pkg.name] || null;
  }

  private getSeverityFromRisk(riskScore: number): SecuritySeverity {
    if (riskScore >= 8) return SecuritySeverity.CRITICAL;
    if (riskScore >= 6) return SecuritySeverity.HIGH;
    if (riskScore >= 4) return SecuritySeverity.MEDIUM;
    if (riskScore >= 2) return SecuritySeverity.LOW;
    return SecuritySeverity.INFO;
  }

  private getRiskLevelFromScore(riskScore: number): 'low' | 'medium' | 'high' | 'critical' {
    if (riskScore >= 8) return 'critical';
    if (riskScore >= 6) return 'high';
    if (riskScore >= 4) return 'medium';
    return 'low';
  }

  private startPeriodicAudits(): void {
    // Run audit every 24 hours
    setInterval(() => {
      this.performFullAudit().catch(error => {
        console.error('Periodic audit failed:', error);
      });
    }, this.auditInterval);
  }

  /**
   * Public API methods
   */

  public async getAuditResults(): Promise<PackageAuditResult[]> {
    return Array.from(this.auditCache.values());
  }

  public async getVulnerabilityReport(): Promise<{
    critical: PackageAuditResult[];
    high: PackageAuditResult[];
    medium: PackageAuditResult[];
    low: PackageAuditResult[];
  }> {
    const results = await this.getAuditResults();
    
    return {
      critical: results.filter(r => r.vulnerabilities.some(v => v.severity === VulnerabilitySeverity.CRITICAL)),
      high: results.filter(r => r.vulnerabilities.some(v => v.severity === VulnerabilitySeverity.HIGH)),
      medium: results.filter(r => r.vulnerabilities.some(v => v.severity === VulnerabilitySeverity.MEDIUM)),
      low: results.filter(r => r.vulnerabilities.some(v => v.severity === VulnerabilitySeverity.LOW)),
    };
  }

  public async exportSBOM(): Promise<string> {
    const packages = await this.getInstalledPackages();
    const auditResults = await this.getAuditResults();
    
    const sbom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.4',
      version: 1,
      metadata: {
        timestamp: new Date().toISOString(),
        tools: ['dependency-audit-service'],
      },
      components: packages.map(pkg => {
        const audit = auditResults.find(r => r.package.name === pkg.name);
        return {
          type: 'library',
          name: pkg.name,
          version: pkg.version,
          description: pkg.description,
          licenses: pkg.license ? [{ license: { name: pkg.license } }] : [],
          purl: `pkg:npm/${pkg.name}@${pkg.version}`,
          vulnerabilities: audit?.vulnerabilities.map(v => ({
            id: v.id,
            source: { name: 'npm-audit' },
            severity: v.severity,
            description: v.description,
          })) || [],
        };
      }),
    };
    
    return JSON.stringify(sbom, null, 2);
  }
}

// Global instance
export const dependencyAudit = DependencyAuditService.getInstance();