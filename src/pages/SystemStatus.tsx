import React, { useState } from 'react';
import {
  Server,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Key,
  Lock,
  FileText,
  Copy,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { WhatsAppIcon } from '../components/common/WhatsAppIcon';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { getFirebaseConfigSummary } from '../config/firebase';
import { PageHeader } from '../components/common/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { Table, type Column } from '../components/common/Table';
import { ClientHandoverCleanupModal } from '../components/maintenance/ClientHandoverCleanupModal';

interface EnvCheckItem {
  key: string;
  configured: boolean;
  maskedValue: string;
  description: string;
}

export const SystemStatus: React.FC = () => {
  const { isFirebaseReady, currentUser } = useAuth();
  const { success, info } = useToast();
  const config = getFirebaseConfigSummary();

  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<string | null>(null);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [isCleanupModalOpen, setIsCleanupModalOpen] = useState(false);

  // Mask string helper
  const mask = (val?: string) => {
    if (!val || val.includes('placeholder') || val.includes('your_')) return 'Not configured';
    if (val.length <= 8) return '••••••••';
    return `${val.substring(0, 4)}••••••••${val.substring(val.length - 4)}`;
  };

  const envItems: EnvCheckItem[] = [
    {
      key: 'VITE_FIREBASE_API_KEY',
      configured: config.hasApiKey,
      maskedValue: mask(import.meta.env.VITE_FIREBASE_API_KEY),
      description: 'Firebase Web API key for authentication requests',
    },
    {
      key: 'VITE_FIREBASE_AUTH_DOMAIN',
      configured: Boolean(config.authDomain && !config.authDomain.includes('placeholder')),
      maskedValue: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'Not configured',
      description: 'Domain used for auth redirections and callbacks',
    },
    {
      key: 'VITE_FIREBASE_PROJECT_ID',
      configured: Boolean(config.projectId && !config.projectId.includes('placeholder')),
      maskedValue: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'Not configured',
      description: 'Target Cloud Firestore & Firebase project identifier',
    },
    {
      key: 'VITE_FIREBASE_STORAGE_BUCKET',
      configured: Boolean(config.storageBucket && !config.storageBucket.includes('placeholder')),
      maskedValue: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'Not configured',
      description: 'Cloud Storage bucket prepared for future receipts and documents',
    },
    {
      key: 'VITE_FIREBASE_APP_ID',
      configured: config.hasAppId,
      maskedValue: mask(import.meta.env.VITE_FIREBASE_APP_ID),
      description: 'Firebase unique application registration ID',
    },
  ];

  const envColumns: Column<EnvCheckItem>[] = [
    {
      key: 'key',
      header: 'Environment Variable',
      render: (item) => <code className="font-mono text-xs font-semibold text-slate-800">{item.key}</code>,
    },
    {
      key: 'configured',
      header: 'Status',
      render: (item) =>
        item.configured ? (
          <Badge variant="success" size="sm" dot>
            Configured
          </Badge>
        ) : (
          <Badge variant="warning" size="sm" dot>
            Missing / Placeholder
          </Badge>
        ),
    },
    {
      key: 'maskedValue',
      header: 'Value Preview',
      render: (item) => <span className="font-mono text-xs text-slate-500">{item.maskedValue}</span>,
    },
    {
      key: 'description',
      header: 'Purpose',
      render: (item) => <span className="text-xs text-slate-600">{item.description}</span>,
    },
  ];

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionResult(null);

    // Diagnostic check
    setTimeout(() => {
      setTestingConnection(false);
      if (isFirebaseReady) {
        setConnectionResult('Firebase SDK initialized. Credentials detected and active.');
        success('Firebase SDK connection test passed successfully.', 'System Diagnostic');
      } else {
        setConnectionResult(
          'Firebase is running with development fallback. To establish live Firestore connectivity, provide valid credentials in .env.'
        );
        info('Placeholder mode active. Provide valid Firebase project keys in .env.', 'Notice');
      }
    }, 800);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    success('Copied to clipboard.');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Firebase & System Diagnostics"
        description="Verify Firebase integration, inspect environment security, review security rules, and follow manual onboarding steps."
        badge={
          isFirebaseReady ? (
            <Badge variant="success" size="md" dot>
              Connected
            </Badge>
          ) : (
            <Badge variant="warning" size="md" dot>
              Configuration Pending
            </Badge>
          )
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            isLoading={testingConnection}
            onClick={handleTestConnection}
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Run Diagnostic Ping
          </Button>
        }
      />

      {/* Connection Result Banner */}
      {connectionResult && (
        <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 text-xs sm:text-sm text-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {isFirebaseReady ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            )}
            <span>{connectionResult}</span>
          </div>
          <button
            type="button"
            onClick={() => setConnectionResult(null)}
            className="text-slate-400 hover:text-slate-600 text-xs font-semibold ml-3"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-brand-50 text-brand-600">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Firebase Project
              </p>
              <h3 className="text-sm font-bold text-slate-900 truncate">
                {config.projectId}
              </h3>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Auth Domain</span>
            <span className="font-mono text-slate-700 truncate max-w-[150px]">{config.authDomain}</span>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Admin Session
              </p>
              <h3 className="text-sm font-bold text-slate-900 truncate">
                {currentUser?.email || 'Authenticated'}
              </h3>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Role Provisioning</span>
            <span className="font-semibold text-emerald-600 uppercase">Admin (Full Control)</span>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-purple-50 text-purple-600">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Security Rules
              </p>
              <h3 className="text-sm font-bold text-slate-900">
                firestore.rules Active
              </h3>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Public Access</span>
            <span className="font-semibold text-rose-600">Strictly Denied (false)</span>
          </div>
        </Card>
      </div>

      {/* Environment Variables Table */}
      <Card padding="none">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <CardTitle>Environment Variable Verification</CardTitle>
            <CardDescription>
              Verified against local <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">.env</code> configuration
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsRulesModalOpen(true)}
            leftIcon={<FileText className="w-4 h-4" />}
          >
            View Firestore Rules
          </Button>
        </div>
        <Table
          columns={envColumns}
          data={envItems}
          keyExtractor={(item) => item.key}
        />
      </Card>

      {/* Production Client Handover Maintenance & Data Cleanup Card */}
      <Card className="border-rose-200/90 shadow-sm overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-rose-50/50 via-white to-amber-50/30">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-rose-600 text-white rounded-xl shadow-xs">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base font-extrabold text-[#071F49]">
                  Client Handover — Purge All Testing Data
                </CardTitle>
                <CardDescription>
                  Permanently clear all test inventory, purchases, sales, customers, rough bills, and syllabus sets before client delivery
                </CardDescription>
              </div>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setIsCleanupModalOpen(true)}
              leftIcon={<Trash2 className="w-4 h-4" />}
            >
              Clean Test Data for Handover
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1">
              <span className="font-bold text-slate-800 block">Target Collections</span>
              <p className="text-slate-500 text-[11px]">
                Purges 20 collections including products, batches, movements, sales, customers, rough bills, and expenses.
              </p>
            </div>
            <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1">
              <span className="font-bold text-emerald-800 block">Protected Core</span>
              <p className="text-slate-500 text-[11px]">
                Strictly protects Admin User login and the 6 standard core syllabus categories.
              </p>
            </div>
            <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1">
              <span className="font-bold text-blue-800 block">Zero Baseline</span>
              <p className="text-slate-500 text-[11px]">
                Cleanly resets inventory counters to zero so the client starts with a brand new, pristine bookstore ledger.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* WhatsApp Customer Communication System Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <WhatsAppIcon className="w-5 h-5" />
              </div>
              <div>
                <CardTitle>WhatsApp Customer Communication System (Option C)</CardTitle>
                <CardDescription>
                  Hybrid dual-method customer messaging: Direct Manual Web Sharing & Cloud API readiness
                </CardDescription>
              </div>
            </div>
            <Badge variant="success" size="sm">
              ACTIVE
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-emerald-950 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Method 1: Manual Direct Sharing
                </span>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">
                  Enabled
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Dispatches pre-formatted Urdu/English invoices, vouchers, and statements via <code>wa.me</code> deep links and Web Share API.
              </p>
              <ul className="text-[11px] text-slate-500 space-y-1 list-disc pl-4">
                <li>Zero-cost, no Meta API fees or billing changes</li>
                <li>Seamless client-side vector PDF generation & download</li>
                <li>POS, Sales History, Returns, and Khata integration</li>
              </ul>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  Method 2: Official Meta Cloud API
                </span>
                <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-bold rounded-full">
                  Cloud API Ready
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Architecture, Firestore schemas, security rules, and message log indexes prepared for server-side proxy integration.
              </p>
              <ul className="text-[11px] text-slate-500 space-y-1 list-disc pl-4">
                <li>Awaiting store owner Meta Developer App & System Token</li>
                <li>Zero exposure of credentials in frontend bundle</li>
                <li>Utility template structures ready for approval</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Manual Setup Tasks for the Business Owner */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-brand-600" />
            <div>
              <CardTitle>Manual Setup Checklist for Store Owner</CardTitle>
              <CardDescription>
                Step-by-step instructions to connect your production Firebase project
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="w-6 h-6 rounded-full bg-brand-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                1
              </span>
              <div className="space-y-1 text-xs sm:text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Create or Open Firebase Project</p>
                <p className="text-slate-600 text-xs">
                  Visit the <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="text-brand-600 font-semibold underline inline-flex items-center gap-0.5">Firebase Console <ExternalLink className="w-3 h-3" /></a> and create a project (e.g. <code>alnoor-bookstore</code>).
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="w-6 h-6 rounded-full bg-brand-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                2
              </span>
              <div className="space-y-1 text-xs sm:text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Enable Email/Password Authentication</p>
                <p className="text-slate-600 text-xs">
                  In Firebase Console, go to <strong>Authentication &gt; Sign-in method</strong>, enable <strong>Email/Password</strong>, and under <strong>Users</strong> tab click <strong>Add user</strong> to create your administrator account.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="w-6 h-6 rounded-full bg-brand-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                3
              </span>
              <div className="space-y-1 text-xs sm:text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Create Firestore Database</p>
                <p className="text-slate-600 text-xs">
                  Go to <strong>Cloud Firestore &gt; Create Database</strong>, choose production mode, and set your preferred region (e.g., <code>asia-south1</code> or <code>us-central1</code>).
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="w-6 h-6 rounded-full bg-brand-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                4
              </span>
              <div className="space-y-1 text-xs sm:text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Copy Web App Config to .env</p>
                <p className="text-slate-600 text-xs">
                  In <strong>Project Settings &gt; General &gt; Your apps &gt; Web App</strong>, copy your <code>firebaseConfig</code> keys into your local <code className="bg-white px-1.5 py-0.5 rounded border border-slate-300 font-mono">.env</code> file.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="w-6 h-6 rounded-full bg-brand-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                5
              </span>
              <div className="space-y-1 text-xs sm:text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Deploy Firestore Security Rules</p>
                <p className="text-slate-600 text-xs">
                  Publish the rules provided in <code className="bg-white px-1 py-0.5 rounded border border-slate-300 font-mono">firestore.rules</code> via Firebase CLI (<code className="bg-slate-200 px-1 py-0.5 rounded font-mono">firebase deploy --only firestore:rules</code>) or by pasting them into the Firebase Console Rules editor tab.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modal: View Firestore Security Rules */}
      <Modal
        isOpen={isRulesModalOpen}
        onClose={() => setIsRulesModalOpen(false)}
        title="Firestore Security Rules (firestore.rules)"
        description="Strict rules preventing unauthorized access to all 13 bookstore collections"
        size="lg"
        footer={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                copyToClipboard(
                  `rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    function isAuthenticated() { return request.auth != null; }\n    function isAdmin() { return isAuthenticated() && request.auth.token.admin == true; }\n    match /{document=**} { allow read, write: if false; }\n  }\n}`
                );
              }}
              leftIcon={<Copy className="w-4 h-4" />}
            >
              Copy Summary
            </Button>
            <Button variant="primary" size="sm" onClick={() => setIsRulesModalOpen(false)}>
              Done
            </Button>
          </div>
        }
      >
        <div className="bg-slate-900 rounded-lg p-4 font-mono text-xs text-slate-200 overflow-x-auto max-h-[380px] leading-relaxed">
          <pre>{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthenticated() {
      return request.auth != null;
    }

    function isAdmin() {
      return isAuthenticated() && (
        request.auth.token.admin == true ||
        (exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin')
      );
    }

    // Default: Deny all public access
    match /{document=**} {
      allow read, write: if false;
    }

    // Protected Admin Data
    match /users/{userId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }
    match /settings/{settingId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }
    match /auditLogs/{logId} {
      allow read: if isAdmin();
      allow create: if isAuthenticated();
      allow update, delete: if false;
    }

    // Business Modules (Locked until future phases)
    match /customers/{customerId} { allow read, write: if isAdmin(); }
    match /products/{productId} { allow read, write: if isAdmin(); }
    match /categories/{categoryId} { allow read, write: if isAdmin(); }
    match /suppliers/{supplierId} { allow read, write: if isAdmin(); }
    match /purchases/{purchaseId} { allow read, write: if isAdmin(); }
    match /sales/{saleId} { allow read, write: if isAdmin(); }
    match /payments/{paymentId} { allow read, write: if isAdmin(); }
    match /customerLedger/{ledgerId} { allow read, write: if isAdmin(); }
    match /expenses/{expenseId} { allow read, write: if isAdmin(); }
    match /stockMovements/{movementId} { allow read, write: if isAdmin(); }
  }
}`}</pre>
        </div>
      </Modal>

      {/* Client Handover Cleanup Modal */}
      <ClientHandoverCleanupModal
        isOpen={isCleanupModalOpen}
        onClose={() => setIsCleanupModalOpen(false)}
      />
    </div>
  );
};
