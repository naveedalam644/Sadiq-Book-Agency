/**
 * Maps Firebase Auth error codes to user-friendly messages for bookstore operators.
 */
export const getFriendlyErrorMessage = (errorCode: string): string => {
  switch (errorCode) {
    case 'auth/invalid-email':
      return 'The email address format is invalid. Please check your email and try again.';
    case 'auth/user-not-found':
      return 'No registered account found with this email. Please contact the bookstore administrator.';
    case 'auth/wrong-password':
      return 'The password entered is incorrect. Please check your credentials and try again.';
    case 'auth/invalid-credential':
      return 'Invalid email or password. Please verify your login credentials.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact the system administrator.';
    case 'auth/too-many-requests':
      return 'Too many failed login attempts. Access has been temporarily restricted for security. Please wait a few minutes.';
    case 'auth/network-request-failed':
      return 'Network connection failed. Please check your internet connection and try again.';
    case 'auth/api-key-not-valid':
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
      return 'Firebase API key is invalid or not yet configured. Please set up your .env file with valid Firebase credentials.';
    case 'auth/quota-exceeded':
      return 'Authentication quota exceeded. Please contact your Firebase project administrator.';
    case 'auth/internal-error':
      return 'An internal authentication error occurred. Please refresh the page and try again.';
    default:
      if (errorCode.includes('api-key')) {
        return 'Firebase credentials not yet configured. Please enter your Firebase project credentials in .env.';
      }
      return 'Authentication failed. Please verify your email and password.';
  }
};
