"""
Performance tests for Adaptive Learning Service
Tests performance under load and with large data sets
"""

import pytest
import time
import statistics
import concurrent.futures
from unittest.mock import Mock, patch
from datetime import datetime, timezone

from src.services.adaptive_learning_service import AdaptiveLearningService, QuestionResponse
from src.utils.performance_monitor import PerformanceMonitor

class TestAdaptiveLearningPerformance:
    """Performance tests for adaptive learning algorithms"""
    
    @pytest.fixture
    def service(self):
        """Create service instance with mocked dependencies for performance testing"""
        with patch('src.services.adaptive_learning_service.dynamodb_client') as mock_db:
            service = AdaptiveLearningService()
            service.db = mock_db
            return service
    
    @pytest.fixture
    def performance_monitor(self):
        """Create performance monitor for testing"""
        return PerformanceMonitor()
    
    @pytest.fixture
    def large_question_pool(self):
        """Generate large question pool for performance testing"""
        questions = []
        for i in range(1000):
            questions.append({
                'questionId': f'q{i}',
                'question': f'Test question {i}',
                'type': 'SINGLE_CHOICE',
                'language': 'EN',
                'answers': [
                    {'id': 'a1', 'text': f'Answer 1 for Q{i}'},
                    {'id': 'a2', 'text': f'Answer 2 for Q{i}'},
                    {'id': 'a3', 'text': f'Answer 3 for Q{i}'},
                    {'id': 'a4', 'text': f'Answer 4 for Q{i}'}
                ],
                'correctAnswers': ['a2']
            })
        return questions
    
    @pytest.fixture
    def large_wrong_pool(self):
        """Generate large wrong answer pool for testing"""
        wrong_answers = []
        for i in range(500):
            wrong_answers.append({
                'userId': 'test-user',
                'questionId': f'q{i}',
                'timestamp': f'2024-01-{i%30 + 1:02d}T10:{i%60:02d}:00Z',
                'remainingTries': (i % 3) + 1,
                'shuffledAnswers': [
                    {'id': 'a3', 'text': f'Shuffled 1 Q{i}'},
                    {'id': 'a1', 'text': f'Shuffled 2 Q{i}'},
                    {'id': 'a4', 'text': f'Shuffled 3 Q{i}'},
                    {'id': 'a2', 'text': f'Shuffled 4 Q{i}'}
                ]
            })
        return wrong_answers
    
    def test_question_selection_performance_small_pool(self, service, performance_monitor):
        """Test question selection performance with small pool"""
        
        # Mock small session
        mock_session = {
            'questionPool': [f'q{i}' for i in range(10)],
            'answeredQuestions': [f'q{i}' for i in range(3)],
            'currentQuestion': 3,
            'totalQuestions': 10
        }
        
        service._get_session = Mock(return_value=mock_session)
        service._is_session_complete = Mock(return_value=False)
        service._should_select_from_wrong_pool = Mock(return_value=False)
        
        # Mock question retrieval
        service._get_question = Mock(return_value={
            'questionId': 'q4',
            'question': 'Test question',
            'type': 'SINGLE_CHOICE',
            'language': 'EN',
            'answers': [{'id': 'a1', 'text': 'Answer 1'}]
        })
        
        # Measure performance
        execution_times = []
        for _ in range(100):
            start_time = time.time()
            service.get_next_question('session-id', 'user-id')
            execution_time = (time.time() - start_time) * 1000
            execution_times.append(execution_time)
        
        # Performance assertions
        avg_time = statistics.mean(execution_times)
        p95_time = sorted(execution_times)[94]  # 95th percentile
        
        assert avg_time < 50, f"Average execution time {avg_time}ms exceeds 50ms threshold"
        assert p95_time < 100, f"P95 execution time {p95_time}ms exceeds 100ms threshold"
        assert max(execution_times) < 200, f"Max execution time {max(execution_times)}ms exceeds 200ms threshold"
    
    def test_question_selection_performance_large_pool(self, service, large_question_pool):
        """Test question selection performance with large question pool"""
        
        # Mock large session
        mock_session = {
            'questionPool': [q['questionId'] for q in large_question_pool],
            'answeredQuestions': [f'q{i}' for i in range(500)],  # Half answered
            'currentQuestion': 500,
            'totalQuestions': 1000
        }
        
        service._get_session = Mock(return_value=mock_session)
        service._is_session_complete = Mock(return_value=False)
        service._should_select_from_wrong_pool = Mock(return_value=False)
        service._get_question = Mock(return_value=large_question_pool[0])
        
        # Measure performance with large pool
        execution_times = []
        for _ in range(50):
            start_time = time.time()
            service.get_next_question('session-id', 'user-id')
            execution_time = (time.time() - start_time) * 1000
            execution_times.append(execution_time)
        
        # Performance should still be reasonable with large pools
        avg_time = statistics.mean(execution_times)
        p95_time = sorted(execution_times)[47]  # 95th percentile
        
        assert avg_time < 100, f"Large pool average time {avg_time}ms exceeds 100ms threshold"
        assert p95_time < 200, f"Large pool P95 time {p95_time}ms exceeds 200ms threshold"
    
    def test_wrong_pool_selection_performance(self, service, large_wrong_pool):
        """Test performance of wrong answer pool selection and sorting"""
        
        service.db.get_wrong_answers_sorted = Mock(return_value=large_wrong_pool[:10])
        
        # Measure wrong pool selection performance
        execution_times = []
        for _ in range(100):
            start_time = time.time()
            service._get_oldest_wrong_answer('user-id')
            execution_time = (time.time() - start_time) * 1000
            execution_times.append(execution_time)
        
        avg_time = statistics.mean(execution_times)
        assert avg_time < 25, f"Wrong pool selection time {avg_time}ms exceeds 25ms threshold"
    
    def test_answer_shuffling_performance(self, service):
        """Test performance of answer shuffling algorithm"""
        
        # Create answers with varying sizes
        test_cases = [
            [{'id': f'a{i}', 'text': f'Answer {i}'} for i in range(4)],   # Standard
            [{'id': f'a{i}', 'text': f'Answer {i}'} for i in range(8)],   # Large
            [{'id': f'a{i}', 'text': f'Answer {i}'} for i in range(20)]   # Very large
        ]
        
        for answers in test_cases:
            execution_times = []
            for _ in range(1000):
                start_time = time.time()
                service._shuffle_answers(answers)
                execution_time = (time.time() - start_time) * 1000
                execution_times.append(execution_time)
            
            avg_time = statistics.mean(execution_times)
            max_time = max(execution_times)
            
            assert avg_time < 1, f"Shuffle average time {avg_time}ms for {len(answers)} answers exceeds 1ms"
            assert max_time < 5, f"Shuffle max time {max_time}ms for {len(answers)} answers exceeds 5ms"
    
    def test_answer_validation_performance(self, service):
        """Test performance of answer validation"""
        
        # Test single choice validation
        single_choice_question = {
            'type': 'SINGLE_CHOICE',
            'correctAnswers': ['a2']
        }
        
        execution_times = []
        for _ in range(10000):
            start_time = time.time()
            service._validate_answer(single_choice_question, ['a2'])
            execution_time = (time.time() - start_time) * 1000
            execution_times.append(execution_time)
        
        avg_time = statistics.mean(execution_times)
        assert avg_time < 0.1, f"Single choice validation time {avg_time}ms exceeds 0.1ms"
        
        # Test multiple choice validation
        multiple_choice_question = {
            'type': 'MULTIPLE_CHOICE',
            'correctAnswers': ['a1', 'a3', 'a5', 'a7']
        }
        
        execution_times = []
        for _ in range(10000):
            start_time = time.time()
            service._validate_answer(multiple_choice_question, ['a1', 'a3', 'a5', 'a7'])
            execution_time = (time.time() - start_time) * 1000
            execution_times.append(execution_time)
        
        avg_time = statistics.mean(execution_times)
        assert avg_time < 0.5, f"Multiple choice validation time {avg_time}ms exceeds 0.5ms"
    
    def test_concurrent_question_processing(self, service):
        """Test performance under concurrent load"""
        
        # Mock dependencies for concurrent testing
        service._get_session = Mock(return_value={
            'questionPool': ['q1', 'q2', 'q3'],
            'answeredQuestions': [],
            'currentQuestion': 0,
            'totalQuestions': 3
        })
        service._is_session_complete = Mock(return_value=False)
        service._should_select_from_wrong_pool = Mock(return_value=False)
        service._get_question = Mock(return_value={
            'questionId': 'q1',
            'question': 'Test question',
            'type': 'SINGLE_CHOICE',
            'correctAnswers': ['a2']
        })
        service._update_progress_tracking = Mock()
        service._get_wrong_answer_record = Mock(return_value=None)
        service._update_session_progress = Mock()
        service._calculate_progress = Mock(return_value=Mock(
            current_question=1,
            total_questions=3,
            additional_questions=0,
            correct_answers=1,
            wrong_pool_size=0,
            completion_percentage=33.3
        ))
        
        def process_single_request():
            start_time = time.time()
            service.process_answer('session-id', 'user-id', 'q1', ['a2'], 60)
            return (time.time() - start_time) * 1000
        
        # Test concurrent processing
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(process_single_request) for _ in range(100)]
            execution_times = [future.result() for future in concurrent.futures.as_completed(futures)]
        
        avg_time = statistics.mean(execution_times)
        p95_time = sorted(execution_times)[94]
        
        assert avg_time < 100, f"Concurrent average time {avg_time}ms exceeds 100ms threshold"
        assert p95_time < 200, f"Concurrent P95 time {p95_time}ms exceeds 200ms threshold"
    
    def test_memory_usage_stability(self, service, large_question_pool):
        """Test memory usage remains stable with large datasets"""
        import psutil
        import os
        
        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        
        # Mock large session
        service._get_session = Mock(return_value={
            'questionPool': [q['questionId'] for q in large_question_pool],
            'answeredQuestions': [],
            'currentQuestion': 0,
            'totalQuestions': 1000
        })
        service._is_session_complete = Mock(return_value=False)
        service._should_select_from_wrong_pool = Mock(return_value=False)
        service._get_question = Mock(side_effect=lambda qid: next(q for q in large_question_pool if q['questionId'] == qid))
        
        # Process many questions
        for i in range(500):
            service.get_next_question('session-id', 'user-id')
            
            # Check memory every 100 iterations
            if i % 100 == 0:
                current_memory = process.memory_info().rss / 1024 / 1024
                memory_growth = current_memory - initial_memory
                
                # Memory growth should be reasonable (less than 50MB)
                assert memory_growth < 50, f"Memory growth {memory_growth}MB exceeds 50MB threshold at iteration {i}"
    
    def test_algorithm_complexity_scaling(self, service):
        """Test that algorithm complexity scales reasonably with input size"""
        
        # Test with different pool sizes
        pool_sizes = [10, 50, 100, 500, 1000]
        execution_times = {}
        
        for pool_size in pool_sizes:
            question_pool = [f'q{i}' for i in range(pool_size)]
            answered_questions = [f'q{i}' for i in range(pool_size // 2)]
            
            service._get_session = Mock(return_value={
                'questionPool': question_pool,
                'answeredQuestions': answered_questions,
                'currentQuestion': len(answered_questions),
                'totalQuestions': pool_size
            })
            service._is_session_complete = Mock(return_value=False)
            service._should_select_from_wrong_pool = Mock(return_value=False)
            service._get_question = Mock(return_value={'questionId': 'q1'})
            
            # Measure execution time
            times = []
            for _ in range(50):
                start_time = time.time()
                service.get_next_question('session-id', 'user-id')
                execution_time = (time.time() - start_time) * 1000
                times.append(execution_time)
            
            execution_times[pool_size] = statistics.mean(times)
        
        # Verify reasonable scaling (should be roughly O(1) for random selection)
        for i in range(1, len(pool_sizes)):
            prev_size = pool_sizes[i-1]
            curr_size = pool_sizes[i]
            prev_time = execution_times[prev_size]
            curr_time = execution_times[curr_size]
            
            # Time shouldn't increase dramatically with pool size
            scaling_factor = curr_time / prev_time
            assert scaling_factor < 3, f"Poor scaling: {prev_size}→{curr_size} pool size increased time by {scaling_factor}x"
    
    def test_performance_monitoring_integration(self, service, performance_monitor):
        """Test integration with performance monitoring"""
        
        # Mock service operations
        service._get_session = Mock(return_value={'sessionId': 'test'})
        service._is_session_complete = Mock(return_value=False)
        service._should_select_from_wrong_pool = Mock(return_value=False)
        service._get_next_regular_question = Mock(return_value=QuestionResponse(
            question_id='q1',
            text='Test',
            answers=[],
            question_type='SINGLE_CHOICE',
            language='EN'
        ))
        
        # Ensure performance monitoring is working
        with performance_monitor.track_execution_time('test_operation'):
            service.get_next_question('session-id', 'user-id')
        
        # Verify metrics were recorded
        metrics = performance_monitor.get_performance_summary('test_operation')
        assert metrics['total_operations'] > 0
        assert 'avg_execution_time_ms' in metrics

class TestDynamoDBPerformance:
    """Performance tests for DynamoDB client operations"""
    
    def test_connection_pooling_effectiveness(self):
        """Test that connection pooling improves performance"""
        from src.utils.dynamodb_client import OptimizedDynamoDBClient
        
        with patch('boto3.Session') as mock_session:
            mock_resource = Mock()
            mock_session.return_value.resource.return_value = mock_resource
            
            # Create multiple client instances
            clients = [OptimizedDynamoDBClient() for _ in range(10)]
            
            # Should reuse the same instance (singleton pattern)
            assert all(client is clients[0] for client in clients)
            
            # Session should only be created once
            assert mock_session.call_count == 1

if __name__ == '__main__':
    pytest.main([__file__, '-v'])