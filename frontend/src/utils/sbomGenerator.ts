/**
 * Software Bill of Materials (SBOM) Generator
 * Comprehensive SBOM generation and management system
 */

import { securityLogger, SecurityEventType, SecuritySeverity } from './securityLogging';
import { auditTrail, AuditCategory } from './auditTrail';
import { dependencyAudit, PackageInfo, Vulnerability } from './dependencyAudit';
import { supplyChainMonitoring, SupplyChainRiskAssessment } from './supplyChainMonitoring';

// SBOM format standards
export enum SBOMFormat {
  CYCLONE_DX = 'CycloneDX',
  SPDX = 'SPDX',
  SWID = 'SWID',
  CUSTOM = 'Custom',
}

// Component types
export enum ComponentType {
  APPLICATION = 'application',
  FRAMEWORK = 'framework',
  LIBRARY = 'library',
  CONTAINER = 'container',
  OPERATING_SYSTEM = 'operating-system',
  DEVICE = 'device',
  FILE = 'file',
  FIRMWARE = 'firmware',
}

// License information
export interface LicenseInfo {
  id?: string;
  name: string;
  text?: string;
  url?: string;
  acknowledgement?: string;
  commercial: boolean;
  copyleft: boolean;
  fsfLibre: boolean;
  osiApproved: boolean;
  deprecated: boolean;
  restrictive: boolean;
}

// Vulnerability reference in SBOM
export interface SBOMVulnerability {
  id: string;
  source: {
    name: string;
    url?: string;
  };
  references: Array<{
    id: string;
    source: {
      name: string;
      url?: string;
    };
  }>;
  ratings: Array<{
    source: {
      name: string;
      url?: string;
    };
    score?: number;
    severity?: string;
    method?: string;
    vector?: string;
  }>;
  cwes?: number[];
  description?: string;
  detail?: string;
  recommendation?: string;
  published?: string;
  updated?: string;
}

// Component in SBOM
export interface SBOMComponent {
  type: ComponentType;
  bomRef: string;
  supplier?: {
    name: string;
    url?: string;
    contact?: Array<{
      name?: string;
      email?: string;
      phone?: string;
    }>;
  };
  author?: string;
  publisher?: string;
  group?: string;
  name: string;
  version: string;
  description?: string;
  scope?: 'required' | 'optional' | 'excluded';
  hashes?: Array<{
    alg: string;
    content: string;
  }>;
  licenses?: Array<{
    license?: LicenseInfo;
    expression?: string;
  }>;
  copyright?: string;
  cpe?: string;
  purl?: string;
  swid?: {
    tagId: string;
    name: string;
    version?: string;
    tagVersion?: number;
    patch?: boolean;
  };
  pedigree?: {
    ancestors?: SBOMComponent[];
    descendants?: SBOMComponent[];
    variants?: SBOMComponent[];
    commits?: Array<{
      uid?: string;
      url?: string;
      author?: {
        timestamp?: string;
        name?: string;
        email?: string;
      };
      committer?: {
        timestamp?: string;
        name?: string;
        email?: string;
      };
      message?: string;
    }>;
    patches?: Array<{
      type: 'unofficial' | 'monkey' | 'backport' | 'cherry-pick';
      diff?: {
        text?: string;
        url?: string;
      };
      resolves?: Array<{
        type: 'defect' | 'enhancement' | 'security';
        id?: string;
        name?: string;
        description?: string;
        source?: {
          name?: string;
          url?: string;
        };
        references?: string[];
      }>;
    }>;
    notes?: string;
  };
  externalReferences?: Array<{
    type: 'vcs' | 'issue-tracker' | 'website' | 'advisories' | 'bom' | 'mailing-list' | 'social' | 'chat' | 'documentation' | 'support' | 'source-distribution' | 'binary-distribution' | 'maven-central' | 'npm' | 'nuget' | 'bower' | 'purl' | 'other';
    url: string;
    comment?: string;
    hashes?: Array<{
      alg: string;
      content: string;
    }>;
  }>;
  properties?: Array<{
    name: string;
    value: string;
  }>;
  components?: SBOMComponent[];
  evidence?: {
    identity?: {
      field: string;
      confidence: number;
      methods?: Array<{
        technique: string;
        confidence: number;
        value?: string;
      }>;
    };
    occurrences?: Array<{
      location: string;
      line?: number;
      offset?: number;
      symbol?: string;
      additionalContext?: string;
    }>;
    callstack?: {
      frames?: Array<{
        package?: string;
        module?: string;
        function?: string;
        parameters?: string[];
        line?: number;
        column?: number;
        fullFilename?: string;
      }>;
    };
  };
  releaseNotes?: {
    type: string;
    title?: string;
    featuredImage?: string;
    socialImage?: string;
    description?: string;
    timestamp?: string;
    aliases?: string[];
    tags?: string[];
    resolves?: Array<{
      type: 'defect' | 'enhancement' | 'security';
      id?: string;
      name?: string;
      description?: string;
      source?: {
        name?: string;
        url?: string;
      };
      references?: string[];
    }>;
    notes?: Array<{
      locale?: string;
      text: string;
    }>;
  };
}

// SBOM composition
export interface SBOMComposition {
  aggregate: 'complete' | 'incomplete' | 'incomplete_first_party_only' | 'incomplete_third_party_only' | 'unknown';
  assemblies?: string[];
  dependencies?: string[];
}

// Dependency relationship
export interface SBOMDependency {
  ref: string;
  dependsOn?: string[];
  provides?: string[];
  scope?: 'required' | 'optional' | 'excluded';
}

// SBOM metadata
export interface SBOMMetadata {
  timestamp: string;
  tools: Array<{
    vendor?: string;
    name: string;
    version?: string;
    hashes?: Array<{
      alg: string;
      content: string;
    }>;
    externalReferences?: Array<{
      type: string;
      url: string;
      comment?: string;
    }>;
  }>;
  authors?: Array<{
    name?: string;
    email?: string;
    phone?: string;
  }>;
  component?: SBOMComponent;
  manufacture?: {
    name?: string;
    url?: string;
    contact?: Array<{
      name?: string;
      email?: string;
      phone?: string;
    }>;
  };
  supplier?: {
    name?: string;
    url?: string;
    contact?: Array<{
      name?: string;
      email?: string;
      phone?: string;
    }>;
  };
  licenses?: Array<{
    license?: LicenseInfo;
    expression?: string;
  }>;
  properties?: Array<{
    name: string;
    value: string;
  }>;
}

// Main SBOM document
export interface SBOM {
  bomFormat: string;
  specVersion: string;
  serialNumber?: string;
  version: number;
  metadata?: SBOMMetadata;
  components?: SBOMComponent[];
  services?: Array<{
    bomRef: string;
    provider?: {
      name?: string;
      url?: string;
      contact?: Array<{
        name?: string;
        email?: string;
        phone?: string;
      }>;
    };
    group?: string;
    name: string;
    version?: string;
    description?: string;
    endpoints?: string[];
    authenticated?: boolean;
    xTrustBoundary?: boolean;
    data?: Array<{
      flow: 'inbound' | 'outbound' | 'bi-directional' | 'unknown';
      classification: string;
    }>;
    licenses?: Array<{
      license?: LicenseInfo;
      expression?: string;
    }>;
    externalReferences?: Array<{
      type: string;
      url: string;
      comment?: string;
    }>;
    properties?: Array<{
      name: string;
      value: string;
    }>;
    services?: any[]; // Nested services
    releaseNotes?: any;
  }>;
  externalReferences?: Array<{
    type: string;
    url: string;
    comment?: string;
    hashes?: Array<{
      alg: string;
      content: string;
    }>;
  }>;
  dependencies?: SBOMDependency[];
  compositions?: SBOMComposition[];
  vulnerabilities?: SBOMVulnerability[];
  properties?: Array<{
    name: string;
    value: string;
  }>;
  signature?: {
    algorithm: string;
    keyId?: string;
    publicKey?: {
      kty: string;
      crv?: string;
      x?: string;
      y?: string;
      n?: string;
      e?: string;
    };
    value: string;
  };
}

// SBOM generation options
export interface SBOMGenerationOptions {
  format: SBOMFormat;
  includeVulnerabilities: boolean;
  includeLicenses: boolean;
  includeHashes: boolean;
  includeSupplyChainRisk: boolean;
  includeDevDependencies: boolean;
  includeTransitiveDependencies: boolean;
  includeMetadata: boolean;
  includeSignature: boolean;
  minifyOutput: boolean;
  outputPath?: string;
  customProperties?: Record<string, string>;
}

/**
 * SBOM Generator Service
 * Comprehensive Software Bill of Materials generation and management
 */
export class SBOMGeneratorService {
  private static instance: SBOMGeneratorService;
  private generatedSBOMs = new Map<string, SBOM>();
  private licenseDatabase = new Map<string, LicenseInfo>();

  private constructor() {
    this.initializeLicenseDatabase();
  }

  public static getInstance(): SBOMGeneratorService {
    if (!SBOMGeneratorService.instance) {
      SBOMGeneratorService.instance = new SBOMGeneratorService();
    }
    return SBOMGeneratorService.instance;
  }

  /**
   * Generate comprehensive SBOM for the application
   */
  public async generateSBOM(options: Partial<SBOMGenerationOptions> = {}): Promise<SBOM> {
    const config: SBOMGenerationOptions = {
      format: SBOMFormat.CYCLONE_DX,
      includeVulnerabilities: true,
      includeLicenses: true,
      includeHashes: false,
      includeSupplyChainRisk: true,
      includeDevDependencies: false,
      includeTransitiveDependencies: true,
      includeMetadata: true,
      includeSignature: false,
      minifyOutput: false,
      ...options,
    };

    try {
      console.log('📋 Generating Software Bill of Materials...');
      
      // Get package information
      const auditResults = await dependencyAudit.getAuditResults();
      const packages = auditResults.map(result => result.package);
      
      console.log(`📦 Processing ${packages.length} packages for SBOM`);
      
      // Generate SBOM based on format
      let sbom: SBOM;
      switch (config.format) {
        case SBOMFormat.CYCLONE_DX:
          sbom = await this.generateCycloneDXSBOM(packages, auditResults, config);
          break;
        case SBOMFormat.SPDX:
          sbom = await this.generateSPDXSBOM(packages, auditResults, config);
          break;
        default:
          throw new Error(`Unsupported SBOM format: ${config.format}`);
      }
      
      // Store generated SBOM
      const sbomId = this.generateSBOMId();
      this.generatedSBOMs.set(sbomId, sbom);
      
      // Log generation
      await securityLogger.logEvent(
        SecurityEventType.SECURITY_EVENT,
        {
          type: 'sbom_generated',
          format: config.format,
          componentCount: sbom.components?.length || 0,
          vulnerabilityCount: sbom.vulnerabilities?.length || 0,
          includesRiskAssessment: config.includeSupplyChainRisk,
        },
        {
          severity: SecuritySeverity.INFO,
        }
      );
      
      // Record in audit trail
      await auditTrail.logAuditEvent(
        AuditCategory.COMPLIANCE,
        'sbom_generation',
        {
          actor: {
            type: 'system',
            id: 'sbom_generator',
          },
          target: {
            type: 'sbom',
            id: sbomId,
            name: 'Software Bill of Materials',
          },
          result: 'success',
          context: {
            component: 'sbom_generator',
            operation: 'generate_sbom',
            format: config.format,
          },
          riskLevel: 'low',
        }
      );
      
      console.log('✅ SBOM generation completed successfully');
      console.log(`📊 Components: ${sbom.components?.length || 0}`);
      console.log(`🔍 Vulnerabilities: ${sbom.vulnerabilities?.length || 0}`);
      
      return sbom;
      
    } catch (error) {
      console.error('❌ SBOM generation failed:', error);
      
      await securityLogger.logEvent(
        SecurityEventType.SECURITY_EVENT,
        {
          type: 'sbom_generation_failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          format: config.format,
        },
        {
          severity: SecuritySeverity.HIGH,
        }
      );
      
      throw error;
    }
  }

  /**
   * Export SBOM in specified format
   */
  public exportSBOM(sbom: SBOM, format: SBOMFormat = SBOMFormat.CYCLONE_DX, minify: boolean = false): string {
    switch (format) {
      case SBOMFormat.CYCLONE_DX:
        return JSON.stringify(sbom, null, minify ? 0 : 2);
      case SBOMFormat.SPDX:
        return this.exportToSPDXFormat(sbom);
      case SBOMFormat.CUSTOM:
        return this.exportToCustomFormat(sbom);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Validate SBOM compliance
   */
  public validateSBOM(sbom: SBOM): {
    valid: boolean;
    errors: string[];
    warnings: string[];
    compliance: {
      ntia: boolean;
      nist: boolean;
      iso: boolean;
      cycloneDx: boolean;
    };
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Basic validation
    if (!sbom.bomFormat) {
      errors.push('Missing bomFormat field');
    }
    
    if (!sbom.specVersion) {
      errors.push('Missing specVersion field');
    }
    
    if (!sbom.components || sbom.components.length === 0) {
      warnings.push('No components found in SBOM');
    }
    
    // Component validation
    sbom.components?.forEach((component, index) => {
      if (!component.name) {
        errors.push(`Component ${index}: Missing name`);
      }
      
      if (!component.version) {
        warnings.push(`Component ${component.name}: Missing version`);
      }
      
      if (!component.type) {
        errors.push(`Component ${component.name}: Missing type`);
      }
      
      if (!component.bomRef) {
        errors.push(`Component ${component.name}: Missing bomRef`);
      }
    });
    
    // Vulnerability validation
    sbom.vulnerabilities?.forEach((vuln, index) => {
      if (!vuln.id) {
        errors.push(`Vulnerability ${index}: Missing id`);
      }
      
      if (!vuln.source) {
        errors.push(`Vulnerability ${vuln.id}: Missing source`);
      }
    });
    
    // Compliance checks
    const compliance = {
      ntia: this.checkNTIACompliance(sbom),
      nist: this.checkNISTCompliance(sbom),
      iso: this.checkISOCompliance(sbom),
      cycloneDx: this.checkCycloneDXCompliance(sbom),
    };
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      compliance,
    };
  }

  /**
   * Compare two SBOMs for differences
   */
  public compareSBOMs(sbom1: SBOM, sbom2: SBOM): {
    added: SBOMComponent[];
    removed: SBOMComponent[];
    updated: Array<{
      component: SBOMComponent;
      changes: string[];
    }>;
    vulnerabilityChanges: {
      added: SBOMVulnerability[];
      removed: SBOMVulnerability[];
      updated: SBOMVulnerability[];
    };
  } {
    const components1 = new Map(sbom1.components?.map(c => [c.bomRef, c]) || []);
    const components2 = new Map(sbom2.components?.map(c => [c.bomRef, c]) || []);
    
    const added: SBOMComponent[] = [];
    const removed: SBOMComponent[] = [];
    const updated: Array<{ component: SBOMComponent; changes: string[] }> = [];
    
    // Find added and updated components
    for (const [ref, component] of components2) {
      const oldComponent = components1.get(ref);
      if (!oldComponent) {
        added.push(component);
      } else {
        const changes = this.compareComponents(oldComponent, component);
        if (changes.length > 0) {
          updated.push({ component, changes });
        }
      }
    }
    
    // Find removed components
    for (const [ref, component] of components1) {
      if (!components2.has(ref)) {
        removed.push(component);
      }
    }
    
    // Compare vulnerabilities
    const vulns1 = new Map(sbom1.vulnerabilities?.map(v => [v.id, v]) || []);
    const vulns2 = new Map(sbom2.vulnerabilities?.map(v => [v.id, v]) || []);
    
    const addedVulns: SBOMVulnerability[] = [];
    const removedVulns: SBOMVulnerability[] = [];
    const updatedVulns: SBOMVulnerability[] = [];
    
    for (const [id, vuln] of vulns2) {
      if (!vulns1.has(id)) {
        addedVulns.push(vuln);
      } else if (JSON.stringify(vulns1.get(id)) !== JSON.stringify(vuln)) {
        updatedVulns.push(vuln);
      }
    }
    
    for (const [id, vuln] of vulns1) {
      if (!vulns2.has(id)) {
        removedVulns.push(vuln);
      }
    }
    
    return {
      added,
      removed,
      updated,
      vulnerabilityChanges: {
        added: addedVulns,
        removed: removedVulns,
        updated: updatedVulns,
      },
    };
  }

  /**
   * Get stored SBOMs
   */
  public getStoredSBOMs(): Map<string, SBOM> {
    return new Map(this.generatedSBOMs);
  }

  /**
   * Private helper methods
   */

  private async generateCycloneDXSBOM(
    packages: PackageInfo[], 
    auditResults: any[], 
    config: SBOMGenerationOptions
  ): Promise<SBOM> {
    const sbom: SBOM = {
      bomFormat: 'CycloneDX',
      specVersion: '1.4',
      serialNumber: `urn:uuid:${this.generateUUID()}`,
      version: 1,
    };
    
    // Add metadata
    if (config.includeMetadata) {
      sbom.metadata = await this.generateMetadata();
    }
    
    // Process components
    sbom.components = [];
    const dependencies: SBOMDependency[] = [];
    
    for (const pkg of packages) {
      const component = await this.packageToComponent(pkg, config);
      sbom.components.push(component);
      
      // Add dependency relationships
      if (config.includeTransitiveDependencies) {
        const dependency: SBOMDependency = {
          ref: component.bomRef,
          dependsOn: this.getDependencies(pkg),
        };
        dependencies.push(dependency);
      }
    }
    
    if (dependencies.length > 0) {
      sbom.dependencies = dependencies;
    }
    
    // Add vulnerabilities
    if (config.includeVulnerabilities) {
      sbom.vulnerabilities = await this.generateVulnerabilities(auditResults);
    }
    
    // Add custom properties
    if (config.customProperties) {
      sbom.properties = Object.entries(config.customProperties).map(([name, value]) => ({
        name,
        value,
      }));
    }
    
    // Add compositions
    sbom.compositions = [{
      aggregate: 'complete',
      assemblies: sbom.components.map(c => c.bomRef),
    }];
    
    return sbom;
  }

  private async generateSPDXSBOM(
    packages: PackageInfo[], 
    auditResults: any[], 
    config: SBOMGenerationOptions
  ): Promise<SBOM> {
    // SPDX format adaptation - for simplicity, use CycloneDX structure with SPDX metadata
    const sbom = await this.generateCycloneDXSBOM(packages, auditResults, config);
    sbom.bomFormat = 'SPDX';
    sbom.specVersion = '2.3';
    
    return sbom;
  }

  private async generateMetadata(): Promise<SBOMMetadata> {
    return {
      timestamp: new Date().toISOString(),
      tools: [{
        name: 'SBOM Generator',
        version: '1.0.0',
        vendor: 'Security Team',
      }],
      component: {
        type: ComponentType.APPLICATION,
        bomRef: 'pkg:app/quiz-application@1.0.0',
        name: 'Quiz Application',
        version: '1.0.0',
        description: 'Adaptive quiz application with React 18 frontend',
        purl: 'pkg:app/quiz-application@1.0.0',
      },
      properties: [
        { name: 'sbom.generation.tool', value: 'SBOM Generator v1.0.0' },
        { name: 'sbom.generation.timestamp', value: new Date().toISOString() },
        { name: 'security.assessment.included', value: 'true' },
      ],
    };
  }

  private async packageToComponent(pkg: PackageInfo, config: SBOMGenerationOptions): Promise<SBOMComponent> {
    const component: SBOMComponent = {
      type: ComponentType.LIBRARY,
      bomRef: `pkg:npm/${pkg.name}@${pkg.version}`,
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      purl: `pkg:npm/${pkg.name}@${pkg.version}`,
    };
    
    // Add author information
    if (pkg.author) {
      component.author = pkg.author;
    }
    
    // Add licenses
    if (config.includeLicenses && pkg.license) {
      const licenseInfo = this.licenseDatabase.get(pkg.license);
      component.licenses = [{
        license: licenseInfo || {
          name: pkg.license,
          commercial: false,
          copyleft: false,
          fsfLibre: true,
          osiApproved: true,
          deprecated: false,
          restrictive: false,
        },
      }];
    }
    
    // Add external references
    component.externalReferences = [];
    
    if (pkg.homepage) {
      component.externalReferences.push({
        type: 'website',
        url: pkg.homepage,
      });
    }
    
    if (pkg.repository) {
      component.externalReferences.push({
        type: 'vcs',
        url: pkg.repository,
      });
    }
    
    // Add npm reference
    component.externalReferences.push({
      type: 'npm',
      url: `https://www.npmjs.com/package/${pkg.name}`,
    });
    
    // Add supply chain risk assessment
    if (config.includeSupplyChainRisk) {
      const riskAssessment = supplyChainMonitoring.getPackageRiskAssessment(pkg.name, pkg.version);
      if (riskAssessment) {
        component.properties = [
          { name: 'security.risk.level', value: riskAssessment.riskLevel },
          { name: 'security.risk.score', value: riskAssessment.riskScore.toString() },
          { name: 'security.trust.score', value: riskAssessment.trustIndicators.trustScore.toString() },
        ];
      }
    }
    
    return component;
  }

  private async generateVulnerabilities(auditResults: any[]): Promise<SBOMVulnerability[]> {
    const vulnerabilities: SBOMVulnerability[] = [];
    
    for (const result of auditResults) {
      for (const vuln of result.vulnerabilities) {
        const sbomVuln: SBOMVulnerability = {
          id: vuln.id,
          source: {
            name: 'npm-audit',
            url: 'https://www.npmjs.com/advisories',
          },
          references: vuln.cves?.map((cve: string) => ({
            id: cve,
            source: {
              name: 'NVD',
              url: `https://nvd.nist.gov/vuln/detail/${cve}`,
            },
          })) || [],
          ratings: [{
            source: {
              name: 'npm-audit',
            },
            score: vuln.cvssScore,
            severity: vuln.severity,
            method: 'CVSS',
            vector: vuln.cvssVector,
          }],
          cwes: vuln.cwe?.map((cwe: string) => parseInt(cwe.replace('CWE-', ''), 10)),
          description: vuln.description,
          recommendation: vuln.recommendation,
          published: vuln.publishedDate,
          updated: vuln.modifiedDate,
        };
        
        vulnerabilities.push(sbomVuln);
      }
    }
    
    return vulnerabilities;
  }

  private getDependencies(pkg: PackageInfo): string[] {
    const dependencies: string[] = [];
    
    // Process direct dependencies
    if (pkg.dependencies) {
      for (const [name, version] of Object.entries(pkg.dependencies)) {
        dependencies.push(`pkg:npm/${name}@${version}`);
      }
    }
    
    return dependencies;
  }

  private compareComponents(comp1: SBOMComponent, comp2: SBOMComponent): string[] {
    const changes: string[] = [];
    
    if (comp1.version !== comp2.version) {
      changes.push(`Version changed from ${comp1.version} to ${comp2.version}`);
    }
    
    if (comp1.description !== comp2.description) {
      changes.push('Description updated');
    }
    
    if (JSON.stringify(comp1.licenses) !== JSON.stringify(comp2.licenses)) {
      changes.push('License information changed');
    }
    
    if (JSON.stringify(comp1.externalReferences) !== JSON.stringify(comp2.externalReferences)) {
      changes.push('External references updated');
    }
    
    return changes;
  }

  private checkNTIACompliance(sbom: SBOM): boolean {
    // NTIA minimum elements for SBOM
    if (!sbom.metadata?.component) return false;
    if (!sbom.components || sbom.components.length === 0) return false;
    
    // Check that all components have required fields
    return sbom.components.every(component => 
      component.name && 
      component.version && 
      component.bomRef
    );
  }

  private checkNISTCompliance(sbom: SBOM): boolean {
    // NIST SSDF compliance checks
    return this.checkNTIACompliance(sbom) && 
           sbom.vulnerabilities !== undefined &&
           sbom.metadata?.timestamp !== undefined;
  }

  private checkISOCompliance(sbom: SBOM): boolean {
    // Basic ISO 5962 compliance
    return this.checkNTIACompliance(sbom) &&
           sbom.metadata?.tools !== undefined &&
           sbom.compositions !== undefined;
  }

  private checkCycloneDXCompliance(sbom: SBOM): boolean {
    return sbom.bomFormat === 'CycloneDX' &&
           sbom.specVersion !== undefined &&
           sbom.version !== undefined;
  }

  private exportToSPDXFormat(sbom: SBOM): string {
    // Simplified SPDX format export
    const spdxLines = [
      'SPDXVersion: SPDX-2.3',
      'DataLicense: CC0-1.0',
      `SPDXID: SPDXRef-DOCUMENT`,
      `DocumentName: ${sbom.metadata?.component?.name || 'Software'}`,
      `DocumentNamespace: https://example.com/sbom/${Date.now()}`,
      `Creator: Tool: ${sbom.metadata?.tools?.[0]?.name || 'SBOM Generator'}`,
      `Created: ${sbom.metadata?.timestamp || new Date().toISOString()}`,
      '',
    ];
    
    // Add packages
    sbom.components?.forEach((component, index) => {
      spdxLines.push(`PackageName: ${component.name}`);
      spdxLines.push(`SPDXID: SPDXRef-Package-${index}`);
      spdxLines.push(`PackageVersion: ${component.version}`);
      spdxLines.push(`PackageDownloadLocation: NOASSERTION`);
      spdxLines.push(`FilesAnalyzed: false`);
      spdxLines.push(`PackageLicenseConcluded: ${component.licenses?.[0]?.license?.name || 'NOASSERTION'}`);
      spdxLines.push(`PackageLicenseDeclared: ${component.licenses?.[0]?.license?.name || 'NOASSERTION'}`);
      spdxLines.push(`PackageCopyrightText: ${component.copyright || 'NOASSERTION'}`);
      spdxLines.push('');
    });
    
    return spdxLines.join('\n');
  }

  private exportToCustomFormat(sbom: SBOM): string {
    // Custom format for internal use
    const customSBOM = {
      format: 'Custom',
      generated: sbom.metadata?.timestamp,
      application: sbom.metadata?.component?.name,
      version: sbom.metadata?.component?.version,
      components: sbom.components?.map(c => ({
        name: c.name,
        version: c.version,
        type: c.type,
        license: c.licenses?.[0]?.license?.name,
        vulnerabilities: sbom.vulnerabilities?.filter(v => 
          v.references.some(r => r.id.includes(c.name))
        ).length || 0,
      })),
      summary: {
        totalComponents: sbom.components?.length || 0,
        totalVulnerabilities: sbom.vulnerabilities?.length || 0,
        riskLevel: 'medium', // Simplified
      },
    };
    
    return JSON.stringify(customSBOM, null, 2);
  }

  private initializeLicenseDatabase(): void {
    // Initialize with common license information
    const licenses: LicenseInfo[] = [
      {
        id: 'MIT',
        name: 'MIT License',
        commercial: true,
        copyleft: false,
        fsfLibre: true,
        osiApproved: true,
        deprecated: false,
        restrictive: false,
      },
      {
        id: 'Apache-2.0',
        name: 'Apache License 2.0',
        commercial: true,
        copyleft: false,
        fsfLibre: true,
        osiApproved: true,
        deprecated: false,
        restrictive: false,
      },
      {
        id: 'GPL-3.0',
        name: 'GNU General Public License v3.0',
        commercial: false,
        copyleft: true,
        fsfLibre: true,
        osiApproved: true,
        deprecated: false,
        restrictive: true,
      },
      {
        id: 'BSD-3-Clause',
        name: 'BSD 3-Clause License',
        commercial: true,
        copyleft: false,
        fsfLibre: true,
        osiApproved: true,
        deprecated: false,
        restrictive: false,
      },
      {
        id: 'ISC',
        name: 'ISC License',
        commercial: true,
        copyleft: false,
        fsfLibre: true,
        osiApproved: true,
        deprecated: false,
        restrictive: false,
      },
    ];
    
    licenses.forEach(license => {
      this.licenseDatabase.set(license.id!, license);
      this.licenseDatabase.set(license.name, license);
    });
  }

  private generateSBOMId(): string {
    return `sbom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

// Global instance
export const sbomGenerator = SBOMGeneratorService.getInstance();