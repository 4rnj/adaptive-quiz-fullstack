"""
User Management Service
Handles user profiles, preferences, and Cognito integration with DynamoDB persistence
"""

import logging
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict
from enum import Enum
from decimal import Decimal
import boto3
from botocore.exceptions import ClientError

from src.utils.dynamodb_client import dynamodb_client, DynamoDBError, OptimisticLockError
from src.utils.error_handler import handle_service_errors, UserError, ValidationError, ErrorCategory
from src.utils.performance_monitor import performance_monitor

logger = logging.getLogger(__name__)

class UserStatus(Enum):
    """User account status"""
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE" 
    SUSPENDED = "SUSPENDED"
    PENDING_VERIFICATION = "PENDING_VERIFICATION"

@dataclass
class UserPreferences:
    """User preferences and settings"""
    language: str = "en"
    timezone: str = "UTC"
    difficulty_preference: str = "adaptive"  # "easy", "medium", "hard", "adaptive"
    session_duration_preference: int = 1800  # 30 minutes default
    email_notifications: bool = True
    study_reminders: bool = True
    analytics_sharing: bool = True
    accessibility_options: Dict[str, Any] = None

    def __post_init__(self):
        if self.accessibility_options is None:
            self.accessibility_options = {
                "high_contrast": False,
                "large_text": False,
                "screen_reader": False,
                "keyboard_navigation": False
            }

@dataclass
class UserProfile:
    """Complete user profile"""
    user_id: str
    cognito_sub: str
    email: str
    username: str
    full_name: Optional[str]
    status: UserStatus
    preferences: UserPreferences
    created_at: str
    last_login_at: Optional[str]
    login_count: int
    email_verified: bool
    profile_picture_url: Optional[str]
    subscription_tier: str  # "free", "premium", "enterprise"
    total_questions_answered: int
    average_accuracy: float
    learning_streak_days: int
    version: int = 0

@dataclass
class UserStats:
    """User learning statistics"""
    user_id: str
    total_sessions: int
    total_questions_answered: int
    total_correct_answers: int
    average_accuracy: float
    total_time_spent: int  # seconds
    learning_streak_days: int
    longest_streak: int
    categories_mastered: List[str]
    achievement_points: int
    last_session_date: Optional[str]
    calculated_at: str

class UserManagementService:
    """
    Comprehensive user management with Cognito integration
    """
    
    def __init__(self):
        self.db = dynamodb_client
        self.performance_monitor = performance_monitor
        
        # AWS Cognito client
        self.cognito_client = boto3.client('cognito-idp')
        
        # Table names
        self.users_table = 'quiz-adaptive-learning-dev-users'
        self.progress_table = 'quiz-adaptive-learning-dev-progress'
        self.sessions_table = 'quiz-adaptive-learning-dev-sessions'
        
        # Configuration
        self.user_pool_id = 'us-east-1_example'  # Would be from environment
        self.default_subscription_tier = "free"
        self.verification_token_expiry = 86400  # 24 hours
    
    @handle_service_errors
    @performance_monitor.track_operation("create_user_profile")
    def create_user_profile(self, cognito_sub: str, email: str, username: str, 
                          full_name: Optional[str] = None) -> UserProfile:
        """
        Create user profile after Cognito registration
        """
        logger.info(f"Creating user profile for {email}")
        
        # Validate inputs
        self._validate_user_data(email, username)
        
        # Generate user ID
        user_id = self._generate_user_id()
        
        # Create default preferences
        preferences = UserPreferences()
        
        # Create profile
        now = datetime.now(timezone.utc).isoformat()
        
        profile = UserProfile(
            user_id=user_id,
            cognito_sub=cognito_sub,
            email=email.lower(),
            username=username,
            full_name=full_name,
            status=UserStatus.PENDING_VERIFICATION,
            preferences=preferences,
            created_at=now,
            last_login_at=None,
            login_count=0,
            email_verified=False,
            profile_picture_url=None,
            subscription_tier=self.default_subscription_tier,
            total_questions_answered=0,
            average_accuracy=0.0,
            learning_streak_days=0,
            version=0
        )
        
        # Store in database
        try:
            user_item = self._profile_to_dynamodb_item(profile)
            self.db.put_item(self.users_table, user_item)
            
            logger.info(f"User profile created successfully: {user_id}")
            return profile
            
        except Exception as e:
            raise UserError(f"Failed to create user profile: {str(e)}", ErrorCategory.DATABASE)
    
    @handle_service_errors
    @performance_monitor.track_operation("get_user_profile")
    def get_user_profile(self, user_id: str) -> Optional[UserProfile]:
        """
        Get user profile by user ID
        """
        logger.debug(f"Retrieving user profile: {user_id}")
        
        try:
            user_item = self.db.get_item(
                self.users_table,
                key={'userId': user_id}
            )
            
            if not user_item:
                return None
            
            return self._dynamodb_item_to_profile(user_item)
            
        except Exception as e:
            raise UserError(f"Failed to retrieve user profile: {str(e)}", ErrorCategory.DATABASE)
    
    @handle_service_errors
    @performance_monitor.track_operation("get_user_by_cognito_sub")
    def get_user_by_cognito_sub(self, cognito_sub: str) -> Optional[UserProfile]:
        """
        Get user profile by Cognito sub
        """
        logger.debug(f"Retrieving user by Cognito sub")
        
        try:
            # Query by GSI on cognito_sub
            response = self.db.query(
                self.users_table,
                IndexName='cognito-sub-index',
                KeyConditionExpression=Key('cognitoSub').eq(cognito_sub)
            )
            
            items = response.get('Items', [])
            if not items:
                return None
            
            return self._dynamodb_item_to_profile(items[0])
            
        except Exception as e:
            raise UserError(f"Failed to retrieve user by Cognito sub: {str(e)}", ErrorCategory.DATABASE)
    
    @handle_service_errors
    @performance_monitor.track_operation("get_user_by_email")
    def get_user_by_email(self, email: str) -> Optional[UserProfile]:
        """
        Get user profile by email
        """
        logger.debug(f"Retrieving user by email")
        
        try:
            # Query by GSI on email
            response = self.db.query(
                self.users_table,
                IndexName='email-index',
                KeyConditionExpression=Key('email').eq(email.lower())
            )
            
            items = response.get('Items', [])
            if not items:
                return None
            
            return self._dynamodb_item_to_profile(items[0])
            
        except Exception as e:
            raise UserError(f"Failed to retrieve user by email: {str(e)}", ErrorCategory.DATABASE)
    
    @handle_service_errors
    @performance_monitor.track_operation("update_user_preferences")
    def update_user_preferences(self, user_id: str, preferences: Dict[str, Any]) -> bool:
        """
        Update user preferences with atomic operation
        """
        logger.info(f"Updating preferences for user {user_id}")
        
        # Validate preferences
        self._validate_preferences(preferences)
        
        max_retries = 3
        
        for attempt in range(max_retries):
            try:
                # Get current user with version
                current_user = self.get_user_profile(user_id)
                if not current_user:
                    raise UserError(f"User {user_id} not found", ErrorCategory.BUSINESS_LOGIC)
                
                # Prepare update expression
                update_expression = "SET "
                expression_values = {}
                expression_names = {}
                update_parts = []
                
                # Update preference fields
                for key, value in preferences.items():
                    attr_name = f"#pref_{key}"
                    attr_value = f":pref_{key}"
                    expression_names[attr_name] = f"preferences.{key}"
                    expression_values[attr_value] = value
                    update_parts.append(f"{attr_name} = {attr_value}")
                
                # Update version and timestamp
                update_parts.append("#version = #version + :inc")
                update_parts.append("#updated_at = :timestamp")
                
                expression_names["#version"] = "version"
                expression_names["#updated_at"] = "updatedAt"
                expression_values[":inc"] = 1
                expression_values[":timestamp"] = datetime.now(timezone.utc).isoformat()
                
                update_expression += ", ".join(update_parts)
                
                # Conditional update with version check
                condition_expression = Attr("version").eq(current_user.version)
                
                success = self.db.conditional_update(
                    self.users_table,
                    key={'userId': user_id},
                    update_expression=update_expression,
                    condition_expression=condition_expression,
                    expression_attribute_names=expression_names,
                    expression_attribute_values=expression_values
                )
                
                if success:
                    logger.info(f"User preferences updated successfully: {user_id}")
                    return True
                
            except OptimisticLockError:
                logger.warning(f"Optimistic lock conflict for user {user_id}, attempt {attempt + 1}")
                if attempt == max_retries - 1:
                    raise UserError(
                        f"Failed to update preferences after {max_retries} attempts",
                        ErrorCategory.CONCURRENCY
                    )
                continue
            
            except Exception as e:
                raise UserError(f"Failed to update user preferences: {str(e)}", ErrorCategory.DATABASE)
        
        return False
    
    @handle_service_errors
    @performance_monitor.track_operation("record_user_login")
    def record_user_login(self, user_id: str) -> bool:
        """
        Record user login and update statistics
        """
        logger.debug(f"Recording login for user {user_id}")
        
        try:
            now = datetime.now(timezone.utc).isoformat()
            
            # Update login statistics
            update_expression = "SET #last_login = :timestamp, #login_count = #login_count + :inc"
            expression_names = {
                "#last_login": "lastLoginAt",
                "#login_count": "loginCount"
            }
            expression_values = {
                ":timestamp": now,
                ":inc": 1
            }
            
            success = self.db.update_item(
                self.users_table,
                key={'userId': user_id},
                update_expression=update_expression,
                expression_attribute_names=expression_names,
                expression_attribute_values=expression_values
            )
            
            if success:
                logger.debug(f"Login recorded for user {user_id}")
            
            return success
            
        except Exception as e:
            logger.error(f"Failed to record login for user {user_id}: {e}")
            return False
    
    @handle_service_errors
    @performance_monitor.track_operation("update_user_statistics")
    def update_user_statistics(self, user_id: str) -> UserStats:
        """
        Calculate and update user learning statistics
        """
        logger.info(f"Updating statistics for user {user_id}")
        
        try:
            # Get user progress data
            progress_data = self._get_user_progress_data(user_id)
            session_data = self._get_user_session_data(user_id)
            
            # Calculate statistics
            total_sessions = len(session_data)
            total_questions = len(progress_data)
            total_correct = sum(1 for p in progress_data if p.get('correctAttempts', 0) > 0)
            average_accuracy = (total_correct / total_questions * 100) if total_questions > 0 else 0.0
            total_time = sum(s.get('progress', {}).get('timeSpent', 0) for s in session_data)
            
            # Calculate learning streak
            learning_streak = self._calculate_learning_streak(session_data)
            
            # Calculate categories mastered
            categories_mastered = self._get_mastered_categories(user_id, progress_data)
            
            # Calculate achievement points
            achievement_points = self._calculate_achievement_points(
                total_sessions, total_correct, learning_streak, len(categories_mastered)
            )
            
            # Get last session date
            last_session_date = None
            if session_data:
                last_session = max(session_data, key=lambda x: x.get('createdAt', ''))
                last_session_date = last_session.get('createdAt')
            
            stats = UserStats(
                user_id=user_id,
                total_sessions=total_sessions,
                total_questions_answered=total_questions,
                total_correct_answers=total_correct,
                average_accuracy=round(average_accuracy, 2),
                total_time_spent=total_time,
                learning_streak_days=learning_streak,
                longest_streak=learning_streak,  # For now, same as current
                categories_mastered=categories_mastered,
                achievement_points=achievement_points,
                last_session_date=last_session_date,
                calculated_at=datetime.now(timezone.utc).isoformat()
            )
            
            # Update user profile with key statistics
            profile_updates = {
                'total_questions_answered': total_questions,
                'average_accuracy': average_accuracy,
                'learning_streak_days': learning_streak
            }
            
            self.update_user_preferences(user_id, profile_updates)
            
            logger.info(f"Statistics updated for user {user_id}: {total_questions} questions, {average_accuracy:.1f}% accuracy")
            
            return stats
            
        except Exception as e:
            raise UserError(f"Failed to update user statistics: {str(e)}", ErrorCategory.DATABASE)
    
    @handle_service_errors
    @performance_monitor.track_operation("verify_user_email")
    def verify_user_email(self, user_id: str) -> bool:
        """
        Mark user email as verified
        """
        logger.info(f"Verifying email for user {user_id}")
        
        try:
            update_expression = "SET #email_verified = :verified, #status = :active"
            expression_names = {
                "#email_verified": "emailVerified",
                "#status": "status"
            }
            expression_values = {
                ":verified": True,
                ":active": UserStatus.ACTIVE.value
            }
            
            success = self.db.update_item(
                self.users_table,
                key={'userId': user_id},
                update_expression=update_expression,
                expression_attribute_names=expression_names,
                expression_attribute_values=expression_values
            )
            
            if success:
                logger.info(f"Email verified for user {user_id}")
            
            return success
            
        except Exception as e:
            raise UserError(f"Failed to verify email: {str(e)}", ErrorCategory.DATABASE)
    
    @handle_service_errors
    @performance_monitor.track_operation("suspend_user")
    def suspend_user(self, user_id: str, reason: str) -> bool:
        """
        Suspend user account
        """
        logger.warning(f"Suspending user {user_id}: {reason}")
        
        try:
            update_expression = "SET #status = :suspended, #suspended_at = :timestamp, #suspension_reason = :reason"
            expression_names = {
                "#status": "status",
                "#suspended_at": "suspendedAt",
                "#suspension_reason": "suspensionReason"
            }
            expression_values = {
                ":suspended": UserStatus.SUSPENDED.value,
                ":timestamp": datetime.now(timezone.utc).isoformat(),
                ":reason": reason
            }
            
            success = self.db.update_item(
                self.users_table,
                key={'userId': user_id},
                update_expression=update_expression,
                expression_attribute_names=expression_names,
                expression_attribute_values=expression_values
            )
            
            if success:
                logger.warning(f"User {user_id} suspended successfully")
            
            return success
            
        except Exception as e:
            raise UserError(f"Failed to suspend user: {str(e)}", ErrorCategory.DATABASE)
    
    def _validate_user_data(self, email: str, username: str):
        """Validate user registration data"""
        import re
        
        if not email or len(email) > 254:
            raise ValidationError("Valid email is required", "email")
        
        if not re.match(r'^[^@]+@[^@]+\.[^@]+$', email):
            raise ValidationError("Invalid email format", "email")
        
        if not username or len(username) < 3 or len(username) > 30:
            raise ValidationError("Username must be 3-30 characters", "username")
        
        if not re.match(r'^[a-zA-Z0-9_-]+$', username):
            raise ValidationError("Username contains invalid characters", "username")
    
    def _validate_preferences(self, preferences: Dict[str, Any]):
        """Validate user preferences"""
        valid_languages = ["en", "es", "fr", "de", "ja", "zh", "pt", "it", "ru", "ko"]
        valid_difficulties = ["easy", "medium", "hard", "adaptive"]
        
        if "language" in preferences and preferences["language"] not in valid_languages:
            raise ValidationError(f"Invalid language: {preferences['language']}", "language")
        
        if "difficulty_preference" in preferences and preferences["difficulty_preference"] not in valid_difficulties:
            raise ValidationError(f"Invalid difficulty: {preferences['difficulty_preference']}", "difficulty_preference")
        
        if "session_duration_preference" in preferences:
            duration = preferences["session_duration_preference"]
            if not isinstance(duration, int) or duration < 300 or duration > 7200:
                raise ValidationError("Session duration must be 300-7200 seconds", "session_duration_preference")
    
    def _generate_user_id(self) -> str:
        """Generate unique user ID"""
        import uuid
        return f"user-{uuid.uuid4()}"
    
    def _get_user_progress_data(self, user_id: str) -> List[Dict]:
        """Get user's progress data"""
        try:
            response = self.db.query(
                self.progress_table,
                Key('userId').eq(user_id)
            )
            return response.get('Items', [])
        except Exception as e:
            logger.error(f"Failed to get user progress data: {e}")
            return []
    
    def _get_user_session_data(self, user_id: str) -> List[Dict]:
        """Get user's session data"""
        try:
            response = self.db.query(
                self.sessions_table,
                IndexName='userId-status-index',
                KeyConditionExpression=Key('userId').eq(user_id)
            )
            return response.get('Items', [])
        except Exception as e:
            logger.error(f"Failed to get user session data: {e}")
            return []
    
    def _calculate_learning_streak(self, session_data: List[Dict]) -> int:
        """Calculate current learning streak in days"""
        if not session_data:
            return 0
        
        # Sort sessions by date (most recent first)
        sorted_sessions = sorted(
            session_data, 
            key=lambda x: x.get('createdAt', ''), 
            reverse=True
        )
        
        current_date = datetime.now(timezone.utc).date()
        streak_days = 0
        
        for session in sorted_sessions:
            try:
                session_date = datetime.fromisoformat(
                    session.get('createdAt', '').replace('Z', '+00:00')
                ).date()
                
                # Check if session is consecutive
                expected_date = current_date - timedelta(days=streak_days)
                
                if session_date == expected_date:
                    streak_days += 1
                elif session_date < expected_date:
                    break  # Streak broken
                
            except ValueError:
                continue
        
        return streak_days
    
    def _get_mastered_categories(self, user_id: str, progress_data: List[Dict]) -> List[str]:
        """Get categories the user has mastered"""
        category_performance = {}
        
        for item in progress_data:
            category = item.get('category', 'unknown')
            
            if category not in category_performance:
                category_performance[category] = {'correct': 0, 'total': 0}
            
            category_performance[category]['total'] += 1
            if item.get('correctAttempts', 0) > 0:
                category_performance[category]['correct'] += 1
        
        mastered_categories = []
        for category, stats in category_performance.items():
            if stats['total'] >= 10:  # Minimum questions for mastery
                accuracy = stats['correct'] / stats['total']
                if accuracy >= 0.9:  # 90% accuracy for mastery
                    mastered_categories.append(category)
        
        return mastered_categories
    
    def _calculate_achievement_points(self, sessions: int, correct_answers: int, 
                                    streak: int, categories_mastered: int) -> int:
        """Calculate user achievement points"""
        points = 0
        
        # Points for sessions completed
        points += sessions * 10
        
        # Points for correct answers
        points += correct_answers * 5
        
        # Bonus points for streaks
        if streak >= 7:
            points += 100  # Weekly streak bonus
        if streak >= 30:
            points += 500  # Monthly streak bonus
        
        # Points for categories mastered
        points += categories_mastered * 250
        
        return points
    
    def _profile_to_dynamodb_item(self, profile: UserProfile) -> Dict[str, Any]:
        """Convert user profile to DynamoDB item"""
        item = {
            'userId': profile.user_id,
            'cognitoSub': profile.cognito_sub,
            'email': profile.email,
            'username': profile.username,
            'status': profile.status.value,
            'preferences': asdict(profile.preferences),
            'createdAt': profile.created_at,
            'loginCount': profile.login_count,
            'emailVerified': profile.email_verified,
            'subscriptionTier': profile.subscription_tier,
            'totalQuestionsAnswered': profile.total_questions_answered,
            'averageAccuracy': Decimal(str(profile.average_accuracy)),
            'learningStreakDays': profile.learning_streak_days,
            'version': profile.version
        }
        
        # Add optional fields
        if profile.full_name:
            item['fullName'] = profile.full_name
        if profile.last_login_at:
            item['lastLoginAt'] = profile.last_login_at
        if profile.profile_picture_url:
            item['profilePictureUrl'] = profile.profile_picture_url
        
        return item
    
    def _dynamodb_item_to_profile(self, item: Dict[str, Any]) -> UserProfile:
        """Convert DynamoDB item to user profile"""
        preferences_data = item.get('preferences', {})
        preferences = UserPreferences(**preferences_data)
        
        return UserProfile(
            user_id=item['userId'],
            cognito_sub=item['cognitoSub'],
            email=item['email'],
            username=item['username'],
            full_name=item.get('fullName'),
            status=UserStatus(item['status']),
            preferences=preferences,
            created_at=item['createdAt'],
            last_login_at=item.get('lastLoginAt'),
            login_count=item.get('loginCount', 0),
            email_verified=item.get('emailVerified', False),
            profile_picture_url=item.get('profilePictureUrl'),
            subscription_tier=item.get('subscriptionTier', 'free'),
            total_questions_answered=item.get('totalQuestionsAnswered', 0),
            average_accuracy=float(item.get('averageAccuracy', 0)),
            learning_streak_days=item.get('learningStreakDays', 0),
            version=item.get('version', 0)
        )

# Service instance for dependency injection
user_management_service = UserManagementService()