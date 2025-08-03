"""
Test Suite for Optimized DynamoDB Client
Tests for connection pooling, circuit breaker, batch operations, and performance optimization
"""

import pytest
import time
from unittest.mock import Mock, patch, MagicMock
from botocore.exceptions import ClientError

from src.utils.dynamodb_client import (
    OptimizedDynamoDBClient, DynamoDBError, OptimisticLockError, CircuitBreakerError, CircuitBreaker
)


class TestCircuitBreaker:
    
    def test_circuit_breaker_closed_state(self):
        """Test circuit breaker in closed state allows operations"""
        
        breaker = CircuitBreaker(failure_threshold=3, recovery_timeout=60)
        
        @breaker
        def test_operation():
            return "success"
        
        result = test_operation()
        assert result == "success"
        assert breaker.state == 'CLOSED'
        assert breaker.failure_count == 0
    
    def test_circuit_breaker_failure_tracking(self):
        """Test circuit breaker tracks failures"""
        
        breaker = CircuitBreaker(failure_threshold=2, recovery_timeout=60, expected_exception=ValueError)
        
        @breaker
        def failing_operation():
            raise ValueError("Test error")
        
        # First failure
        with pytest.raises(ValueError):
            failing_operation()
        
        assert breaker.failure_count == 1
        assert breaker.state == 'CLOSED'
        
        # Second failure should open the circuit
        with pytest.raises(ValueError):
            failing_operation()
        
        assert breaker.failure_count == 2
        assert breaker.state == 'OPEN'
    
    def test_circuit_breaker_open_state(self):
        """Test circuit breaker in open state blocks operations"""
        
        breaker = CircuitBreaker(failure_threshold=1, recovery_timeout=60, expected_exception=ValueError)
        
        @breaker
        def failing_operation():
            raise ValueError("Test error")
        
        # Trigger failure to open circuit
        with pytest.raises(ValueError):
            failing_operation()
        
        assert breaker.state == 'OPEN'
        
        # Next call should raise CircuitBreakerError
        with pytest.raises(CircuitBreakerError):
            failing_operation()
    
    def test_circuit_breaker_half_open_recovery(self):
        """Test circuit breaker recovery to half-open state"""
        
        breaker = CircuitBreaker(failure_threshold=1, recovery_timeout=0.1, expected_exception=ValueError)
        
        @breaker
        def operation():
            if not hasattr(operation, 'call_count'):
                operation.call_count = 0
            operation.call_count += 1
            
            if operation.call_count == 1:
                raise ValueError("First call fails")
            return "success"
        
        # First call fails and opens circuit
        with pytest.raises(ValueError):
            operation()
        assert breaker.state == 'OPEN'
        
        # Wait for recovery timeout
        time.sleep(0.2)
        
        # Next call should work (half-open -> closed)
        result = operation()
        assert result == "success"
        assert breaker.state == 'CLOSED'


class TestOptimizedDynamoDBClient:
    
    def setup_method(self):
        """Setup for each test method"""
        # Reset singleton state
        OptimizedDynamoDBClient._instance = None
        OptimizedDynamoDBClient._initialized = False
        
        with patch('boto3.Session'):
            self.client = OptimizedDynamoDBClient()
    
    def test_singleton_pattern(self):
        """Test that client follows singleton pattern"""
        
        with patch('boto3.Session'):
            client1 = OptimizedDynamoDBClient()
            client2 = OptimizedDynamoDBClient()
        
        assert client1 is client2
    
    @patch('boto3.Session')
    def test_table_caching(self, mock_session):
        """Test that table references are cached"""
        
        mock_dynamodb = Mock()
        mock_table = Mock()
        mock_session.return_value.resource.return_value = mock_dynamodb
        mock_dynamodb.Table.return_value = mock_table
        
        client = OptimizedDynamoDBClient()
        
        # First call should create table reference
        table1 = client.get_table('test-table')
        
        # Second call should return cached reference
        table2 = client.get_table('test-table')
        
        assert table1 is table2
        assert mock_dynamodb.Table.call_count == 1
    
    def test_performance_tracking(self):
        """Test performance metrics tracking"""
        
        client = self.client
        
        with client.performance_timer('test_operation'):
            time.sleep(0.1)  # Simulate operation
        
        assert 'test_operation' in client._performance_metrics
        metrics = client._performance_metrics['test_operation']
        assert len(metrics) == 1
        assert metrics[0] >= 100  # Should be at least 100ms
    
    def test_performance_metrics_limit(self):
        """Test that performance metrics are limited to 100 entries"""
        
        client = self.client
        
        # Add more than 100 metrics
        for i in range(150):
            client._record_performance('test_op', 10.0)
        
        assert len(client._performance_metrics['test_op']) == 100
    
    @patch('time.sleep')
    def test_exponential_backoff_retry(self, mock_sleep):
        """Test exponential backoff retry logic"""
        
        client = self.client
        call_count = 0
        
        def failing_operation():
            nonlocal call_count
            call_count += 1
            if call_count <= 2:
                raise ClientError(
                    {'Error': {'Code': 'ThrottlingException'}},
                    'operation'
                )
            return 'success'
        
        result = client.exponential_backoff_retry(failing_operation, max_retries=3)
        
        assert result == 'success'
        assert call_count == 3
        assert mock_sleep.call_count == 2  # Two retries
        
        # Check exponential backoff timing
        sleep_calls = [call[0][0] for call in mock_sleep.call_args_list]
        assert sleep_calls[0] >= 1.0  # First retry: 2^0 + jitter
        assert sleep_calls[1] >= 2.0  # Second retry: 2^1 + jitter
    
    def test_exponential_backoff_max_retries(self):
        """Test exponential backoff respects max retries"""
        
        client = self.client
        
        def always_failing_operation():
            raise ClientError(
                {'Error': {'Code': 'ThrottlingException'}},
                'operation'
            )
        
        with pytest.raises(DynamoDBError, match="Max retries exceeded"):
            client.exponential_backoff_retry(always_failing_operation, max_retries=2)
    
    def test_exponential_backoff_non_retryable_error(self):
        """Test exponential backoff doesn't retry non-retryable errors"""
        
        client = self.client
        
        def failing_operation():
            raise ClientError(
                {'Error': {'Code': 'ValidationException'}},
                'operation'
            )
        
        with pytest.raises(DynamoDBError, match="DynamoDB operation failed"):
            client.exponential_backoff_retry(failing_operation, max_retries=3)
    
    @patch('src.utils.dynamodb_client.OptimizedDynamoDBClient.get_table')
    def test_get_item_success(self, mock_get_table):
        """Test successful get_item operation"""
        
        mock_table = Mock()
        mock_table.get_item.return_value = {'Item': {'id': '123', 'name': 'test'}}
        mock_get_table.return_value = mock_table
        
        client = self.client
        result = client.get_item('test-table', {'id': '123'})
        
        assert result == {'id': '123', 'name': 'test'}
        mock_table.get_item.assert_called_once_with(Key={'id': '123'})
    
    @patch('src.utils.dynamodb_client.OptimizedDynamoDBClient.get_table')
    def test_get_item_not_found(self, mock_get_table):
        """Test get_item when item not found"""
        
        mock_table = Mock()
        mock_table.get_item.return_value = {}  # No Item key
        mock_get_table.return_value = mock_table
        
        client = self.client
        result = client.get_item('test-table', {'id': '123'})
        
        assert result is None
    
    @patch('src.utils.dynamodb_client.OptimizedDynamoDBClient.get_table')
    def test_put_item_success(self, mock_get_table):
        """Test successful put_item operation"""
        
        mock_table = Mock()
        mock_table.put_item.return_value = {}
        mock_get_table.return_value = mock_table
        
        client = self.client
        item = {'id': '123', 'name': 'test'}
        result = client.put_item('test-table', item)
        
        mock_table.put_item.assert_called_once_with(Item=item)
    
    @patch('src.utils.dynamodb_client.OptimizedDynamoDBClient.get_table')
    def test_conditional_update_success(self, mock_get_table):
        """Test successful conditional update"""
        
        mock_table = Mock()
        mock_table.update_item.return_value = {}
        mock_get_table.return_value = mock_table
        
        client = self.client
        result = client.conditional_update(
            'test-table',
            {'id': '123'},
            'SET #name = :name',
            Mock(),  # condition expression
            {':name': 'new_name'}
        )
        
        assert result is True
        mock_table.update_item.assert_called_once()
    
    @patch('src.utils.dynamodb_client.OptimizedDynamoDBClient.get_table')
    def test_conditional_update_fails(self, mock_get_table):
        """Test conditional update failure"""
        
        mock_table = Mock()
        mock_table.update_item.side_effect = ClientError(
            {'Error': {'Code': 'ConditionalCheckFailedException'}},
            'UpdateItem'
        )
        mock_get_table.return_value = mock_table
        
        client = self.client
        
        with pytest.raises(OptimisticLockError, match="Conditional update failed"):
            client.conditional_update(
                'test-table',
                {'id': '123'},
                'SET #name = :name',
                Mock(),
                {':name': 'new_name'}
            )
    
    def test_batch_get_items_chunking(self):
        """Test batch_get_items handles chunking properly"""
        
        client = self.client
        
        # Create 150 keys to test chunking (limit is 100)
        keys = [{'id': str(i)} for i in range(150)]
        
        mock_responses = [
            {'Responses': {'test-table': [{'id': {'S': str(i)}, 'name': {'S': f'item_{i}'}}]}}
            for i in range(150)
        ]
        
        with patch.object(client, 'client') as mock_client:
            mock_client.batch_get_item.side_effect = mock_responses[:2]  # Two chunks
            
            with patch.object(client, 'deserializer') as mock_deserializer:
                mock_deserializer.deserialize.side_effect = lambda x: x['S'] if isinstance(x, dict) and 'S' in x else x
                
                result = client.batch_get_items('test-table', keys)
        
        # Should make 2 calls (100 + 50 items)
        assert mock_client.batch_get_item.call_count == 2
        assert len(result) == 2  # 2 items returned from mocked responses
    
    def test_batch_write_items_chunking(self):
        """Test batch_write_items handles chunking properly"""
        
        client = self.client
        
        # Create 30 items to test chunking (limit is 25)
        items = [{'id': str(i), 'name': f'item_{i}'} for i in range(30)]
        
        with patch.object(client, 'client') as mock_client:
            mock_client.batch_write_item.return_value = {'UnprocessedItems': {}}
            
            with patch.object(client, 'serializer') as mock_serializer:
                mock_serializer.serialize.side_effect = lambda x: {'S': str(x)} if isinstance(x, str) else x
                
                result = client.batch_write_items('test-table', items)
        
        # Should make 2 calls (25 + 5 items)
        assert mock_client.batch_write_item.call_count == 2
        assert result is True
    
    def test_query_paginated(self):
        """Test paginated query functionality"""
        
        client = self.client
        
        # Mock query responses with pagination
        mock_responses = [
            {
                'Items': [{'id': '1'}, {'id': '2'}],
                'LastEvaluatedKey': {'id': '2'}
            },
            {
                'Items': [{'id': '3'}, {'id': '4'}],
                'LastEvaluatedKey': {'id': '4'}
            },
            {
                'Items': [{'id': '5'}]
                # No LastEvaluatedKey - end of results
            }
        ]
        
        with patch.object(client, 'query', side_effect=mock_responses):
            results = list(client.query_paginated('test-table', Mock()))
        
        assert len(results) == 5
        assert results[0] == {'id': '1'}
        assert results[-1] == {'id': '5'}
    
    def test_get_wrong_answers_sorted(self):
        """Test specialized wrong answers query"""
        
        client = self.client
        
        mock_response = {
            'Items': [
                {'userId': 'user1', 'timestamp': '2023-01-01', 'remainingTries': 2},
                {'userId': 'user1', 'timestamp': '2023-01-02', 'remainingTries': 1}
            ]
        }
        
        with patch.object(client, 'query', return_value=mock_response):
            result = client.get_wrong_answers_sorted('user1', limit=5)
        
        assert len(result) == 2
        assert result[0]['timestamp'] == '2023-01-01'
    
    def test_update_session_progress_atomic_success(self):
        """Test atomic session progress update"""
        
        client = self.client
        
        with patch.object(client, 'conditional_update', return_value=True):
            result = client.update_session_progress_atomic(
                'session-123',
                'user-456',
                {'currentQuestion': 5},
                1
            )
        
        assert result is True
    
    def test_update_session_progress_atomic_failure(self):
        """Test atomic session progress update failure"""
        
        client = self.client
        
        with patch.object(client, 'conditional_update', side_effect=OptimisticLockError("Concurrent update")):
            result = client.update_session_progress_atomic(
                'session-123',
                'user-456',
                {'currentQuestion': 5},
                1
            )
        
        assert result is False
    
    def test_health_check_healthy(self):
        """Test health check when system is healthy"""
        
        client = self.client
        
        with patch.object(client, 'query', return_value={'Items': []}):
            health = client.health_check()
        
        assert health['status'] == 'healthy'
        assert 'response_time_ms' in health
        assert 'circuit_breaker_states' in health
    
    def test_health_check_unhealthy(self):
        """Test health check when system is unhealthy"""
        
        client = self.client
        
        with patch.object(client, 'query', side_effect=Exception("Connection failed")):
            health = client.health_check()
        
        assert health['status'] == 'unhealthy'
        assert 'error' in health
    
    def test_get_performance_metrics(self):
        """Test performance metrics calculation"""
        
        client = self.client
        
        # Add some mock performance data
        client._performance_metrics['test_op'] = [10.0, 20.0, 30.0, 40.0, 50.0]
        
        metrics = client.get_performance_metrics()
        
        assert 'test_op' in metrics
        op_metrics = metrics['test_op']
        assert op_metrics['count'] == 5
        assert op_metrics['avg_ms'] == 30.0
        assert op_metrics['min_ms'] == 10.0
        assert op_metrics['max_ms'] == 50.0
    
    def test_transact_write_success(self):
        """Test successful transaction write"""
        
        client = self.client
        
        transact_items = [
            {'Put': {'TableName': 'test-table', 'Item': {'id': {'S': '123'}}}},
            {'Update': {'TableName': 'test-table', 'Key': {'id': {'S': '456'}}}}
        ]
        
        with patch.object(client, 'client') as mock_client:
            mock_client.transact_write_items.return_value = {}
            
            result = client.transact_write(transact_items)
        
        assert result is True
        mock_client.transact_write_items.assert_called_once_with(TransactItems=transact_items)
    
    def test_transact_write_cancellation(self):
        """Test transaction write cancellation"""
        
        client = self.client
        
        with patch.object(client, 'client') as mock_client:
            mock_client.transact_write_items.side_effect = ClientError(
                {'Error': {'Code': 'TransactionCanceledException'}},
                'TransactWriteItems'
            )
            
            with pytest.raises(OptimisticLockError, match="Transaction cancelled"):
                client.transact_write([])


if __name__ == "__main__":
    pytest.main([__file__, "-v"])