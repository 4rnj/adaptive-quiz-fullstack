/**
 * Security Testing and Validation Utilities
 * Comprehensive testing framework for security implementations
 */

import { 
  securityHeaders, 
  SecurityLevel, 
  SecurityHeadersAssessment 
} from './securityHeaders';
import { 
  xssProtection, 
  XSSDetectionResult, 
  ContentType, 
  XSSThreatLevel,
  XSSAttackType 
} from './xssProtection';
import { 
  csrfProtection, 
  CSRFValidationResult, 
  RequestContext, 
  CSRFAttackType 
} from './csrfProtection';
import { 
  cspImplementation, 
  CSPAnalysisResult 
} from './cspImplementation';
import { 
  securityMiddleware, 
  SecurityAssessment 
} from '../middleware/securityMiddleware';

// Test case types
export enum TestCaseType {
  SECURITY_HEADERS = 'security_headers',
  XSS_PROTECTION = 'xss_protection',
  CSRF_PROTECTION = 'csrf_protection',
  CSP_IMPLEMENTATION = 'csp_implementation',
  MIDDLEWARE_INTEGRATION = 'middleware_integration',
  END_TO_END = 'end_to_end',
}

// Test severity levels
export enum TestSeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  INFO = 'info',
}

// Test result status
export enum TestStatus {
  PASS = 'pass',
  FAIL = 'fail',
  SKIP = 'skip',
  ERROR = 'error',
}

// Individual test case
export interface SecurityTestCase {
  id: string;
  name: string;
  description: string;
  type: TestCaseType;
  severity: TestSeverity;
  enabled: boolean;
  timeout: number;
  setup?: () => Promise<void>;
  test: () => Promise<TestResult>;
  cleanup?: () => Promise<void>;
  tags: string[];
}

// Test execution result
export interface TestResult {
  status: TestStatus;
  message: string;
  details?: any;
  duration: number;
  error?: Error;
  evidence?: any;
  recommendations?: string[];
}

// Test suite configuration
export interface TestSuiteConfig {
  name: string;
  timeout: number;
  parallel: boolean;
  continueOnFailure: boolean;
  generateReport: boolean;
  outputPath?: string;
  includedTypes: TestCaseType[];
  excludedTags: string[];
  minSeverity: TestSeverity;
}

// Test suite execution result
export interface TestSuiteResult {
  name: string;
  startTime: number;
  endTime: number;
  duration: number;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  errors: number;
  results: Array<TestResult & { testCase: SecurityTestCase }>;
  summary: {
    passRate: number;
    criticalFailures: number;
    highFailures: number;
    overallGrade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
    securityScore: number;
  };
}

/**
 * Security Testing Service
 * Comprehensive security testing and validation framework
 */
export class SecurityTestingService {
  private static instance: SecurityTestingService;
  private testCases: Map<string, SecurityTestCase>;
  private testResults: Map<string, TestResult>;

  private constructor() {
    this.testCases = new Map();
    this.testResults = new Map();
    this.registerDefaultTestCases();
  }

  public static getInstance(): SecurityTestingService {
    if (!SecurityTestingService.instance) {
      SecurityTestingService.instance = new SecurityTestingService();
    }
    return SecurityTestingService.instance;
  }

  /**
   * Register a custom test case
   */
  public registerTestCase(testCase: SecurityTestCase): void {
    this.testCases.set(testCase.id, testCase);
    console.log('📝 Security test case registered:', testCase.name);
  }

  /**
   * Execute a single test case
   */
  public async executeTestCase(testId: string): Promise<TestResult> {
    const testCase = this.testCases.get(testId);
    if (!testCase) {
      throw new Error(`Test case not found: ${testId}`);
    }

    if (!testCase.enabled) {
      return {
        status: TestStatus.SKIP,
        message: 'Test case is disabled',
        duration: 0,
      };
    }

    const startTime = performance.now();
    let result: TestResult;

    try {
      console.log(`🧪 Executing test: ${testCase.name}`);

      // Setup
      if (testCase.setup) {
        await testCase.setup();
      }

      // Execute test with timeout
      const testPromise = testCase.test();
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Test timeout')), testCase.timeout);
      });

      result = await Promise.race([testPromise, timeoutPromise]);
      result.duration = performance.now() - startTime;

      // Cleanup
      if (testCase.cleanup) {
        await testCase.cleanup();
      }

      console.log(`✅ Test completed: ${testCase.name} - ${result.status}`);
      
    } catch (error) {
      result = {
        status: TestStatus.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: performance.now() - startTime,
        error: error instanceof Error ? error : new Error('Unknown error'),
      };

      console.error(`❌ Test failed: ${testCase.name}`, error);
    }

    this.testResults.set(testId, result);
    return result;
  }

  /**
   * Execute a test suite
   */
  public async executeTestSuite(config: TestSuiteConfig): Promise<TestSuiteResult> {
    const startTime = Date.now();
    console.log(`🚀 Starting security test suite: ${config.name}`);

    // Filter test cases based on configuration
    const selectedTests = Array.from(this.testCases.values()).filter(testCase => {
      // Check type inclusion
      if (!config.includedTypes.includes(testCase.type)) {
        return false;
      }

      // Check tag exclusion
      if (testCase.tags.some(tag => config.excludedTags.includes(tag))) {
        return false;
      }

      // Check minimum severity
      if (this.getSeverityLevel(testCase.severity) < this.getSeverityLevel(config.minSeverity)) {
        return false;
      }

      return testCase.enabled;
    });

    console.log(`📊 Selected ${selectedTests.length} tests for execution`);

    const results: Array<TestResult & { testCase: SecurityTestCase }> = [];
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let errors = 0;

    // Execute tests
    if (config.parallel) {
      // Parallel execution
      const testPromises = selectedTests.map(async (testCase) => {
        const result = await this.executeTestCase(testCase.id);
        return { ...result, testCase };
      });

      const parallelResults = await Promise.allSettled(testPromises);
      
      parallelResults.forEach((promiseResult) => {
        if (promiseResult.status === 'fulfilled') {
          results.push(promiseResult.value);
        } else {
          results.push({
            status: TestStatus.ERROR,
            message: 'Promise rejected',
            duration: 0,
            error: new Error(promiseResult.reason),
            testCase: selectedTests[results.length], // Fallback
          });
        }
      });
    } else {
      // Sequential execution
      for (const testCase of selectedTests) {
        const result = await this.executeTestCase(testCase.id);
        results.push({ ...result, testCase });

        // Stop on failure if configured
        if (!config.continueOnFailure && result.status === TestStatus.FAIL) {
          console.warn('⏹️ Stopping test suite due to failure');
          break;
        }
      }
    }

    // Calculate statistics
    results.forEach(result => {
      switch (result.status) {
        case TestStatus.PASS:
          passed++;
          break;
        case TestStatus.FAIL:
          failed++;
          break;
        case TestStatus.SKIP:
          skipped++;
          break;
        case TestStatus.ERROR:
          errors++;
          break;
      }
    });

    const endTime = Date.now();
    const duration = endTime - startTime;
    const totalTests = results.length;
    const passRate = totalTests > 0 ? (passed / totalTests) * 100 : 0;

    // Calculate security metrics
    const criticalFailures = results.filter(r => 
      r.status === TestStatus.FAIL && r.testCase.severity === TestSeverity.CRITICAL
    ).length;

    const highFailures = results.filter(r => 
      r.status === TestStatus.FAIL && r.testCase.severity === TestSeverity.HIGH
    ).length;

    const overallGrade = this.calculateOverallGrade(passRate, criticalFailures, highFailures);
    const securityScore = this.calculateSecurityScore(results);

    const suiteResult: TestSuiteResult = {
      name: config.name,
      startTime,
      endTime,
      duration,
      totalTests,
      passed,
      failed,
      skipped,
      errors,
      results,
      summary: {
        passRate,
        criticalFailures,
        highFailures,
        overallGrade,
        securityScore,
      },
    };

    console.log(`🏁 Test suite completed: ${config.name}`);
    console.log(`📈 Results: ${passed}/${totalTests} passed (${passRate.toFixed(1)}%)`);
    console.log(`🔒 Security Score: ${securityScore}/100 (Grade: ${overallGrade})`);

    // Generate report if requested
    if (config.generateReport) {
      await this.generateTestReport(suiteResult, config.outputPath);
    }

    return suiteResult;
  }

  /**
   * Run vulnerability scan
   */
  public async runVulnerabilityScan(): Promise<{
    vulnerabilities: Array<{
      type: string;
      severity: TestSeverity;
      description: string;
      remediation: string;
    }>;
    securityScore: number;
    recommendations: string[];
  }> {
    console.log('🔍 Starting vulnerability scan...');

    const vulnerabilities = [];
    const recommendations = [];

    try {
      // Check security headers
      const headersAssessment = securityHeaders.validateSecurityHeaders();
      if (headersAssessment.score < 80) {
        vulnerabilities.push({
          type: 'Weak Security Headers',
          severity: headersAssessment.score < 50 ? TestSeverity.HIGH : TestSeverity.MEDIUM,
          description: `Security headers score: ${headersAssessment.score}/100`,
          remediation: 'Implement comprehensive security headers configuration',
        });
        recommendations.push(...headersAssessment.recommendations);
      }

      // Check CSP implementation
      const cspAnalysis = cspImplementation.analyzeCSPSecurity();
      if (!cspAnalysis.isSecure) {
        vulnerabilities.push({
          type: 'Insecure Content Security Policy',
          severity: cspAnalysis.violationRisk === 'critical' ? TestSeverity.CRITICAL : TestSeverity.HIGH,
          description: `CSP security score: ${cspAnalysis.securityScore}/100`,
          remediation: 'Strengthen Content Security Policy configuration',
        });
        recommendations.push(...cspAnalysis.recommendations);
      }

      // Test XSS protection
      const xssTests = [
        '<script>alert("XSS")</script>',
        'javascript:alert("XSS")',
        '<img src="x" onerror="alert(\'XSS\')">',
        '<svg onload="alert(\'XSS\')">',
      ];

      for (const payload of xssTests) {
        const xssResult = xssProtection.detectXSS(payload);
        if (!xssResult.isXSS) {
          vulnerabilities.push({
            type: 'XSS Protection Bypass',
            severity: TestSeverity.HIGH,
            description: `XSS payload not detected: ${payload.substring(0, 50)}...`,
            remediation: 'Strengthen XSS protection rules and patterns',
          });
        }
      }

      // Calculate overall security score
      const baseScore = 100;
      let deductions = 0;

      vulnerabilities.forEach(vuln => {
        switch (vuln.severity) {
          case TestSeverity.CRITICAL:
            deductions += 30;
            break;
          case TestSeverity.HIGH:
            deductions += 20;
            break;
          case TestSeverity.MEDIUM:
            deductions += 10;
            break;
          case TestSeverity.LOW:
            deductions += 5;
            break;
        }
      });

      const securityScore = Math.max(0, baseScore - deductions);

      console.log(`🔍 Vulnerability scan completed: ${vulnerabilities.length} issues found`);

      return {
        vulnerabilities,
        securityScore,
        recommendations: Array.from(new Set(recommendations)),
      };

    } catch (error) {
      console.error('❌ Vulnerability scan failed:', error);
      throw error;
    }
  }

  /**
   * Generate penetration testing report
   */
  public async generatePenetrationTestReport(): Promise<{
    testDate: string;
    overallRisk: 'low' | 'medium' | 'high' | 'critical';
    findings: Array<{
      title: string;
      severity: TestSeverity;
      description: string;
      impact: string;
      remediation: string;
      evidence: any;
    }>;
    recommendations: string[];
    complianceStatus: {
      owasp: boolean;
      nist: boolean;
      iso27001: boolean;
    };
  }> {
    console.log('📋 Generating penetration test report...');

    const findings = [];
    const recommendations = [];

    // Test for common vulnerabilities
    const vulnScan = await this.runVulnerabilityScan();
    
    vulnScan.vulnerabilities.forEach(vuln => {
      findings.push({
        title: vuln.type,
        severity: vuln.severity,
        description: vuln.description,
        impact: this.getSecurityImpact(vuln.severity),
        remediation: vuln.remediation,
        evidence: {},
      });
    });

    recommendations.push(...vulnScan.recommendations);

    // Determine overall risk
    const criticalCount = findings.filter(f => f.severity === TestSeverity.CRITICAL).length;
    const highCount = findings.filter(f => f.severity === TestSeverity.HIGH).length;

    let overallRisk: 'low' | 'medium' | 'high' | 'critical';
    if (criticalCount > 0) {
      overallRisk = 'critical';
    } else if (highCount > 0) {
      overallRisk = 'high';
    } else if (findings.length > 5) {
      overallRisk = 'medium';
    } else {
      overallRisk = 'low';
    }

    // Check compliance status
    const complianceStatus = {
      owasp: vulnScan.securityScore >= 80,
      nist: vulnScan.securityScore >= 85,
      iso27001: vulnScan.securityScore >= 90,
    };

    return {
      testDate: new Date().toISOString(),
      overallRisk,
      findings,
      recommendations,
      complianceStatus,
    };
  }

  /**
   * Private helper methods
   */

  private registerDefaultTestCases(): void {
    // Security Headers Tests
    this.registerTestCase({
      id: 'security-headers-basic',
      name: 'Basic Security Headers Validation',
      description: 'Validates presence and configuration of basic security headers',
      type: TestCaseType.SECURITY_HEADERS,
      severity: TestSeverity.HIGH,
      enabled: true,
      timeout: 5000,
      test: async () => {
        const assessment = securityHeaders.validateSecurityHeaders();
        
        if (assessment.score >= 80) {
          return {
            status: TestStatus.PASS,
            message: `Security headers score: ${assessment.score}/100`,
            duration: 0,
            evidence: assessment,
          };
        } else {
          return {
            status: TestStatus.FAIL,
            message: `Poor security headers score: ${assessment.score}/100`,
            duration: 0,
            evidence: assessment,
            recommendations: assessment.recommendations,
          };
        }
      },
      tags: ['headers', 'basic'],
    });

    // XSS Protection Tests
    this.registerTestCase({
      id: 'xss-protection-basic',
      name: 'Basic XSS Protection Validation',
      description: 'Tests XSS protection against common attack vectors',
      type: TestCaseType.XSS_PROTECTION,
      severity: TestSeverity.CRITICAL,
      enabled: true,
      timeout: 10000,
      test: async () => {
        const testPayloads = [
          '<script>alert("XSS")</script>',
          '"><script>alert("XSS")</script>',
          '<img src="x" onerror="alert(\'XSS\')">',
          'javascript:alert("XSS")',
          '<svg onload="alert(\'XSS\')">',
        ];

        const failedDetections = [];

        for (const payload of testPayloads) {
          const result = xssProtection.detectXSS(payload);
          if (!result.isXSS) {
            failedDetections.push(payload);
          }
        }

        if (failedDetections.length === 0) {
          return {
            status: TestStatus.PASS,
            message: 'All XSS payloads detected successfully',
            duration: 0,
            evidence: { testedPayloads: testPayloads.length },
          };
        } else {
          return {
            status: TestStatus.FAIL,
            message: `Failed to detect ${failedDetections.length} XSS payloads`,
            duration: 0,
            evidence: { failedPayloads: failedDetections },
            recommendations: ['Review and strengthen XSS detection patterns'],
          };
        }
      },
      tags: ['xss', 'basic'],
    });

    // CSRF Protection Tests
    this.registerTestCase({
      id: 'csrf-protection-basic',
      name: 'Basic CSRF Protection Validation',
      description: 'Tests CSRF protection mechanisms',
      type: TestCaseType.CSRF_PROTECTION,
      severity: TestSeverity.HIGH,
      enabled: true,
      timeout: 5000,
      test: async () => {
        // Generate a token
        const token = csrfProtection.generateToken();
        
        if (!token) {
          return {
            status: TestStatus.FAIL,
            message: 'Failed to generate CSRF token',
            duration: 0,
          };
        }

        // Test valid request
        const validContext: RequestContext = {
          method: 'POST',
          url: '/api/test',
          headers: {
            'x-csrf-token': token,
            'content-type': 'application/json',
          },
          timestamp: Date.now(),
        };

        const validResult = csrfProtection.validateRequest(validContext);
        
        if (validResult.isValid) {
          return {
            status: TestStatus.PASS,
            message: 'CSRF protection working correctly',
            duration: 0,
            evidence: { tokenGenerated: true, validationPassed: true },
          };
        } else {
          return {
            status: TestStatus.FAIL,
            message: 'CSRF validation failed for valid request',
            duration: 0,
            evidence: validResult,
          };
        }
      },
      tags: ['csrf', 'basic'],
    });

    // CSP Implementation Tests
    this.registerTestCase({
      id: 'csp-implementation-basic',
      name: 'Basic CSP Implementation Validation',
      description: 'Tests Content Security Policy configuration',
      type: TestCaseType.CSP_IMPLEMENTATION,
      severity: TestSeverity.HIGH,
      enabled: true,
      timeout: 5000,
      test: async () => {
        const analysis = cspImplementation.analyzeCSPSecurity();
        
        if (analysis.isSecure && analysis.securityScore >= 80) {
          return {
            status: TestStatus.PASS,
            message: `CSP security score: ${analysis.securityScore}/100`,
            duration: 0,
            evidence: analysis,
          };
        } else {
          return {
            status: TestStatus.FAIL,
            message: `Poor CSP security score: ${analysis.securityScore}/100`,
            duration: 0,
            evidence: analysis,
            recommendations: analysis.recommendations,
          };
        }
      },
      tags: ['csp', 'basic'],
    });

    console.log('📚 Default security test cases registered');
  }

  private getSeverityLevel(severity: TestSeverity): number {
    const levels = {
      [TestSeverity.CRITICAL]: 5,
      [TestSeverity.HIGH]: 4,
      [TestSeverity.MEDIUM]: 3,
      [TestSeverity.LOW]: 2,
      [TestSeverity.INFO]: 1,
    };
    return levels[severity] || 0;
  }

  private calculateOverallGrade(
    passRate: number, 
    criticalFailures: number, 
    highFailures: number
  ): 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' {
    if (criticalFailures > 0) return 'F';
    if (highFailures > 2) return 'D';
    if (passRate >= 95 && highFailures === 0) return 'A+';
    if (passRate >= 90 && highFailures <= 1) return 'A';
    if (passRate >= 80) return 'B';
    if (passRate >= 70) return 'C';
    if (passRate >= 60) return 'D';
    return 'F';
  }

  private calculateSecurityScore(results: Array<TestResult & { testCase: SecurityTestCase }>): number {
    let totalWeight = 0;
    let weightedScore = 0;

    results.forEach(result => {
      const weight = this.getSeverityLevel(result.testCase.severity);
      totalWeight += weight;

      if (result.status === TestStatus.PASS) {
        weightedScore += weight;
      }
    });

    return totalWeight > 0 ? Math.round((weightedScore / totalWeight) * 100) : 0;
  }

  private getSecurityImpact(severity: TestSeverity): string {
    const impacts = {
      [TestSeverity.CRITICAL]: 'Complete system compromise possible',
      [TestSeverity.HIGH]: 'Significant security risk with potential for data breach',
      [TestSeverity.MEDIUM]: 'Moderate security risk requiring attention',
      [TestSeverity.LOW]: 'Minor security concern with limited impact',
      [TestSeverity.INFO]: 'Informational finding for security awareness',
    };
    return impacts[severity] || 'Unknown impact';
  }

  private async generateTestReport(result: TestSuiteResult, outputPath?: string): Promise<void> {
    const report = {
      metadata: {
        generated: new Date().toISOString(),
        suite: result.name,
        duration: result.duration,
        version: '1.0.0',
      },
      summary: result.summary,
      statistics: {
        total: result.totalTests,
        passed: result.passed,
        failed: result.failed,
        skipped: result.skipped,
        errors: result.errors,
      },
      results: result.results.map(r => ({
        test: r.testCase.name,
        status: r.status,
        message: r.message,
        duration: r.duration,
        severity: r.testCase.severity,
        type: r.testCase.type,
        recommendations: r.recommendations,
      })),
    };

    const reportJson = JSON.stringify(report, null, 2);
    
    if (outputPath) {
      // In a real implementation, you would write to the file system
      console.log(`📄 Test report would be saved to: ${outputPath}`);
    }

    console.log('📊 Test Report Generated:', {
      suite: result.name,
      score: result.summary.securityScore,
      grade: result.summary.overallGrade,
      passRate: result.summary.passRate.toFixed(1) + '%',
    });
  }
}

// Quick test runner functions
export async function runQuickSecurityTest(): Promise<TestSuiteResult> {
  const testingService = SecurityTestingService.getInstance();
  
  const config: TestSuiteConfig = {
    name: 'Quick Security Test',
    timeout: 30000,
    parallel: true,
    continueOnFailure: true,
    generateReport: false,
    includedTypes: Object.values(TestCaseType),
    excludedTags: [],
    minSeverity: TestSeverity.INFO,
  };

  return testingService.executeTestSuite(config);
}

export async function runSecurityAudit(): Promise<any> {
  const testingService = SecurityTestingService.getInstance();
  
  const [vulnScan, penTestReport] = await Promise.all([
    testingService.runVulnerabilityScan(),
    testingService.generatePenetrationTestReport(),
  ]);

  return {
    vulnerabilityScaen: vulnScan,
    penetrationTest: penTestReport,
    timestamp: new Date().toISOString(),
  };
}

// Global instance
export const securityTesting = SecurityTestingService.getInstance();