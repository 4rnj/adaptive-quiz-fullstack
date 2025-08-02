"""
Analytics Service - Background processing for learning analytics and insights
Processes user performance data and generates learning recommendations
"""

import logging
import statistics
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict
from decimal import Decimal
import json

from src.utils.dynamodb_client import dynamodb_client, DynamoDBError
from src.utils.error_handler import handle_service_errors, QuizApplicationError, ErrorCategory
from src.utils.performance_monitor import performance_monitor

logger = logging.getLogger(__name__)

@dataclass
class LearningMetrics:
    """Learning metrics for a user"""
    user_id: str
    total_questions_attempted: int
    total_correct: int
    accuracy_percentage: float
    average_time_per_question: float
    improvement_trend: str  # "improving", "stable", "declining"
    weak_areas: List[str]
    strong_areas: List[str]
    mastery_level: float
    learning_velocity: float
    calculated_at: str

@dataclass
class CategoryAnalytics:
    """Analytics for a specific category"""
    category: str
    provider: str
    certificate: str
    questions_attempted: int
    accuracy: float
    average_time: float
    difficulty_distribution: Dict[int, int]
    improvement_rate: float
    mastery_score: float
    recommendations: List[str]

@dataclass
class SessionAnalytics:
    """Analytics for a completed session"""
    session_id: str
    user_id: str
    completion_date: str
    total_questions: int
    correct_answers: int
    accuracy: float
    time_spent: int
    questions_from_wrong_pool: int
    immediate_corrections: int
    categories_covered: List[str]
    performance_score: float

class AnalyticsService:
    """
    Background analytics processing service
    Generates insights, recommendations, and performance metrics
    """
    
    def __init__(self):
        self.db = dynamodb_client
        self.performance_monitor = performance_monitor
        
        # Table names
        self.users_table = 'quiz-adaptive-learning-dev-users'
        self.sessions_table = 'quiz-adaptive-learning-dev-sessions'
        self.progress_table = 'quiz-adaptive-learning-dev-progress'
        self.wrong_answers_table = 'quiz-adaptive-learning-dev-wrong-answers'
        self.analytics_table = 'quiz-adaptive-learning-dev-analytics'
        
        # Analytics configuration
        self.lookback_days = 30
        self.min_questions_for_analysis = 10
        self.mastery_threshold = 0.8
    
    @handle_service_errors
    @performance_monitor.track_operation("process_user_analytics")
    def process_user_analytics(self, user_id: str) -> LearningMetrics:
        """
        Process comprehensive analytics for a user
        """
        logger.info(f"Processing analytics for user {user_id}")
        
        # Get user's progress data
        progress_data = self._get_user_progress_data(user_id)
        
        if len(progress_data) < self.min_questions_for_analysis:
            logger.warning(f"Insufficient data for user {user_id}: {len(progress_data)} questions")
            return self._create_minimal_metrics(user_id)
        
        # Calculate core metrics
        total_questions = len(progress_data)
        total_correct = sum(1 for p in progress_data if p.get('correctAttempts', 0) > 0)
        accuracy = (total_correct / total_questions) * 100 if total_questions > 0 else 0
        
        # Calculate average time per question
        total_time = sum(p.get('timeSpent', 0) for p in progress_data)
        avg_time = total_time / total_questions if total_questions > 0 else 0
        
        # Analyze improvement trend
        improvement_trend = self._calculate_improvement_trend(progress_data)
        
        # Identify weak and strong areas
        weak_areas, strong_areas = self._analyze_subject_performance(user_id, progress_data)
        
        # Calculate mastery level
        mastery_level = self._calculate_mastery_level(progress_data)
        
        # Calculate learning velocity
        learning_velocity = self._calculate_learning_velocity(progress_data)
        
        metrics = LearningMetrics(
            user_id=user_id,
            total_questions_attempted=total_questions,
            total_correct=total_correct,
            accuracy_percentage=round(accuracy, 2),
            average_time_per_question=round(avg_time, 2),
            improvement_trend=improvement_trend,
            weak_areas=weak_areas,
            strong_areas=strong_areas,
            mastery_level=round(mastery_level, 3),
            learning_velocity=round(learning_velocity, 3),
            calculated_at=datetime.now(timezone.utc).isoformat()
        )
        
        # Store analytics
        self._store_user_analytics(metrics)
        
        logger.info(f"Analytics processed for user {user_id}: {accuracy:.1f}% accuracy, {improvement_trend} trend")
        
        return metrics
    
    @handle_service_errors
    @performance_monitor.track_operation("process_session_analytics")
    def process_session_analytics(self, session_id: str, user_id: str) -> SessionAnalytics:
        """
        Process analytics for a completed session
        """
        logger.info(f"Processing session analytics for {session_id}")
        
        # Get session data
        session = self._get_session_data(session_id, user_id)
        if not session:
            raise QuizApplicationError(f"Session {session_id} not found", ErrorCategory.BUSINESS_LOGIC)
        
        # Get session progress
        session_progress = self._get_session_progress_data(session_id)
        
        # Calculate session metrics
        total_questions = len(session.get('questionPool', []))
        correct_answers = sum(1 for p in session_progress if p.get('correctAttempts', 0) > 0)
        accuracy = (correct_answers / total_questions) * 100 if total_questions > 0 else 0
        time_spent = sum(p.get('timeSpent', 0) for p in session_progress)
        
        # Analyze wrong answer pool usage
        questions_from_wrong_pool = len([p for p in session_progress if p.get('isFromWrongPool', False)])
        immediate_corrections = len([p for p in session_progress if p.get('attempts', 0) > 1])
        
        # Get categories covered
        categories_covered = self._extract_categories_from_session(session)
        
        # Calculate performance score
        performance_score = self._calculate_session_performance_score(
            accuracy, time_spent, total_questions, immediate_corrections
        )
        
        analytics = SessionAnalytics(
            session_id=session_id,
            user_id=user_id,
            completion_date=session.get('completedAt', datetime.now(timezone.utc).isoformat()),
            total_questions=total_questions,
            correct_answers=correct_answers,
            accuracy=round(accuracy, 2),
            time_spent=time_spent,
            questions_from_wrong_pool=questions_from_wrong_pool,
            immediate_corrections=immediate_corrections,
            categories_covered=categories_covered,
            performance_score=round(performance_score, 2)
        )
        
        # Store session analytics
        self._store_session_analytics(analytics)
        
        logger.info(f"Session analytics processed: {accuracy:.1f}% accuracy, score: {performance_score:.1f}")
        
        return analytics
    
    @handle_service_errors
    @performance_monitor.track_operation("generate_learning_recommendations")
    def generate_learning_recommendations(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Generate personalized learning recommendations
        """
        logger.info(f"Generating recommendations for user {user_id}")
        
        # Get user analytics
        user_metrics = self.process_user_analytics(user_id)
        
        recommendations = []
        
        # Recommendation: Focus on weak areas
        if user_metrics.weak_areas:
            recommendations.append({
                'type': 'focus_weak_areas',
                'title': 'Focus on Weak Areas',
                'description': f"Spend more time on: {', '.join(user_metrics.weak_areas[:3])}",
                'priority': 'high',
                'categories': user_metrics.weak_areas[:3]
            })
        
        # Recommendation: Improve accuracy
        if user_metrics.accuracy_percentage < 70:
            recommendations.append({
                'type': 'improve_accuracy',
                'title': 'Improve Accuracy',
                'description': 'Practice more fundamentals to improve your accuracy',
                'priority': 'high',
                'target_accuracy': 80
            })
        
        # Recommendation: Speed improvement
        if user_metrics.average_time_per_question > 120:  # More than 2 minutes per question
            recommendations.append({
                'type': 'improve_speed',
                'title': 'Improve Response Time',
                'description': 'Practice timed sessions to improve your speed',
                'priority': 'medium',
                'target_time': 90
            })
        
        # Recommendation: Review wrong answers
        wrong_pool_size = self._get_wrong_pool_size(user_id)
        if wrong_pool_size > 10:
            recommendations.append({
                'type': 'review_wrong_answers',
                'title': 'Review Wrong Answers',
                'description': f'You have {wrong_pool_size} questions in your review pool',
                'priority': 'high',
                'wrong_pool_size': wrong_pool_size
            })
        
        # Recommendation: Maintain momentum
        if user_metrics.improvement_trend == 'improving':
            recommendations.append({
                'type': 'maintain_momentum',
                'title': 'Keep Up the Great Work!',
                'description': 'Your performance is improving. Keep practicing regularly.',
                'priority': 'low'
            })
        
        logger.info(f"Generated {len(recommendations)} recommendations for user {user_id}")
        
        return recommendations
    
    @handle_service_errors
    @performance_monitor.track_operation("analyze_question_difficulty")
    def analyze_question_difficulty(self) -> Dict[str, Any]:
        """
        Analyze question difficulty across the platform
        """
        logger.info("Analyzing question difficulty metrics")
        
        # This would analyze question performance across all users
        # to identify questions that are too easy, too hard, or poorly written
        
        difficulty_analysis = {
            'total_questions_analyzed': 0,
            'questions_too_easy': [],  # >90% accuracy
            'questions_too_hard': [],  # <30% accuracy
            'questions_confusing': [], # High variance in response time
            'balanced_questions': 0,
            'recommended_difficulty_adjustments': []
        }
        
        # Implementation would query progress data and calculate statistics
        
        return difficulty_analysis
    
    def _get_user_progress_data(self, user_id: str) -> List[Dict[str, Any]]:
        """Get user's progress data from the last 30 days"""
        try:
            # Query progress table for user
            response = self.db.query(
                self.progress_table,
                Key('userId').eq(user_id)
            )
            
            progress_data = response.get('Items', [])
            
            # Filter to recent data
            cutoff_date = datetime.now(timezone.utc) - timedelta(days=self.lookback_days)
            recent_data = []
            
            for item in progress_data:
                try:
                    last_attempt = datetime.fromisoformat(item.get('lastAttemptAt', '').replace('Z', '+00:00'))
                    if last_attempt >= cutoff_date:
                        recent_data.append(item)
                except ValueError:
                    continue
            
            return recent_data
            
        except Exception as e:
            logger.error(f"Failed to get progress data for user {user_id}: {e}")
            return []
    
    def _calculate_improvement_trend(self, progress_data: List[Dict]) -> str:
        """Calculate if user is improving, stable, or declining"""
        if len(progress_data) < 5:
            return "insufficient_data"
        
        # Sort by last attempt date
        sorted_data = sorted(progress_data, key=lambda x: x.get('lastAttemptAt', ''))
        
        # Split into recent and older halves
        mid_point = len(sorted_data) // 2
        older_half = sorted_data[:mid_point]
        recent_half = sorted_data[mid_point:]
        
        # Calculate accuracy for each half
        older_accuracy = sum(1 for p in older_half if p.get('correctAttempts', 0) > 0) / len(older_half)
        recent_accuracy = sum(1 for p in recent_half if p.get('correctAttempts', 0) > 0) / len(recent_half)
        
        difference = recent_accuracy - older_accuracy
        
        if difference > 0.1:
            return "improving"
        elif difference < -0.1:
            return "declining"
        else:
            return "stable"
    
    def _analyze_subject_performance(self, user_id: str, progress_data: List[Dict]) -> Tuple[List[str], List[str]]:
        """Analyze performance by subject/category"""
        
        # Group by category/subject
        category_performance = {}
        
        for item in progress_data:
            # Extract category from question (this would require joining with questions table)
            category = item.get('category', 'unknown')
            
            if category not in category_performance:
                category_performance[category] = {'correct': 0, 'total': 0}
            
            category_performance[category]['total'] += 1
            if item.get('correctAttempts', 0) > 0:
                category_performance[category]['correct'] += 1
        
        # Calculate accuracy per category
        category_accuracies = {}
        for category, stats in category_performance.items():
            if stats['total'] >= 3:  # Minimum questions for analysis
                accuracy = stats['correct'] / stats['total']
                category_accuracies[category] = accuracy
        
        # Identify weak and strong areas
        weak_areas = [cat for cat, acc in category_accuracies.items() if acc < 0.6]
        strong_areas = [cat for cat, acc in category_accuracies.items() if acc > 0.8]
        
        return weak_areas[:5], strong_areas[:5]  # Limit to top 5
    
    def _calculate_mastery_level(self, progress_data: List[Dict]) -> float:
        """Calculate overall mastery level"""
        if not progress_data:
            return 0.0
        
        # Weighted by recency and consistency
        total_score = 0
        total_weight = 0
        
        for item in progress_data:
            attempts = item.get('attempts', 1)
            correct = item.get('correctAttempts', 0)
            
            # Basic accuracy score
            accuracy = correct / attempts if attempts > 0 else 0
            
            # Weight by recency (more recent attempts matter more)
            try:
                last_attempt = datetime.fromisoformat(item.get('lastAttemptAt', '').replace('Z', '+00:00'))
                days_ago = (datetime.now(timezone.utc) - last_attempt).days
                recency_weight = max(0.1, 1.0 - (days_ago / 30))  # Decay over 30 days
            except ValueError:
                recency_weight = 0.1
            
            total_score += accuracy * recency_weight
            total_weight += recency_weight
        
        return total_score / total_weight if total_weight > 0 else 0.0
    
    def _calculate_learning_velocity(self, progress_data: List[Dict]) -> float:
        """Calculate how quickly the user is learning"""
        if len(progress_data) < 10:
            return 0.0
        
        # Sort by first seen date
        sorted_data = sorted(progress_data, key=lambda x: x.get('firstSeenAt', ''))
        
        # Calculate improvement over time
        improvement_scores = []
        window_size = 5
        
        for i in range(window_size, len(sorted_data)):
            recent_window = sorted_data[i-window_size:i]
            recent_accuracy = sum(1 for p in recent_window if p.get('correctAttempts', 0) > 0) / len(recent_window)
            improvement_scores.append(recent_accuracy)
        
        if len(improvement_scores) < 2:
            return 0.0
        
        # Calculate slope of improvement
        x_values = list(range(len(improvement_scores)))
        y_values = improvement_scores
        
        n = len(improvement_scores)
        sum_x = sum(x_values)
        sum_y = sum(y_values)
        sum_xy = sum(x * y for x, y in zip(x_values, y_values))
        sum_x2 = sum(x * x for x in x_values)
        
        slope = (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x * sum_x)
        
        return max(0.0, slope)  # Only positive learning velocity
    
    def _create_minimal_metrics(self, user_id: str) -> LearningMetrics:
        """Create minimal metrics for users with insufficient data"""
        return LearningMetrics(
            user_id=user_id,
            total_questions_attempted=0,
            total_correct=0,
            accuracy_percentage=0.0,
            average_time_per_question=0.0,
            improvement_trend="insufficient_data",
            weak_areas=[],
            strong_areas=[],
            mastery_level=0.0,
            learning_velocity=0.0,
            calculated_at=datetime.now(timezone.utc).isoformat()
        )
    
    def _get_session_data(self, session_id: str, user_id: str) -> Optional[Dict]:
        """Get session data"""
        return self.db.get_item(
            self.sessions_table,
            key={'sessionId': session_id, 'userId': user_id}
        )
    
    def _get_session_progress_data(self, session_id: str) -> List[Dict]:
        """Get progress data for a specific session"""
        try:
            response = self.db.query(
                self.progress_table,
                Key('sessionId').eq(session_id),
                IndexName='sessionId-index'
            )
            return response.get('Items', [])
        except Exception as e:
            logger.error(f"Failed to get session progress data: {e}")
            return []
    
    def _extract_categories_from_session(self, session: Dict) -> List[str]:
        """Extract categories from session configuration"""
        categories = []
        config = session.get('config', {})
        sources = config.get('sources', [])
        
        for source in sources:
            category = f"{source.get('category', '')}/{source.get('provider', '')}"
            if category not in categories:
                categories.append(category)
        
        return categories
    
    def _calculate_session_performance_score(self, accuracy: float, time_spent: int, 
                                           total_questions: int, immediate_corrections: int) -> float:
        """Calculate a performance score for the session"""
        
        # Base score from accuracy (0-70 points)
        accuracy_score = min(70, accuracy * 0.7)
        
        # Time efficiency score (0-20 points)
        avg_time = time_spent / total_questions if total_questions > 0 else 0
        time_efficiency = max(0, 20 - (avg_time - 60) / 10)  # Optimal around 60s per question
        time_score = min(20, max(0, time_efficiency))
        
        # Learning adaptation score (0-10 points)
        adaptation_rate = immediate_corrections / total_questions if total_questions > 0 else 0
        adaptation_score = min(10, adaptation_rate * 20)  # Bonus for learning from mistakes
        
        total_score = accuracy_score + time_score + adaptation_score
        
        return min(100, max(0, total_score))
    
    def _get_wrong_pool_size(self, user_id: str) -> int:
        """Get size of user's wrong answer pool"""
        try:
            response = self.db.query(
                self.wrong_answers_table,
                Key('userId').eq(user_id)
            )
            
            wrong_answers = response.get('Items', [])
            active_wrong_answers = [item for item in wrong_answers if item.get('remainingTries', 0) > 0]
            
            return len(active_wrong_answers)
            
        except Exception as e:
            logger.error(f"Failed to get wrong pool size: {e}")
            return 0
    
    def _store_user_analytics(self, metrics: LearningMetrics):
        """Store user analytics in database"""
        try:
            item = {
                'userId': metrics.user_id,
                'type': 'user_analytics',
                'timestamp': metrics.calculated_at,
                'data': asdict(metrics),
                'ttl': int((datetime.now(timezone.utc) + timedelta(days=90)).timestamp())
            }
            
            self.db.put_item(self.analytics_table, item)
            
        except Exception as e:
            logger.error(f"Failed to store user analytics: {e}")
    
    def _store_session_analytics(self, analytics: SessionAnalytics):
        """Store session analytics in database"""
        try:
            item = {
                'sessionId': analytics.session_id,
                'userId': analytics.user_id,
                'type': 'session_analytics',
                'timestamp': analytics.completion_date,
                'data': asdict(analytics),
                'ttl': int((datetime.now(timezone.utc) + timedelta(days=365)).timestamp())
            }
            
            self.db.put_item(self.analytics_table, item)
            
        except Exception as e:
            logger.error(f"Failed to store session analytics: {e}")

# Service instance for dependency injection
analytics_service = AnalyticsService()