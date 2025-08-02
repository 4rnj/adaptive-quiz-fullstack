"""
Performance Monitoring and Observability for Adaptive Quiz Backend
Tracks Lambda performance, DynamoDB operations, and business metrics
"""

import time
import logging
import json
from typing import Dict, Any, Optional, Callable
from functools import wraps
from contextlib import contextmanager
from dataclasses import dataclass, field
from collections import defaultdict
import boto3

logger = logging.getLogger(__name__)

@dataclass
class PerformanceMetrics:
    """Performance metrics data structure"""
    operation_name: str
    execution_time_ms: float
    success: bool
    error_type: Optional[str] = None
    custom_metrics: Dict[str, Any] = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)

class PerformanceMonitor:
    """
    Comprehensive performance monitoring for serverless applications
    Tracks execution times, error rates, and custom business metrics
    """
    
    def __init__(self):
        self.metrics = defaultdict(list)
        self.error_counts = defaultdict(int)
        self.custom_metrics = defaultdict(list)
        
        # CloudWatch client for custom metrics
        try:
            self.cloudwatch = boto3.client('cloudwatch')
        except Exception as e:
            logger.warning(f"Failed to initialize CloudWatch client: {e}")
            self.cloudwatch = None
    
    def track_operation(self, operation_name: str):
        """Decorator to track operation performance"""
        def decorator(func: Callable) -> Callable:
            @wraps(func)
            def wrapper(*args, **kwargs):
                start_time = time.time()
                success = True
                error_type = None
                
                try:
                    result = func(*args, **kwargs)
                    return result
                except Exception as e:
                    success = False
                    error_type = type(e).__name__
                    raise
                finally:
                    execution_time = (time.time() - start_time) * 1000
                    
                    # Record metrics
                    self.record_operation_metric(
                        operation_name,
                        execution_time,
                        success,
                        error_type
                    )
            
            return wrapper
        return decorator
    
    @contextmanager
    def track_execution_time(self, operation_name: str, custom_metrics: Optional[Dict] = None):
        """Context manager for tracking execution time"""
        start_time = time.time()
        success = True
        error_type = None
        
        try:
            yield
        except Exception as e:
            success = False
            error_type = type(e).__name__
            raise
        finally:
            execution_time = (time.time() - start_time) * 1000
            
            self.record_operation_metric(
                operation_name,
                execution_time,
                success,
                error_type,
                custom_metrics or {}
            )
    
    def record_operation_metric(self, operation_name: str, execution_time_ms: float,
                               success: bool, error_type: Optional[str] = None,
                               custom_metrics: Optional[Dict] = None):
        """Record operation performance metrics"""
        
        metric = PerformanceMetrics(
            operation_name=operation_name,
            execution_time_ms=execution_time_ms,
            success=success,
            error_type=error_type,
            custom_metrics=custom_metrics or {}
        )
        
        self.metrics[operation_name].append(metric)
        
        if not success:
            self.error_counts[f"{operation_name}_{error_type}"] += 1
        
        # Log slow operations
        if execution_time_ms > 1000:  # Slower than 1 second
            logger.warning(f"Slow operation: {operation_name} took {execution_time_ms:.2f}ms")
        
        # Send to CloudWatch if configured
        self._send_to_cloudwatch(metric)
        
        # Log performance metrics
        logger.info(f"Performance: {operation_name} - {execution_time_ms:.2f}ms - {'SUCCESS' if success else 'FAILED'}")
    
    def track_adaptive_algorithm_performance(self, execution_time_ms: float, 
                                           question_pool_size: int, 
                                           wrong_pool_size: int,
                                           selection_strategy: str):
        """Track adaptive learning algorithm specific metrics"""
        
        custom_metrics = {
            'question_pool_size': question_pool_size,
            'wrong_pool_size': wrong_pool_size,
            'selection_strategy': selection_strategy,
            'efficiency_score': self._calculate_efficiency_score(execution_time_ms, question_pool_size)
        }
        
        self.record_operation_metric(
            "adaptive_algorithm",
            execution_time_ms,
            True,
            None,
            custom_metrics
        )
    
    def track_session_state_operations(self, operation: str, success: bool, 
                                     latency_ms: float, session_complexity: int = 0):
        """Track session state management performance"""
        
        custom_metrics = {
            'session_complexity': session_complexity,
            'operation_type': operation
        }
        
        self.record_operation_metric(
            f"session_state_{operation}",
            latency_ms,
            success,
            None if success else "SessionStateError",
            custom_metrics
        )
    
    def track_question_shuffling_performance(self, shuffle_time_ms: float, 
                                           answer_count: int, complexity: str):
        """Track question shuffling performance"""
        
        custom_metrics = {
            'answer_count': answer_count,
            'shuffle_complexity': complexity
        }
        
        self.record_operation_metric(
            "question_shuffling",
            shuffle_time_ms,
            True,
            None,
            custom_metrics
        )
    
    def track_database_operation(self, operation_type: str, table_name: str,
                               execution_time_ms: float, success: bool,
                               items_processed: int = 0):
        """Track DynamoDB operation performance"""
        
        custom_metrics = {
            'table_name': table_name,
            'items_processed': items_processed,
            'items_per_ms': items_processed / execution_time_ms if execution_time_ms > 0 else 0
        }
        
        self.record_operation_metric(
            f"dynamodb_{operation_type}",
            execution_time_ms,
            success,
            None if success else "DynamoDBError",
            custom_metrics
        )
    
    def alert_on_error_rate_threshold(self, service: str, error_rate: float, threshold: float = 0.05):
        """Alert when error rate exceeds threshold"""
        
        if error_rate > threshold:
            alert_message = f"High error rate detected for {service}: {error_rate:.2%} (threshold: {threshold:.2%})"
            logger.critical(alert_message, extra={
                'alert_type': 'error_rate_threshold',
                'service': service,
                'error_rate': error_rate,
                'threshold': threshold
            })
            
            # Send alert to CloudWatch
            self._send_alert_to_cloudwatch(service, error_rate, threshold)
    
    def get_performance_summary(self, operation_name: Optional[str] = None) -> Dict[str, Any]:
        """Get performance summary for monitoring dashboards"""
        
        if operation_name:
            metrics = self.metrics.get(operation_name, [])
        else:
            metrics = []
            for op_metrics in self.metrics.values():
                metrics.extend(op_metrics)
        
        if not metrics:
            return {'message': 'No metrics available'}
        
        # Calculate summary statistics
        execution_times = [m.execution_time_ms for m in metrics]
        successful_ops = [m for m in metrics if m.success]
        failed_ops = [m for m in metrics if not m.success]
        
        summary = {
            'total_operations': len(metrics),
            'successful_operations': len(successful_ops),
            'failed_operations': len(failed_ops),
            'success_rate': len(successful_ops) / len(metrics) if metrics else 0,
            'avg_execution_time_ms': sum(execution_times) / len(execution_times) if execution_times else 0,
            'min_execution_time_ms': min(execution_times) if execution_times else 0,
            'max_execution_time_ms': max(execution_times) if execution_times else 0,
            'p95_execution_time_ms': self._calculate_percentile(execution_times, 0.95) if execution_times else 0,
            'p99_execution_time_ms': self._calculate_percentile(execution_times, 0.99) if execution_times else 0
        }
        
        # Add error breakdown
        if failed_ops:
            error_breakdown = defaultdict(int)
            for op in failed_ops:
                error_breakdown[op.error_type] += 1
            summary['error_breakdown'] = dict(error_breakdown)
        
        return summary
    
    def get_adaptive_learning_metrics(self) -> Dict[str, Any]:
        """Get specific metrics for adaptive learning algorithm"""
        
        adaptive_metrics = self.metrics.get('adaptive_algorithm', [])
        if not adaptive_metrics:
            return {'message': 'No adaptive learning metrics available'}
        
        # Calculate algorithm-specific metrics
        efficiency_scores = [m.custom_metrics.get('efficiency_score', 0) for m in adaptive_metrics]
        pool_sizes = [m.custom_metrics.get('question_pool_size', 0) for m in adaptive_metrics]
        wrong_pool_sizes = [m.custom_metrics.get('wrong_pool_size', 0) for m in adaptive_metrics]
        
        return {
            'total_selections': len(adaptive_metrics),
            'avg_efficiency_score': sum(efficiency_scores) / len(efficiency_scores) if efficiency_scores else 0,
            'avg_question_pool_size': sum(pool_sizes) / len(pool_sizes) if pool_sizes else 0,
            'avg_wrong_pool_size': sum(wrong_pool_sizes) / len(wrong_pool_sizes) if wrong_pool_sizes else 0,
            'algorithm_performance': self.get_performance_summary('adaptive_algorithm')
        }
    
    def _calculate_efficiency_score(self, execution_time_ms: float, question_pool_size: int) -> float:
        """Calculate efficiency score for adaptive algorithm"""
        if question_pool_size == 0:
            return 0.0
        
        # Lower execution time and larger pool size = higher efficiency
        base_score = 1000 / execution_time_ms if execution_time_ms > 0 else 0
        pool_factor = min(question_pool_size / 100, 2.0)  # Normalize to reasonable range
        
        return base_score * pool_factor
    
    def _calculate_percentile(self, values: list, percentile: float) -> float:
        """Calculate percentile from list of values"""
        if not values:
            return 0.0
        
        sorted_values = sorted(values)
        index = int(percentile * len(sorted_values))
        index = min(index, len(sorted_values) - 1)
        
        return sorted_values[index]
    
    def _send_to_cloudwatch(self, metric: PerformanceMetrics):
        """Send metrics to CloudWatch"""
        if not self.cloudwatch:
            return
        
        try:
            # Send execution time metric
            self.cloudwatch.put_metric_data(
                Namespace='QuizApp/Performance',
                MetricData=[
                    {
                        'MetricName': 'ExecutionTime',
                        'Dimensions': [
                            {
                                'Name': 'Operation',
                                'Value': metric.operation_name
                            }
                        ],
                        'Value': metric.execution_time_ms,
                        'Unit': 'Milliseconds',
                        'Timestamp': metric.timestamp
                    },
                    {
                        'MetricName': 'OperationCount',
                        'Dimensions': [
                            {
                                'Name': 'Operation',
                                'Value': metric.operation_name
                            },
                            {
                                'Name': 'Status',
                                'Value': 'Success' if metric.success else 'Error'
                            }
                        ],
                        'Value': 1,
                        'Unit': 'Count',
                        'Timestamp': metric.timestamp
                    }
                ]
            )
            
            # Send custom metrics if available
            if metric.custom_metrics:
                custom_metric_data = []
                for key, value in metric.custom_metrics.items():
                    if isinstance(value, (int, float)):
                        custom_metric_data.append({
                            'MetricName': key,
                            'Dimensions': [
                                {
                                    'Name': 'Operation',
                                    'Value': metric.operation_name
                                }
                            ],
                            'Value': value,
                            'Unit': 'None',
                            'Timestamp': metric.timestamp
                        })
                
                if custom_metric_data:
                    self.cloudwatch.put_metric_data(
                        Namespace='QuizApp/Custom',
                        MetricData=custom_metric_data
                    )
                    
        except Exception as e:
            logger.warning(f"Failed to send metrics to CloudWatch: {e}")
    
    def _send_alert_to_cloudwatch(self, service: str, error_rate: float, threshold: float):
        """Send alert to CloudWatch"""
        if not self.cloudwatch:
            return
        
        try:
            self.cloudwatch.put_metric_data(
                Namespace='QuizApp/Alerts',
                MetricData=[
                    {
                        'MetricName': 'ErrorRateAlert',
                        'Dimensions': [
                            {
                                'Name': 'Service',
                                'Value': service
                            }
                        ],
                        'Value': error_rate,
                        'Unit': 'Percent'
                    }
                ]
            )
        except Exception as e:
            logger.warning(f"Failed to send alert to CloudWatch: {e}")
    
    def reset_metrics(self):
        """Reset all metrics (useful for testing)"""
        self.metrics.clear()
        self.error_counts.clear()
        self.custom_metrics.clear()
    
    def export_metrics_to_json(self) -> str:
        """Export metrics to JSON for external analysis"""
        export_data = {
            'metrics': {
                operation: [
                    {
                        'operation_name': m.operation_name,
                        'execution_time_ms': m.execution_time_ms,
                        'success': m.success,
                        'error_type': m.error_type,
                        'custom_metrics': m.custom_metrics,
                        'timestamp': m.timestamp
                    }
                    for m in metrics
                ]
                for operation, metrics in self.metrics.items()
            },
            'error_counts': dict(self.error_counts),
            'summary': self.get_performance_summary()
        }
        
        return json.dumps(export_data, indent=2)

# Global performance monitor instance
performance_monitor = PerformanceMonitor()

# Decorator aliases for common operations
def track_lambda_performance(operation_name: str):
    """Convenience decorator for Lambda function performance tracking"""
    return performance_monitor.track_operation(f"lambda_{operation_name}")

def track_service_performance(service_name: str):
    """Convenience decorator for service layer performance tracking"""
    return performance_monitor.track_operation(f"service_{service_name}")

def track_database_performance(operation_type: str):
    """Convenience decorator for database operation performance tracking"""
    return performance_monitor.track_operation(f"db_{operation_type}")

# Context managers for specific use cases
@contextmanager
def track_adaptive_learning_execution():
    """Context manager for tracking adaptive learning algorithm execution"""
    start_time = time.time()
    try:
        yield
    finally:
        execution_time = (time.time() - start_time) * 1000
        logger.info(f"Adaptive learning execution completed in {execution_time:.2f}ms")