import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import logo from 'figma:asset/987108cf9c4e186fbd1d468c6f1509d644b9173e.png';
import { createClient } from '../utils/supabase/client';
import { projectId, publicAnonKey } from '../utils/supabase/info';

interface LoginPageProps {
  onLoginSuccess: (user: any) => void;
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState('oliverharryleonard@gmail.com');
  const [password, setPassword] = useState('123456');
  const [name, setName] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; general?: string }>({});
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const supabase = createClient();

  // Initialize default user on component mount
  useEffect(() => {
    console.log('Initializing default user...');
    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-a4cbc891/init-user`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`,
      },
    })
      .then(res => res.json())
      .then(data => {
        console.log('User initialization response:', data);
        if (data.success) {
          setSuccessMessage('Account ready! You can now login.');
        }
      })
      .catch(err => console.error('Failed to initialize user:', err));
  }, []);

  const handleCreateAccount = async () => {
    setLoading(true);
    setErrors({});
    try {
      console.log('Manually creating account...');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-a4cbc891/init-user`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );
      const result = await response.json();
      console.log('Account creation result:', result);
      
      if (result.success) {
        setSuccessMessage('Account created! Please try logging in now.');
      } else {
        setErrors({ general: result.error || 'Failed to create account' });
      }
    } catch (error) {
      console.error('Create account error:', error);
      setErrors({ general: 'Failed to create account' });
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const newErrors: { email?: string; password?: string; general?: string } = {};

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!emailRegex.test(email)) {
      newErrors.email = 'Please enter a valid email';
    }

    // Password validation
    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setSuccessMessage('');

    if (!validateForm()) return;

    setLoading(true);

    try {
      console.log('Attempting login with:', { email, passwordLength: password.length });
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-a4cbc891/login`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ email, password }),
        }
      );

      const result = await response.json();
      console.log('Login response:', result);

      if (!result.success) {
        console.error('Login error:', result.error);
        setErrors({ general: result.error || 'Invalid email or password' });
      } else {
        console.log('Login successful for user:', result.user.email);
        setSuccessMessage('Login successful!');
        // Store the access token
        localStorage.setItem('accessToken', result.accessToken);
        setTimeout(() => {
          onLoginSuccess(result.user);
        }, 500);
      }
    } catch (error) {
      console.error('Login exception:', error);
      setErrors({ general: 'An unexpected error occurred' });
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setSuccessMessage('');

    if (!validateForm()) return;

    setLoading(true);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-a4cbc891/signup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ email, password, name }),
        }
      );

      const result = await response.json();

      if (!result.success) {
        console.error('Signup error:', result.error);
        setErrors({ general: result.error || 'Failed to create account' });
      } else {
        setSuccessMessage('Account created! You can now log in.');
        setIsSignup(false);
        setEmail('');
        setPassword('');
        setName('');
      }
    } catch (error) {
      console.error('Signup exception:', error);
      setErrors({ general: 'An unexpected error occurred' });
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider: 'google' | 'apple' | 'github') => {
    try {
      setErrors({});
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider,
      });

      if (error) {
        console.error(`${provider} login error:`, error);
        setErrors({ general: `Failed to login with ${provider}` });
      }
    } catch (error) {
      console.error(`${provider} login exception:`, error);
      setErrors({ general: 'An unexpected error occurred' });
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setErrors({ general: 'Please enter your email address first' });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      
      if (error) {
        setErrors({ general: error.message });
      } else {
        setSuccessMessage('Password reset email sent! Check your inbox.');
      }
    } catch (error) {
      console.error('Password reset error:', error);
      setErrors({ general: 'Failed to send reset email' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm md:max-w-md lg:max-w-lg">
        {/* Main login card */}
        <div className="rounded-[48px] md:rounded-[60px] overflow-hidden shadow-2xl">
          {/* Blue section with form */}
          <div className="bg-[#0055FF] px-8 md:px-12 pt-12 md:pt-16 pb-8 md:pb-12 rounded-b-[48px] md:rounded-b-[60px] relative z-10">
            {/* Logo */}
            <div className="text-center mb-12 md:mb-16">
              <img src={logo} alt="taptpay" className="h-20 md:h-24 mx-auto" />
            </div>

            {/* Success message */}
            {successMessage && (
              <div className="mb-4 p-3 md:p-4 bg-[#00E5CC] text-[#0055FF] rounded-full text-center">
                {successMessage}
              </div>
            )}

            {/* General error message */}
            {errors.general && (
              <div className="mb-4 p-3 md:p-4 bg-red-500 text-white rounded-full text-center">
                {errors.general}
              </div>
            )}

            {/* Form */}
            <form onSubmit={isSignup ? handleSignup : handleLogin} className="space-y-6 md:space-y-8">
              {/* Name field (signup only) */}
              {isSignup && (
                <div>
                  <label htmlFor="name" className="block text-[#00E5CC] mb-2 ml-3 md:ml-4">
                    name
                  </label>
                  <input
                    type="text"
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-transparent border-2 border-[#00E5CC] rounded-full px-6 md:px-8 py-4 md:py-5 text-white placeholder-blue-300 focus:outline-none focus:border-[#00FFE5] transition-colors"
                    placeholder=""
                  />
                </div>
              )}

              {/* Email field */}
              <div>
                <label htmlFor="email" className="block text-[#00E5CC] mb-2 ml-3 md:ml-4">
                  email
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors({ ...errors, email: undefined });
                  }}
                  className={`w-full bg-transparent border-2 ${
                    errors.email ? 'border-red-500' : 'border-[#00E5CC]'
                  } rounded-full px-6 md:px-8 py-4 md:py-5 text-white placeholder-blue-300 focus:outline-none focus:border-[#00FFE5] transition-colors`}
                  placeholder=""
                />
                {errors.email && (
                  <p className="text-red-400 mt-2 ml-3 md:ml-4">{errors.email}</p>
                )}
              </div>

              {/* Password field */}
              <div>
                <label htmlFor="password" className="block text-[#00E5CC] mb-2 ml-3 md:ml-4">
                  password
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors({ ...errors, password: undefined });
                  }}
                  className={`w-full bg-transparent border-2 ${
                    errors.password ? 'border-red-500' : 'border-[#00E5CC]'
                  } rounded-full px-6 md:px-8 py-4 md:py-5 text-white placeholder-blue-300 focus:outline-none focus:border-[#00FFE5] transition-colors`}
                  placeholder=""
                />
                {errors.password && (
                  <p className="text-red-400 mt-2 ml-3 md:ml-4">{errors.password}</p>
                )}
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#00E5CC] text-[#0055FF] rounded-full py-4 md:py-5 mt-8 md:mt-10 hover:bg-[#00FFE5] transition-colors text-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'loading...' : isSignup ? 'sign up' : 'login'}
              </button>
            </form>

            {/* Debug: Manual account creation */}
            <button
              onClick={handleCreateAccount}
              disabled={loading}
              className="w-full mt-3 md:mt-4 bg-white/20 text-white rounded-full py-3 md:py-4 hover:bg-white/30 transition-colors text-center text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create Default Account (Debug)'}
            </button>

            {/* Social login buttons */}
            <div className="mt-6 md:mt-8 space-y-3 md:space-y-4">
              <div className="text-center text-[#00E5CC] mb-3 md:mb-4">or continue with</div>
              
              <button
                onClick={() => handleSocialLogin('google')}
                className="w-full bg-white text-[#0055FF] rounded-full py-3 md:py-4 hover:bg-gray-100 transition-colors text-center flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google
              </button>

              <button
                onClick={() => handleSocialLogin('apple')}
                className="w-full bg-black text-white rounded-full py-3 md:py-4 hover:bg-gray-900 transition-colors text-center flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
                Apple
              </button>
            </div>
          </div>

          {/* Cyan bottom section */}
          <div 
            className="bg-[#00E5CC] px-8 md:px-12 py-4 md:py-5 flex items-center justify-center cursor-pointer hover:bg-[#00FFE5] transition-colors -mt-12 md:-mt-14 pt-16 md:pt-20"
            onClick={() => setShowMore(!showMore)}
          >
            <span className="text-[#0055FF] text-center">more</span>
            <ChevronDown 
              className="text-[#0055FF] transition-transform duration-300 ml-2" 
              style={{ transform: showMore ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </div>

          {/* Expandable more section */}
          {showMore && (
            <div className="bg-[#00E5CC] px-8 md:px-12 pb-6 md:pb-8 space-y-3 md:space-y-4">
              <button 
                onClick={handleForgotPassword}
                className="w-full text-left text-[#0055FF] hover:underline"
              >
                Forgot password?
              </button>
              <button 
                onClick={() => {
                  setIsSignup(!isSignup);
                  setErrors({});
                  setSuccessMessage('');
                }}
                className="w-full text-left text-[#0055FF] hover:underline"
              >
                {isSignup ? 'Already have an account? Login' : 'Create account'}
              </button>
              <button className="w-full text-left text-[#0055FF] hover:underline">
                Help & Support
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
