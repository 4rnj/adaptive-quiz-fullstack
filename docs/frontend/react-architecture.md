# React Frontend Architecture

## Overview

The frontend is built with React 18+ and TypeScript, utilizing modern patterns for state management, component architecture, and performance optimization.

## Technology Stack

- **React 18.2+**: UI library with concurrent features
- **TypeScript 4.9+**: Type safety and developer experience
- **Zustand 4.4+**: Lightweight state management
- **React Query 5.0+**: Server state management and caching
- **React Router 6.20+**: Client-side routing
- **Tailwind CSS 3.4+**: Utility-first CSS framework
- **Headless UI 1.7+**: Unstyled accessible components
- **Vite 5.0+**: Build tool and dev server

## Component Architecture

```
src/
├── components/           # Reusable UI components
│   ├── common/          # Generic components
│   │   ├── Button/
│   │   ├── Card/
│   │   ├── Modal/
│   │   └── Loading/
│   ├── quiz/            # Quiz-specific components
│   │   ├── QuestionCard/
│   │   ├── AnswerChoice/
│   │   ├── ProgressBar/
│   │   └── Timer/
│   ├── session/         # Session management components
│   │   ├── SessionConfig/
│   │   ├── SourceSelector/
│   │   └── SessionSummary/
│   └── layout/          # Layout components
│       ├── Header/
│       ├── Navigation/
│       └── Footer/
├── pages/               # Page components
│   ├── Home/
│   ├── Quiz/
│   ├── Results/
│   ├── Profile/
│   └── Admin/
├── hooks/               # Custom React hooks
│   ├── useAuth.ts
│   ├── useQuiz.ts
│   ├── useAdaptiveLearning.ts
│   └── useWebSocket.ts
├── stores/              # Zustand stores
│   ├── authStore.ts
│   ├── quizStore.ts
│   ├── sessionStore.ts
│   └── uiStore.ts
├── services/            # API and external services
│   ├── api/
│   ├── auth/
│   └── analytics/
├── types/               # TypeScript type definitions
│   ├── quiz.types.ts
│   ├── session.types.ts
│   └── user.types.ts
├── utils/               # Utility functions
│   ├── formatting.ts
│   ├── validation.ts
│   └── constants.ts
└── styles/              # Global styles
    ├── globals.css
    └── tailwind.css
```

## State Management Architecture

### 1. Zustand Stores

#### Auth Store
```typescript
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  tokens: AuthTokens | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
}
```

#### Quiz Store
```typescript
interface QuizState {
  currentSession: Session | null;
  currentQuestion: Question | null;
  questionNumber: number;
  totalQuestions: number;
  additionalQuestions: number;
  wrongPool: WrongAnswer[];
  isLoading: boolean;
  
  // Actions
  startSession: (config: SessionConfig) => Promise<void>;
  loadQuestion: () => Promise<void>;
  submitAnswer: (answer: Answer) => Promise<AnswerResult>;
  pauseSession: () => void;
  resumeSession: () => void;
}
```

#### Session Store
```typescript
interface SessionState {
  availableSources: QuizSource[];
  selectedSources: SelectedSource[];
  sessionConfig: SessionConfig | null;
  
  // Actions
  loadSources: () => Promise<void>;
  addSource: (source: SelectedSource) => void;
  removeSource: (sourceId: string) => void;
  updateSourceConfig: (sourceId: string, config: Partial<SourceConfig>) => void;
  createSession: () => Promise<Session>;
}
```

### 2. React Query for Server State

```typescript
// Question fetching with caching
const useQuestion = (sessionId: string) => {
  return useQuery({
    queryKey: ['question', sessionId],
    queryFn: () => api.getQuestion(sessionId),
    staleTime: 0, // Always fetch fresh question
    cacheTime: 0, // Don't cache questions
  });
};

// Session management
const useSession = (sessionId: string) => {
  return useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api.getSession(sessionId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 30 * 1000, // Refetch every 30 seconds
  });
};
```

## Key Components

### 1. Multi-Source Session Configuration

```typescript
const SessionConfigWizard: React.FC = () => {
  const { selectedSources, addSource, createSession } = useSessionStore();
  const [step, setStep] = useState<'category' | 'provider' | 'certificate' | 'config'>('category');
  
  return (
    <div className="max-w-4xl mx-auto">
      <StepIndicator currentStep={step} />
      
      {step === 'category' && <CategorySelector onSelect={handleCategorySelect} />}
      {step === 'provider' && <ProviderSelector category={selectedCategory} />}
      {step === 'certificate' && <CertificateSelector provider={selectedProvider} />}
      {step === 'config' && <SourceConfigurator onComplete={handleAddSource} />}
      
      <SelectedSourcesList sources={selectedSources} />
      
      <Button 
        onClick={createSession}
        disabled={selectedSources.length === 0}
      >
        Start Quiz Session
      </Button>
    </div>
  );
};
```

### 2. Adaptive Question Display

```typescript
const QuestionDisplay: React.FC = () => {
  const { currentQuestion, questionNumber, totalQuestions, additionalQuestions } = useQuizStore();
  const { submitAnswer, isSubmitting } = useAnswerSubmission();
  
  return (
    <Card className="p-6">
      <ProgressIndicator 
        current={questionNumber}
        total={totalQuestions}
        additional={additionalQuestions}
        penaltyText={currentQuestion?.penaltyIndicator}
      />
      
      <QuestionText text={currentQuestion.text} />
      
      <AnswerChoices 
        answers={currentQuestion.answers}
        type={currentQuestion.type}
        onSubmit={submitAnswer}
        disabled={isSubmitting}
        shuffled={currentQuestion.shuffled}
      />
      
      {currentQuestion.isFromWrongPool && (
        <Badge variant="warning">
          From Wrong Answers Pool - {currentQuestion.remainingTries} tries remaining
        </Badge>
      )}
    </Card>
  );
};
```

### 3. Progress Tracking Component

```typescript
const ProgressTracker: React.FC = () => {
  const { progress, wrongPool } = useQuizStore();
  
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Progress</h3>
        <span className="text-2xl font-bold">
          {progress.current} / {progress.total}
        </span>
      </div>
      
      <ProgressBar 
        value={progress.percentage} 
        className="mb-4"
      />
      
      {progress.additionalQuestions > 0 && (
        <Alert variant="info">
          <AlertIcon />
          <AlertDescription>
            {progress.additionalQuestions} additional question{progress.additionalQuestions > 1 ? 's' : ''} 
            from wrong answers
          </AlertDescription>
        </Alert>
      )}
      
      <div className="grid grid-cols-2 gap-4 mt-4">
        <Stat label="Correct" value={progress.correct} />
        <Stat label="Wrong Pool" value={wrongPool.length} />
      </div>
    </div>
  );
};
```

## Performance Optimizations

### 1. Code Splitting
```typescript
// Lazy load pages
const Quiz = lazy(() => import('./pages/Quiz'));
const Admin = lazy(() => import('./pages/Admin'));
const Results = lazy(() => import('./pages/Results'));
```

### 2. Memoization
```typescript
// Memoize expensive computations
const sortedWrongAnswers = useMemo(() => {
  return wrongPool.sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}, [wrongPool]);
```

### 3. Virtual Scrolling
```typescript
// For large lists of questions/results
import { VirtualList } from '@tanstack/react-virtual';

const QuestionList: React.FC<{ questions: Question[] }> = ({ questions }) => {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: questions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
  });
  
  return (
    <div ref={parentRef} className="h-[600px] overflow-auto">
      {virtualizer.getVirtualItems().map((virtualItem) => (
        <QuestionItem 
          key={virtualItem.key}
          question={questions[virtualItem.index]}
        />
      ))}
    </div>
  );
};
```

## Responsive Design

### Mobile-First Approach
```typescript
const QuizLayout: React.FC = ({ children }) => {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Navigation */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t">
        <MobileNav />
      </nav>
      
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block fixed left-0 top-0 w-64 h-full">
        <Sidebar />
      </aside>
      
      {/* Main Content */}
      <main className="lg:ml-64 pb-16 lg:pb-0">
        {children}
      </main>
    </div>
  );
};
```

## Error Handling

### Global Error Boundary
```typescript
class ErrorBoundary extends Component<Props, State> {
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    // Send to error tracking service
  }
  
  render() {
    if (this.state.hasError) {
      return <ErrorFallback onReset={this.resetError} />;
    }
    
    return this.props.children;
  }
}
```

### API Error Handling
```typescript
const useApiError = () => {
  return useCallback((error: ApiError) => {
    if (error.status === 401) {
      // Handle unauthorized
      authStore.logout();
    } else if (error.status === 429) {
      // Handle rate limiting
      toast.error(`Rate limited. Retry after ${error.retryAfter}s`);
    } else {
      // Generic error handling
      toast.error(error.message || 'An error occurred');
    }
  }, []);
};
```

## Testing Strategy

### Unit Tests
```typescript
// Component testing with React Testing Library
describe('QuestionDisplay', () => {
  it('should shuffle answers when question is wrong', async () => {
    const { rerender } = render(<QuestionDisplay question={mockQuestion} />);
    const initialOrder = screen.getAllByRole('radio').map(el => el.value);
    
    // Submit wrong answer
    fireEvent.click(screen.getByText('Wrong Answer'));
    fireEvent.click(screen.getByText('Submit'));
    
    await waitFor(() => {
      const newOrder = screen.getAllByRole('radio').map(el => el.value);
      expect(newOrder).not.toEqual(initialOrder);
    });
  });
});
```

### E2E Tests
```typescript
// Cypress tests for critical user flows
describe('Quiz Session Flow', () => {
  it('should handle wrong answer with immediate re-asking', () => {
    cy.login();
    cy.createSession({ sources: [mockSource] });
    
    // Answer incorrectly
    cy.get('[data-testid="answer-wrong"]').click();
    cy.get('[data-testid="submit-answer"]').click();
    
    // Verify same question with shuffled answers
    cy.get('[data-testid="question-text"]').should('contain', 'Same question text');
    cy.get('[data-testid="shuffle-indicator"]').should('be.visible');
    cy.get('[data-testid="penalty-indicator"]').should('contain', '+1 Question @ 2 Tries');
  });
});
```