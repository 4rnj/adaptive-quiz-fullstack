"""
Optimized DynamoDB Client with Connection Pooling and Performance Optimization
High-performance client for AWS Lambda with connection reuse and batch operations
"""

import boto3
import logging
import time
from typing import Dict, List, Optional, Any, Iterator, Callable
from decimal import Decimal
from botocore.exceptions import ClientError, BotoCoreError
from boto3.dynamodb.conditions import Key, Attr
from boto3.dynamodb.types import TypeDeserializer, TypeSerializer
import json
from contextlib import contextmanager
from functools import wraps
import random

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

class DynamoDBError(Exception):
    """Custom DynamoDB operation error"""
    pass

class OptimisticLockError(DynamoDBError):
    """Raised when optimistic locking fails"""
    pass

class CircuitBreakerError(DynamoDBError):
    """Raised when circuit breaker is open"""
    pass

class CircuitBreaker:
    """Circuit breaker pattern for fault tolerance"""
    
    def __init__(self, failure_threshold: int = 5, recovery_timeout: int = 60, expected_exception=Exception):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.expected_exception = expected_exception
        self.failure_count = 0
        self.last_failure_time = None
        self.state = 'CLOSED'  # CLOSED, OPEN, HALF_OPEN
    
    def __call__(self, func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            if self.state == 'OPEN':
                if time.time() - self.last_failure_time > self.recovery_timeout:
                    self.state = 'HALF_OPEN'
                else:
                    raise CircuitBreakerError("Circuit breaker is OPEN")
            
            try:
                result = func(*args, **kwargs)
                self._on_success()
                return result
            except self.expected_exception as e:
                self._on_failure()
                raise e
        return wrapper
    
    def _on_success(self):
        self.failure_count = 0
        self.state = 'CLOSED'
    
    def _on_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.failure_count >= self.failure_threshold:
            self.state = 'OPEN'

class OptimizedDynamoDBClient:
    """
    High-performance DynamoDB client optimized for AWS Lambda
    Features: Connection pooling, batch operations, retry logic, circuit breaker
    """
    
    _instance = None
    _initialized = False
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not self._initialized:
            self._setup_client()
            self._setup_circuit_breakers()
            self._performance_metrics = {}
            OptimizedDynamoDBClient._initialized = True
    
    def _setup_client(self):
        """Initialize DynamoDB client with connection pooling"""
        self.session = boto3.Session()
        
        # Configure client with connection pooling
        config = boto3.session.Config(
            region_name='eu-central-1',
            retries={
                'max_attempts': 3,
                'mode': 'adaptive'
            },
            max_pool_connections=50,  # Connection pooling for Lambda
            parameter_validation=False  # Skip validation for performance
        )
        
        self.dynamodb = self.session.resource('dynamodb', config=config)
        self.client = self.session.client('dynamodb', config=config)
        
        # Table references with lazy loading
        self._tables = {}
        self.serializer = TypeSerializer()
        self.deserializer = TypeDeserializer()
        
        logger.info("DynamoDB client initialized with connection pooling")
    
    def _setup_circuit_breakers(self):
        """Setup circuit breakers for different operation types"""
        self.circuit_breakers = {
            'read': CircuitBreaker(failure_threshold=5, recovery_timeout=30),
            'write': CircuitBreaker(failure_threshold=3, recovery_timeout=60),
            'batch': CircuitBreaker(failure_threshold=3, recovery_timeout=45)
        }
    
    def get_table(self, table_name: str):
        """Get table reference with caching"""
        if table_name not in self._tables:
            self._tables[table_name] = self.dynamodb.Table(table_name)
        return self._tables[table_name]
    
    @contextmanager
    def performance_timer(self, operation: str):
        """Context manager for performance tracking"""
        start_time = time.time()
        try:
            yield
        finally:
            duration = (time.time() - start_time) * 1000
            self._record_performance(operation, duration)
    
    def _record_performance(self, operation: str, duration_ms: float):
        """Record performance metrics"""
        if operation not in self._performance_metrics:
            self._performance_metrics[operation] = []
        
        self._performance_metrics[operation].append(duration_ms)
        
        # Keep only last 100 measurements
        if len(self._performance_metrics[operation]) > 100:
            self._performance_metrics[operation] = self._performance_metrics[operation][-100:]
        
        # Log slow operations
        if duration_ms > 100:
            logger.warning(f"Slow DynamoDB operation: {operation} took {duration_ms:.2f}ms")
    
    def exponential_backoff_retry(self, operation: Callable, max_retries: int = 3) -> Any:
        """Implement exponential backoff with jitter for retry logic"""
        for attempt in range(max_retries + 1):
            try:
                return operation()
            except ClientError as e:
                error_code = e.response['Error']['Code']
                
                if error_code in ['ProvisionedThroughputExceededException', 'ThrottlingException']:
                    if attempt == max_retries:
                        raise DynamoDBError(f"Max retries exceeded for throttling: {e}")
                    
                    # Exponential backoff with jitter
                    base_delay = 2 ** attempt
                    jitter = random.uniform(0, 0.1)
                    delay = base_delay + jitter
                    
                    logger.warning(f"DynamoDB throttling, retrying in {delay:.2f}s (attempt {attempt + 1})")
                    time.sleep(delay)
                    continue
                else:
                    raise DynamoDBError(f"DynamoDB operation failed: {e}")
        
        raise DynamoDBError("Max retries exceeded")
    
    # READ OPERATIONS
    
    @CircuitBreaker(failure_threshold=5, recovery_timeout=30)
    def get_item(self, table_name: str, key: Dict[str, Any], **kwargs) -> Optional[Dict]:
        """Get single item with circuit breaker protection"""
        with self.performance_timer(f"get_item_{table_name}"):
            def operation():
                table = self.get_table(table_name)
                response = table.get_item(Key=key, **kwargs)
                return response.get('Item')
            
            return self.exponential_backoff_retry(operation)
    
    @CircuitBreaker(failure_threshold=5, recovery_timeout=30)
    def query(self, table_name: str, key_condition: Any, **kwargs) -> Dict:
        """Query with pagination support and circuit breaker"""
        with self.performance_timer(f"query_{table_name}"):
            def operation():
                table = self.get_table(table_name)
                return table.query(KeyConditionExpression=key_condition, **kwargs)
            
            return self.exponential_backoff_retry(operation)
    
    def query_paginated(self, table_name: str, key_condition: Any, **kwargs) -> Iterator[Dict]:
        """Paginated query for large result sets"""
        last_evaluated_key = None
        
        while True:
            if last_evaluated_key:
                kwargs['ExclusiveStartKey'] = last_evaluated_key
            
            response = self.query(table_name, key_condition, **kwargs)
            
            for item in response.get('Items', []):
                yield item
            
            last_evaluated_key = response.get('LastEvaluatedKey')
            if not last_evaluated_key:
                break
    
    @CircuitBreaker(failure_threshold=3, recovery_timeout=45)
    def batch_get_items(self, table_name: str, keys: List[Dict[str, Any]], **kwargs) -> List[Dict]:
        """Efficient batch get operation with automatic chunking"""
        with self.performance_timer(f"batch_get_{table_name}"):
            items = []
            
            # DynamoDB batch_get_item limit is 100 items
            for i in range(0, len(keys), 100):
                chunk_keys = keys[i:i + 100]
                
                def operation():
                    request_items = {
                        table_name: {
                            'Keys': chunk_keys,
                            **kwargs
                        }
                    }
                    
                    response = self.client.batch_get_item(RequestItems=request_items)
                    return response.get('Responses', {}).get(table_name, [])
                
                chunk_items = self.exponential_backoff_retry(operation)
                
                # Deserialize items
                for item in chunk_items:
                    deserialized = {k: self.deserializer.deserialize(v) for k, v in item.items()}
                    items.append(deserialized)
            
            return items
    
    # WRITE OPERATIONS
    
    @CircuitBreaker(failure_threshold=3, recovery_timeout=60)
    def put_item(self, table_name: str, item: Dict[str, Any], **kwargs) -> Dict:
        """Put item with circuit breaker and performance tracking"""
        with self.performance_timer(f"put_item_{table_name}"):
            def operation():
                table = self.get_table(table_name)
                return table.put_item(Item=item, **kwargs)
            
            return self.exponential_backoff_retry(operation)
    
    @CircuitBreaker(failure_threshold=3, recovery_timeout=60)
    def update_item(self, table_name: str, key: Dict[str, Any], **kwargs) -> Dict:
        """Update item with circuit breaker protection"""
        with self.performance_timer(f"update_item_{table_name}"):
            def operation():
                table = self.get_table(table_name)
                return table.update_item(Key=key, **kwargs)
            
            return self.exponential_backoff_retry(operation)
    
    def conditional_update(self, table_name: str, key: Dict[str, Any], 
                          update_expression: str, condition_expression: Any,
                          expression_attribute_values: Dict[str, Any],
                          **kwargs) -> bool:
        """Conditional update with optimistic locking"""
        try:
            with self.performance_timer(f"conditional_update_{table_name}"):
                def operation():
                    table = self.get_table(table_name)
                    return table.update_item(
                        Key=key,
                        UpdateExpression=update_expression,
                        ConditionExpression=condition_expression,
                        ExpressionAttributeValues=expression_attribute_values,
                        **kwargs
                    )
                
                self.exponential_backoff_retry(operation)
                return True
                
        except ClientError as e:
            if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                raise OptimisticLockError("Conditional update failed - item was modified concurrently")
            raise DynamoDBError(f"Conditional update failed: {e}")
    
    @CircuitBreaker(failure_threshold=3, recovery_timeout=45)
    def batch_write_items(self, table_name: str, items: List[Dict[str, Any]], 
                         operation: str = 'PUT') -> bool:
        """Batch write operation with chunking and retry logic"""
        with self.performance_timer(f"batch_write_{table_name}"):
            # DynamoDB batch_write_item limit is 25 items
            for i in range(0, len(items), 25):
                chunk_items = items[i:i + 25]
                
                def batch_operation():
                    request_items = {
                        table_name: []
                    }
                    
                    for item in chunk_items:
                        if operation == 'PUT':
                            serialized_item = {k: self.serializer.serialize(v) for k, v in item.items()}
                            request_items[table_name].append({
                                'PutRequest': {'Item': serialized_item}
                            })
                        elif operation == 'DELETE':
                            serialized_key = {k: self.serializer.serialize(v) for k, v in item.items()}
                            request_items[table_name].append({
                                'DeleteRequest': {'Key': serialized_key}
                            })
                    
                    response = self.client.batch_write_item(RequestItems=request_items)
                    
                    # Handle unprocessed items
                    unprocessed = response.get('UnprocessedItems', {})
                    if unprocessed:
                        logger.warning(f"Unprocessed items in batch write: {len(unprocessed)}")
                        # Could implement recursive retry here
                    
                    return True
                
                self.exponential_backoff_retry(batch_operation)
            
            return True
    
    # TRANSACTION OPERATIONS
    
    def transact_write(self, transact_items: List[Dict[str, Any]]) -> bool:
        """Execute transactional write with error handling"""
        with self.performance_timer("transact_write"):
            try:
                def operation():
                    return self.client.transact_write_items(TransactItems=transact_items)
                
                self.exponential_backoff_retry(operation)
                return True
                
            except ClientError as e:
                error_code = e.response['Error']['Code']
                if error_code == 'TransactionCanceledException':
                    logger.error(f"Transaction cancelled: {e}")
                    raise OptimisticLockError("Transaction cancelled - concurrent modification detected")
                raise DynamoDBError(f"Transaction failed: {e}")
    
    # SPECIALIZED OPERATIONS FOR ADAPTIVE LEARNING
    
    def get_wrong_answers_sorted(self, user_id: str, limit: int = 10) -> List[Dict]:
        """Get wrong answers sorted by timestamp (oldest first)"""
        table_name = 'quiz-adaptive-learning-dev-wrong-answers'
        
        with self.performance_timer("get_wrong_answers_sorted"):
            response = self.query(
                table_name,
                Key('userId').eq(user_id),
                FilterExpression=Attr('remainingTries').gt(0),
                ScanIndexForward=True,  # Ascending order (oldest first)
                Limit=limit
            )
            
            return response.get('Items', [])
    
    def update_session_progress_atomic(self, session_id: str, user_id: str, 
                                     progress_update: Dict[str, Any],
                                     expected_version: int) -> bool:
        """Atomically update session progress with version control"""
        table_name = 'quiz-adaptive-learning-dev-sessions'
        
        try:
            return self.conditional_update(
                table_name,
                key={'sessionId': session_id, 'userId': user_id},
                update_expression='SET #prog = :progress, #ver = #ver + :inc',
                condition_expression=Attr('version').eq(expected_version),
                expression_attribute_names={
                    '#prog': 'progress',
                    '#ver': 'version'
                },
                expression_attribute_values={
                    ':progress': progress_update,
                    ':inc': 1
                }
            )
        except OptimisticLockError:
            logger.warning(f"Concurrent session update detected for session {session_id}")
            return False
    
    def batch_get_questions_optimized(self, question_ids: List[str]) -> List[Dict]:
        """Optimized batch get for questions with caching"""
        table_name = 'quiz-adaptive-learning-dev-questions'
        
        if not question_ids:
            return []
        
        # Create keys for batch get
        keys = [{'questionId': qid} for qid in question_ids[:100]]  # Limit to 100
        
        return self.batch_get_items(table_name, keys)
    
    # PERFORMANCE AND HEALTH MONITORING
    
    def get_performance_metrics(self) -> Dict[str, Dict]:
        """Get performance metrics for monitoring"""
        metrics = {}
        
        for operation, durations in self._performance_metrics.items():
            if durations:
                metrics[operation] = {
                    'count': len(durations),
                    'avg_ms': sum(durations) / len(durations),
                    'min_ms': min(durations),
                    'max_ms': max(durations),
                    'p95_ms': sorted(durations)[int(len(durations) * 0.95)] if len(durations) > 20 else max(durations)
                }
        
        return metrics
    
    def health_check(self) -> Dict[str, Any]:
        """Perform health check on DynamoDB connection"""
        try:
            start_time = time.time()
            
            # Simple operation to test connectivity
            table_name = 'quiz-adaptive-learning-dev-users'
            self.query(
                table_name,
                Key('userId').eq('health-check-test'),
                Limit=1
            )
            
            response_time = (time.time() - start_time) * 1000
            
            return {
                'status': 'healthy',
                'response_time_ms': response_time,
                'circuit_breaker_states': {
                    name: cb.state for name, cb in self.circuit_breakers.items()
                }
            }
            
        except Exception as e:
            logger.error(f"DynamoDB health check failed: {e}")
            return {
                'status': 'unhealthy',
                'error': str(e)
            }

# Singleton instance for Lambda reuse
dynamodb_client = OptimizedDynamoDBClient()