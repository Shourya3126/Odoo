# 💼 Expense Reimbursement Management System

A production-ready, full-stack expense management platform with multi-tenant support, dynamic approval workflows, OCR receipt parsing, and real-time multi-currency handling.

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + TypeScript + Vite + Tailwind CSS |
| **Backend** | Express.js + TypeScript |
| **Database** | PostgreSQL (Knex.js ORM) |
| **Cache** | Redis |
| **OCR** | Tesseract.js |
| **Real-time** | Socket.IO |
| **Auth** | JWT |

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+
- **PostgreSQL** running locally
- **Redis** (optional, system works without it)

### 1. Setup Database

```bash
# Create the PostgreSQL database
psql -U postgres -c "CREATE DATABASE expense_reimbursement;"
```

### 2. Backend

```bash
cd backend
cp .env .env.local  # Edit with your DB credentials

npm install
npm run migrate     # Run database migrations
npm run dev         # Starts on http://localhost:3001
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev         # Starts on http://localhost:5173
```

### 4. Open App

Navigate to `http://localhost:5173` → Sign up to create your company + admin account.

## 📋 Features

### Multi-Tenancy
- Company isolation via `company_id` on all tables
- Signup auto-creates company + admin + default expense categories
- Country → base currency auto-mapping

### Authentication
- JWT-based signup/login
- Forgot password with temporary password email
- Force reset on next login

### User Management (Admin)
- Create/edit/deactivate users
- Role assignment: Employee, Manager, Admin
- Manager hierarchy
- "Send Password" button with email notification

### Expense Module
- Full CRUD with Draft → Submitted → Pending Approval → Approved/Rejected state machine
- Receipt upload (10MB limit)
- Multi-currency with live exchange rate conversion
- Status-based locking (submitted = locked)

### OCR Receipt Scanning
- Upload receipt image → Tesseract.js extracts text
- Auto-parses amount, date, vendor
- One-click auto-fill of expense form

### Currency System
- Live rates from exchangerate-api.com
- Redis caching (1-hour TTL)
- DB fallback for offline scenarios
- Real-time conversion preview on expense form

### Approval Workflows
- Configurable multi-step approval chains
- Sequential and Parallel step types
- Approver types: Specific User, Manager, Role-based
- Manager-first mode (auto-inserts manager as step 0)
- Required approver logic (rejection = auto-reject)
- Percentage-based threshold (e.g., 60% approval)
- Full approval timeline with comments

### Real-Time
- Socket.IO WebSocket events
- Live notifications on expense submission/approval

### Audit Trail
- Complete log of all actions (create, submit, approve, reject)
- Actor tracking with timestamps
- Visible in expense detail UI

## 🎨 UI Features

- **Dark mode** with glassmorphism design (toggle to light mode)
- Responsive sidebar navigation
- Role-based menu visibility
- Search + filter on all tables
- Approval timeline component
- Workflow builder with dynamic step/approver management
- Toast notifications

## 📁 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/signup` | Create company + admin |
| POST | `/api/auth/login` | Login, get JWT |
| POST | `/api/auth/forgot-password` | Temp password email |
| GET | `/api/auth/me` | Current user profile |
| POST | `/api/users` | Create user (admin) |
| GET | `/api/users` | List company users |
| PATCH | `/api/users/:id` | Update user |
| POST | `/api/users/:id/send-password` | Email temp password |
| POST | `/api/expenses` | Create expense |
| GET | `/api/expenses` | List expenses |
| GET | `/api/expenses/:id` | Expense detail + timeline |
| POST | `/api/expenses/:id/submit` | Submit draft |
| GET | `/api/approvals/pending` | Pending for current user |
| POST | `/api/approvals/:id/approve` | Approve with comment |
| POST | `/api/approvals/:id/reject` | Reject with comment |
| POST | `/api/approvals/flows` | Create workflow |
| GET | `/api/approvals/flows` | List workflows |
| GET | `/api/currency/rates` | Exchange rates |
| GET | `/api/currency/convert` | Currency conversion |
| POST | `/api/ocr` | OCR receipt parsing |
