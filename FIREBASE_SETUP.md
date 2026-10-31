# Firebase Setup Guide for Bookstore Owner
**Project:** Bookstore Management System  
**Phase:** Phase 1 — Foundation & Authentication Setup  
**Target User:** Bookstore Owner / System Administrator

This document provides a complete, step-by-step walkthrough to connect your web application to Google Firebase. Follow each step sequentially.

---

## Step 1: Create a Google Firebase Project

1. Open your web browser and navigate to the **[Firebase Console](https://console.firebase.google.com/)**.
2. Sign in with your store's Google account.
3. Click **Add project** (or **Create a project**).
4. Enter your project name (e.g. `alnoor-bookstore` or `bookstore-management`).
5. Choose whether to enable Google Analytics (optional, recommended for tracking store portal usage), then click **Create project**.
6. Wait 15–30 seconds for Firebase to finish provisioning, then click **Continue**.

---

## Step 2: Register the Web Application

1. In the Firebase Project Overview screen, click the **Web icon** (`</>`) to add a web application.
2. Enter an App nickname, for example: `Bookstore Web App`.
3. *(Optional)* Check the box for **Also set up Firebase Hosting** if you intend to host the website on Firebase.
4. Click **Register app**.
5. Firebase will display your SDK configuration snippet containing keys like `apiKey`, `authDomain`, `projectId`, `storageBucket`, etc.
6. Keep this window open; you will copy these values into your `.env` file in Step 6.

---

## Step 3: Enable Email / Password Authentication

1. In the left-hand navigation menu of Firebase Console, click **Build > Authentication**.
2. Click **Get Started**.
3. Under the **Sign-in method** tab, select **Email/Password**.
4. Toggle **Enable** to ON for *Email/Password*.
5. Leave *Email link (passwordless sign-in)* set to OFF.
6. Click **Save**.

---

## Step 4: Create the Administrator Account

> **Important Security Rule:** This application does not allow public user registration. All bookstore staff accounts must be provisioned directly by the store administrator.

1. Under **Authentication**, click on the **Users** tab.
2. Click the **Add user** button.
3. Enter your administrator email (e.g. `admin@yourbookstore.com`).
4. Enter a strong, secure password (minimum 8 characters with numbers and symbols).
5. Click **Add user**.
6. Note the unique **User UID** generated for your account.

---

## Step 5: Create Cloud Firestore Database

1. In the left-hand menu, navigate to **Build > Firestore Database**.
2. Click **Create database**.
3. Choose a database location geographically close to your bookstore for fastest response time:
   * **Asia South 1 (Mumbai)** or **Asia Southeast 1 (Singapore)** are recommended for South Asia.
4. When prompted for security rules, choose **Start in production mode** (all unauthorized reads and writes denied by default).
5. Click **Create** and wait for the database to provision.

---

## Step 6: Deploy Firestore Security Rules

1. In Firestore Database, click the **Rules** tab at the top.
2. Replace all existing text in the editor with the contents of the `firestore.rules` file included in this repository:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthenticated() {
      return request.auth != null;
    }

    function isAdmin() {
      return isAuthenticated() && (
        request.auth.token.admin == true ||
        (exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin' &&
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isActive == true)
      );
    }

    function isSelf(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }

    // Deny all public access by default
    match /{document=**} {
      allow read, write: if false;
    }

    // Users: Users can read their own profile; admins manage all
    match /users/{userId} {
      allow read: if isSelf(userId) || isAdmin();
      allow create, update, delete: if isAdmin();
    }

    // System settings
    match /settings/{settingId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }

    // Audit logs
    match /auditLogs/{logId} {
      allow read: if isAdmin();
      allow create: if isAuthenticated();
      allow update, delete: if false;
    }

    // Business collections (Reserved for subsequent phases)
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
}
```

3. Click **Publish**.

*(Alternatively, if you use the Firebase CLI on your terminal, run `firebase deploy --only firestore:rules`)*.

---

## Step 7: Create the Admin User Profile Document

To link your Firebase Auth account with the admin role in Firestore:

1. In Firestore Database, click the **Data** tab.
2. Click **Start collection**.
3. Set **Collection ID** to: `users`
4. Set **Document ID** to: *[Paste your Admin User UID from Step 4]*
5. Add the following fields:
   * `displayName` (string): `Store Administrator`
   * `email` (string): `admin@yourbookstore.com`
   * `role` (string): `admin`
   * `isActive` (boolean): `true`
   * `createdAt` (string): `2026-10-31T08:00:00Z`
6. Click **Save**.

---

## Step 8: Configure Environment Variables

1. In the project folder on your computer, locate `.env.example`.
2. Copy `.env.example` to create a file named `.env`:
   ```bash
   cp .env.example .env
   ```
3. Open `.env` in your text editor.
4. Replace the placeholders with the real values from **Firebase Console > Project Settings > General > Your apps**:

```env
VITE_FIREBASE_API_KEY=AIzaSy...your-actual-api-key...
VITE_FIREBASE_AUTH_DOMAIN=alnoor-bookstore.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=alnoor-bookstore
VITE_FIREBASE_STORAGE_BUCKET=alnoor-bookstore.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef123456
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX

# Business Information
VITE_APP_NAME="Bookstore Management System"
VITE_BUSINESS_NAME="Al-Noor Books & Stationers"
```

5. Save the file. **Never commit the `.env` file to Git.**

---

## Step 9: Launch & Verify

1. Run the development server:
   ```bash
   npm run dev
   ```
2. Open `http://localhost:5173` in your browser.
3. You will be redirected to the **Admin Login** page.
4. Sign in with the administrator email and password you created in Step 4.
5. Once signed in, visit **Firebase & System** in the sidebar to run a diagnostic test. A green badge `Firebase Connected` confirms everything is operating correctly.

