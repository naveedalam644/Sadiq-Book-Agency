# Bookstore & Stationers Management System
> Modern, responsive, and secure bookstore accounting, inventory, and point-of-sale platform.

[![Phase 1 Foundation](https://img.shields.io/badge/Status-Phase%201%20Completed-15803d.svg)]()
[![React](https://img.shields.io/badge/React-19.3-blue.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178c6.svg)]()
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4-38bdf8.svg)]()
[![Firebase](https://img.shields.io/badge/Firebase-v11-ffca28.svg)]()

---

## 1. Project Overview

The **Bookstore & Stationers Management System** is a full-stack web application purpose-built for commercial bookstores, publishing houses, and retail stationers. The business model accommodates three primary customer classifications:
1. **Wholesaler:** Bulk trade customers buying at wholesale discount tiers with credit management.
2. **Parchon (Retail Walk-in):** Over-the-counter cash customers paying standard shelf retail prices.
3. **Marketshop (Local Retailers):** Regular shopkeepers with customized negotiated discount percentages and Khata credit lines.

---

## 2. Current Status: Phase 1 Completed

Development is strictly phased. **Phase 1 (Foundation & Firebase Setup)** has been completed:

* ✅ **Modern React + TypeScript Architecture:** Built on Vite with strict type checks and clean component separation.
* ✅ **Mobile-First Responsive Design:** Adaptive layouts verified on mobile phones (iOS/Android), tablets, laptops, and ultra-wide desktop monitors.
* ✅ **Firebase Authentication:** Secure admin email/password login, persistent local sessions, friendly error handling, and protected routes.
* ✅ **Zero Public Registration:** Customer self-registration is permanently disabled; operator accounts are provisioned via administrative channels.
* ✅ **Firestore Security Rules:** Zero-trust architecture in `firestore.rules` denying unauthorized public database access.
* ✅ **13-Collection Database Architecture:** Full schema specifications defined in `DATABASE_ARCHITECTURE.md` and type-safe in `src/types/database.ts`.
* ✅ **Dashboard Shell:** Clean UI with time-aware greeting, business branding, empty metric cards (strictly zero fake transactions), recent activity placeholder, and quick actions.
* ✅ **System Diagnostics View:** Integrated environment verification and connection status tool.

---

## 3. Technology Stack

* **Frontend Framework:** React 19 + TypeScript
* **Bundler & Tooling:** Vite 8
* **Styling & Theme:** Tailwind CSS 3.4 (with customized emerald & slate palette)
* **Routing:** React Router v7 (`react-router-dom`)
* **Icons:** Lucide React
* **Backend & Cloud:** Google Firebase (Authentication, Cloud Firestore, Firebase Storage)

---

## 4. Project Folder Structure

```text
BOOKSTORE/
├── .env.example                     # Environment template for Firebase credentials
├── .gitignore                       # Git ignore preventing secret commits
├── DATABASE_ARCHITECTURE.md         # Full specification of all 13 Firestore collections
├── FIREBASE_SETUP.md                # Step-by-step setup guide for store owner
├── PHASE_1_TESTING.md               # QA test report & responsiveness matrix
├── README.md                        # Project documentation
├── firebase.json                    # Firebase hosting & Firestore rules deployment config
├── firestore.rules                  # Production Firestore security rules
├── index.html                       # HTML5 entry with Inter font & viewport meta
├── package.json                     # Dependencies & npm scripts
├── postcss.config.js                # PostCSS Tailwind config
├── tailwind.config.js               # Tailwind design system & theme tokens
├── tsconfig.json                    # TypeScript project references
├── tsconfig.app.json                # TypeScript strict client compiler config
├── vite.config.ts                   # Vite bundler config with chunk optimization
└── src/
    ├── App.tsx                      # Root component with Providers & Routing
    ├── index.css                    # Tailwind directives & global utility styling
    ├── main.tsx                     # React DOM entry
    ├── components/
    │   ├── common/                  # Reusable UI component library
    │   │   ├── Badge.tsx            # Status pills (success, warning, info, neutral)
    │   │   ├── Button.tsx           # Button with variants, sizes, loading spinners
    │   │   ├── Card.tsx             # Modular card primitives
    │   │   ├── Input.tsx            # Form inputs with icons & error feedback
    │   │   ├── Modal.tsx            # Accessible modal dialog with backdrop
    │   │   ├── PageHeader.tsx       # Standardized header banner with actions
    │   │   ├── StatCard.tsx         # Dashboard metric card (supports empty state)
    │   │   └── Table.tsx            # Responsive horizontal-scrolling table
    │   ├── feedback/                # User alerts & progress feedback
    │   │   ├── AlertBanner.tsx      # System notice banners
    │   │   ├── EmptyState.tsx       # Clean placeholders for upcoming modules
    │   │   └── LoadingSpinner.tsx   # Bookstore branded loading indicators
    │   └── layout/                  # Structural layout components
    │       ├── AppLayout.tsx        # Main shell connecting sidebar, header, footer
    │       ├── Footer.tsx           # Application status & copyright
    │       ├── Header.tsx           # Top navigation bar with user chip & status
    │       ├── MobileNav.tsx        # Slide-over navigation drawer for phones
    │       └── Sidebar.tsx          # Desktop navigation sidebar with phase tags
    ├── config/
    │   └── firebase.ts              # Firebase initialization & resilience fallback
    ├── contexts/
    │   ├── AuthContext.tsx          # Firebase authentication state & persistence
    │   └── ToastContext.tsx         # Global notification toast provider
    ├── hooks/
    │   ├── useAuth.ts               # Hook to access current user & auth methods
    │   └── useToast.ts              # Hook to trigger notifications
    ├── pages/
    │   ├── Dashboard.tsx            # Main shell with metric placeholders & roadmap
    │   ├── Login.tsx                # Secure administrator login page
    │   ├── NotFound.tsx             # 404 handler
    │   └── SystemStatus.tsx         # Firebase diagnostics & manual setup checklist
    ├── routes/
    │   ├── AppRoutes.tsx            # Application route definitions
    │   └── ProtectedRoute.tsx       # Route guard redirecting anonymous traffic
    ├── types/
    │   ├── auth.ts                  # User, admin profile, credentials types
    │   └── database.ts              # Strong types for all 13 Firestore collections
    └── utils/
        ├── firebaseErrors.ts        # Friendly error code mapper
        └── formatters.ts            # Currency, date, and greeting helpers
```

---

## 5. Quick Start Instructions

### Prerequisites
* **Node.js:** v18.0.0 or later (v24 LTS recommended)
* **npm:** v9.0.0 or later

### Installation & Execution

1. **Clone or open the project directory:**
   ```bash
   cd F:\BOOKSTORE
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment:**
   ```bash
   cp .env.example .env
   ```
   *Edit `.env` and provide your Firebase project keys (see [FIREBASE_SETUP.md](file:///F:/BOOKSTORE/FIREBASE_SETUP.md)).*

4. **Start the local development server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

5. **Create a production build:**
   ```bash
   npm run build
   ```

6. **Preview the production build locally:**
   ```bash
   npm run preview
   ```

---

## 6. Phased Implementation Roadmap

* **Phase 1: Foundation & Firebase Setup** *(Completed)*
* **Phase 2: Product & Inventory Management** *(Next Phase — Awaiting Approval)*
  * Books, registers, exercise notebooks catalog
  * Barcodes & SKU generation
  * Cost, wholesale, and retail price tiers
  * Stock adjustment and movement audit trail
* **Phase 3: Customer Profiles & Khata (Udhaar) Management**
* **Phase 4: Sales, Billing & Thermal Printing (POS)**
* **Phase 5: Purchases & Supplier Accounting**
* **Phase 6: Expense Tracking & Daily Cash Closing**
* **Phase 7: Financial Reports, P&L, and Automated Backups**
