import React, { useState } from 'react';
import { ArrowRight, Compass, ShieldCheck, Zap, Sparkles, AlertCircle } from 'lucide-react';
import { authService } from '../services/authService';
import { User } from 'firebase/auth';

interface WelcomeScreenProps {
  onGoogleSignInSuccess: (user: User) => void;
  onExploreDemo: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onGoogleSignInSuccess,
  onExploreDemo,
}) => {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setAuthError(null);

    const result = await authService.signInWithGoogle();
    setIsSigningIn(false);

    if (result.user) {
      onGoogleSignInSuccess(result.user);
    } else if (result.error) {
      setAuthError(result.error);
    }
  };

  return (
    <div className="min-h-screen bg-[#DDE3E8] flex flex-col justify-between">
      {/* Top minimal header */}
      <header className="px-6 py-5 flex items-center justify-between max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-extrabold tracking-tight text-[#3A0F34] font-display">
            VibeMatch
          </span>
          <span className="w-2.5 h-2.5 rounded-full bg-[#EAAA00]" />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onExploreDemo}
            className="text-xs font-semibold text-[#3A0F34] hover:text-[#52184A] px-3 py-1.5 rounded-lg border border-[#3A0F34]/25 hover:border-[#3A0F34] transition-colors"
          >
            Explore as Guest Demo
          </button>
        </div>
      </header>

      {/* Main Hero Container */}
      <main className="max-w-4xl mx-auto px-5 py-6 sm:py-10 flex-1 flex flex-col justify-center">
        {/* Hero Card */}
        <div className="bg-[#3A0F34] text-white rounded-3xl p-7 sm:p-12 shadow-xl relative overflow-hidden">
          {/* Subtle geometric background accents */}
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-[#52184A]/60 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 rounded-full bg-[#EAAA00]/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-2xl">
            {/* Campus Tagline */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white/10 rounded-full text-xs text-[#DDE3E8] mb-6">
              <Sparkles className="w-3.5 h-3.5 text-[#EAAA00]" />
              <span className="font-semibold">Firebase Authentication & Cloud Firestore Active</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold font-display tracking-tight text-white leading-tight">
              Free time? <br />
              <span className="text-[#EAAA00]">Find your people.</span>
            </h1>

            <p className="mt-4 text-sm sm:text-base text-[#DDE3E8]/90 leading-relaxed max-w-xl">
              Discover, create, and join spontaneous campus activities with compatible classmates in real time. Skip awkward group chats and meet up for badminton, cricket, coffee runs, and study squads.
            </p>

            {/* Authentication Error Banner */}
            {authError && (
              <div className="mt-6 p-4 bg-red-500/20 border border-red-400/40 rounded-2xl flex items-start gap-2.5 text-xs text-red-200">
                <AlertCircle className="w-4 h-4 shrink-0 text-[#EAAA00] mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold block text-white">Sign-In Notice</span>
                  <p>{authError}</p>
                </div>
              </div>
            )}

            {/* CTAs */}
            <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Primary Google Sign-In Button */}
              <button
                onClick={handleGoogleSignIn}
                disabled={isSigningIn}
                className="py-3.5 px-6 bg-[#EAAA00] hover:bg-[#D69900] active:scale-95 text-[#240720] font-bold text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2.5 disabled:opacity-70"
              >
                {isSigningIn ? (
                  <>
                    <div className="w-4 h-4 border-2 border-[#240720] border-t-transparent rounded-full animate-spin" />
                    <span>Connecting Google Auth...</span>
                  </>
                ) : (
                  <>
                    {/* Google G SVG */}
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>Continue with Google</span>
                    <ArrowRight className="w-4 h-4 ml-0.5" />
                  </>
                )}
              </button>

              {/* Guest / Demo Option */}
              <button
                onClick={onExploreDemo}
                className="py-3.5 px-6 bg-white/10 hover:bg-white/20 text-white font-semibold text-sm rounded-xl transition-colors text-center"
              >
                Explore Sample Campus (Alex Chen Demo)
              </button>
            </div>
          </div>
        </div>

        {/* 3 Core Value Pillars */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/80 backdrop-blur-xs p-5 rounded-2xl border border-slate-200/90 shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-[#3A0F34] text-[#EAAA00] flex items-center justify-center mb-3">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-[#3A0F34]">Spontaneous Squads</h3>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              Got 45 minutes between classes? Tap &apos;Who&apos;s Free Right Now&apos; or launch a quick sport/coffee squad instantly.
            </p>
          </div>

          <div className="bg-white/80 backdrop-blur-xs p-5 rounded-2xl border border-slate-200/90 shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-[#3A0F34] text-[#EAAA00] flex items-center justify-center mb-3">
              <Compass className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-[#3A0F34]">Cloud Profile Storage</h3>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              Securely store your student profile, campus affiliation, and preferred availability in Firestore with strict security rules.
            </p>
          </div>

          <div className="bg-white/80 backdrop-blur-xs p-5 rounded-2xl border border-slate-200/90 shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-[#3A0F34] text-[#EAAA00] flex items-center justify-center mb-3">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-[#3A0F34]">Public Campus Venues</h3>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              Always at designated public campus spots like rec centers, student unions, and library hubs—never hidden or off-campus.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-slate-500 border-t border-slate-300/60 max-w-5xl mx-auto w-full px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>VibeMatch · Campus Social Platform</span>
        <span className="text-slate-400">Powered by Firebase Authentication & Cloud Firestore</span>
      </footer>
    </div>
  );
};
