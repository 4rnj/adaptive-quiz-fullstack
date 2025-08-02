# Adaptive Quiz Frontend - React 18 TypeScript

Modern, responsive frontend for the multi-source adaptive quiz application built with React 18, TypeScript, Zustand, and Tailwind CSS.

## 🚀 Features

### **Adaptive Quiz Interface**
- **Immediate Re-asking**: Wrong answers trigger instant retry with shuffled choices
- **Real-time Progress**: Dynamic progress indicators with penalty visualization
- **Multi-choice Support**: Single and multiple choice questions with proper validation
- **Mobile Responsive**: Optimized for all device sizes with touch-friendly interface

### **Session Management**
- **Multi-source Wizard**: Step-by-step session creation with source selection
- **Intelligent Validation**: Real-time form validation with helpful error messages
- **Session Configuration**: Adaptive learning settings and preferences
- **Progress Tracking**: Comprehensive session progress with analytics

### **State Management**
- **Zustand Stores**: Lightweight, performant state management
- **Persistent Storage**: Session data persistence across browser sessions
- **Real-time Updates**: Immediate UI updates with optimistic updates
- **Error Handling**: Comprehensive error states and recovery

### **UI/UX Excellence**
- **Framer Motion**: Smooth animations and transitions
- **Tailwind CSS**: Utility-first styling with custom design system
- **Headless UI**: Accessible, unstyled UI components
- **Responsive Design**: Mobile-first approach with breakpoint optimization

## 📦 Technology Stack

### **Core Technologies**
- **React 18**: Latest React with concurrent features
- **TypeScript**: Full type safety and developer experience
- **Vite**: Fast build tool and development server
- **React Router v6**: Client-side routing with modern patterns

### **State Management**
- **Zustand**: Lightweight state management with TypeScript support
- **React Query**: Server state management and caching
- **Immer**: Immutable state updates with Zustand middleware

### **UI Framework**
- **Tailwind CSS**: Utility-first CSS framework with custom configuration
- **Headless UI**: Unstyled, accessible UI components
- **Heroicons**: Beautiful SVG icons
- **Framer Motion**: Animation library for React

### **Development Tools**
- **ESLint**: Code linting with TypeScript rules
- **Prettier**: Code formatting
- **Vitest**: Fast unit testing framework
- **Testing Library**: React component testing utilities

## 🏗️ Project Structure

```
frontend/
├── src/
│   ├── components/           # Reusable UI components
│   │   ├── auth/            # Authentication components
│   │   ├── quiz/            # Quiz-related components
│   │   │   ├── QuestionCard.tsx      # Question display with answers
│   │   │   ├── ProgressIndicator.tsx # Progress visualization
│   │   │   └── QuizSession.tsx       # Main quiz interface
│   │   ├── session/         # Session creation components
│   │   │   ├── SessionWizard.tsx     # Multi-step wizard
│   │   │   ├── SourceSelector.tsx    # Quiz source selection
│   │   │   ├── SessionSettings.tsx   # Adaptive settings
│   │   │   └── SessionReview.tsx     # Configuration review
│   │   └── layout/          # Layout components
│   ├── pages/               # Page components
│   ├── store/               # Zustand stores
│   │   ├── quizStore.ts     # Quiz session state
│   │   ├── sessionStore.ts  # Session creation state
│   │   └── authStore.ts     # Authentication state
│   ├── services/            # API services
│   │   ├── quizApi.ts       # Quiz-related API calls
│   │   └── authApi.ts       # Authentication API calls
│   ├── types/               # TypeScript type definitions
│   ├── hooks/               # Custom React hooks
│   └── utils/               # Utility functions
├── public/                  # Static assets
└── docs/                    # Documentation
```

## 🎯 Key Components

### **QuizSession Component**
Main adaptive quiz interface with:
- Real-time question display
- Answer selection and validation
- Immediate retry flow for wrong answers
- Progress tracking with penalty indicators
- Session control (pause/resume/exit)

### **SessionWizard Component**
Multi-step session creation with:
- Source selection from available quiz providers
- Adaptive learning configuration
- Settings validation and preview
- Session summary and creation

### **Zustand Stores**
- **quizStore**: Quiz session state, question flow, answer processing
- **sessionStore**: Session creation wizard state and validation
- **authStore**: User authentication and profile management

## 🚦 Getting Started

### **Prerequisites**
- Node.js 18+ and npm 9+
- Backend API running (see backend README)

### **Installation**
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### **Development Commands**
```bash
# Type checking
npm run type-check

# Linting
npm run lint
npm run lint:fix

# Testing
npm run test
npm run test:ui
npm run test:coverage
```

## 🎨 Design System

### **Color Palette**
```css
primary:   #3b82f6 (Blue)
secondary: #64748b (Slate)
success:   #22c55e (Green)
warning:   #f59e0b (Amber)
error:     #ef4444 (Red)
```

### **Typography**
- **Headings**: Font weights 600-800
- **Body**: Font weight 400-500
- **UI Elements**: Font weight 500-600

### **Spacing & Layout**
- **Grid System**: CSS Grid and Flexbox
- **Responsive Breakpoints**: sm (640px), md (768px), lg (1024px), xl (1280px)
- **Component Spacing**: 4px base unit (Tailwind spacing scale)

## 📱 Responsive Design

### **Mobile-First Approach**
- Touch-friendly interface with appropriate target sizes
- Optimized layouts for portrait and landscape orientations
- Swipe gestures for quiz navigation (future enhancement)

### **Tablet Optimization**
- Grid layouts optimized for tablet screen sizes
- Touch and mouse input support
- Landscape orientation considerations

### **Desktop Experience**
- Full-width layouts with appropriate max-widths
- Keyboard shortcuts for quiz navigation
- Multi-column layouts for better space utilization

## 🔧 Configuration

### **Environment Variables**
```bash
VITE_API_BASE_URL=http://localhost:3001  # Backend API URL
VITE_APP_NAME=Adaptive Quiz              # Application name
VITE_ENABLE_ANALYTICS=true               # Enable analytics tracking
```

### **Tailwind Configuration**
Custom configuration in `tailwind.config.js`:
- Extended color palette
- Custom animations
- Component utilities
- Responsive breakpoints

### **Vite Configuration**
Optimized build configuration:
- Path aliases for clean imports
- Proxy setup for API calls
- Build optimizations for production

## 🧪 Testing Strategy

### **Unit Tests**
- Component rendering and behavior
- Store actions and state updates
- Utility function testing
- API service mocking

### **Integration Tests**
- User flow testing
- Component interaction testing
- Store integration testing
- API integration testing

### **Accessibility Testing**
- Screen reader compatibility
- Keyboard navigation
- Color contrast validation
- ARIA label verification

## 🚀 Deployment

### **Production Build**
```bash
# Build optimized production bundle
npm run build

# Serve locally for testing
npm run preview
```

### **Docker Deployment**
```dockerfile
# Multi-stage build for optimized image size
FROM node:18-alpine as builder
# ... build steps

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
```

### **Environment-Specific Builds**
- Development: Source maps, hot reload, debug tools
- Staging: Production build with debugging enabled
- Production: Optimized bundle, error tracking, analytics

## 📊 Performance

### **Bundle Size Optimization**
- Code splitting by route and feature
- Dynamic imports for heavy components
- Tree shaking for unused code elimination
- Asset optimization (images, fonts, icons)

### **Runtime Performance**
- React 18 concurrent features
- Optimized re-renders with proper memoization
- Efficient state updates with Zustand
- Lazy loading for non-critical components

### **Core Web Vitals**
- **LCP**: < 2.5s (optimized image loading)
- **FID**: < 100ms (minimal JavaScript blocking)
- **CLS**: < 0.1 (stable layouts, no layout shifts)

## 🔐 Security

### **Authentication**
- JWT token management with automatic refresh
- Secure token storage strategies
- Session timeout handling
- CSRF protection

### **Data Protection**
- Input sanitization and validation
- XSS prevention measures
- Secure API communication
- Privacy-conscious analytics

## 🌐 Internationalization

### **Prepared for i18n**
- String extraction patterns
- Component structure for translations
- Date/time localization
- Number formatting

### **Accessibility**
- WCAG 2.1 AA compliance
- Screen reader optimization
- Keyboard navigation support
- High contrast mode support

## 🤝 Contributing

### **Development Workflow**
1. Fork the repository
2. Create feature branch
3. Implement changes with tests
4. Run linting and type checking
5. Submit pull request

### **Code Standards**
- TypeScript strict mode
- ESLint configuration compliance
- Component composition patterns
- Accessible component design

---

**This frontend provides a production-ready, accessible, and performant interface for the adaptive quiz application with seamless integration to the backend services.**