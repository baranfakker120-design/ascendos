import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // `supabase` und `setup` enthalten Deno-Code (globales `Deno`, andere
  // Runtime). `setup/functions` ist zusätzlich generiert — beides gehört
  // nicht in die Browser-Lint-Konfiguration.
  { ignores: ['dist', 'dev-dist', 'supabase', 'setup'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      import: importPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      // Architektur-Grenze (ADR-012): Features importieren nie aus anderen
      // Features. Erlaubt sind nur @shared und @app-Layouts. Verstoß = Fehler.
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            { target: './src/features/auth', from: './src/features', except: ['./auth'] },
            { target: './src/features/daily-plan', from: './src/features', except: ['./daily-plan'] },
            { target: './src/features/contacts', from: './src/features', except: ['./contacts'] },
            { target: './src/features/coach', from: './src/features', except: ['./coach'] },
            { target: './src/features/more', from: './src/features', except: ['./more'] },
            { target: './src/features/onboarding', from: './src/features', except: ['./onboarding'] },
            { target: './src/features/progress', from: './src/features', except: ['./progress'] },
            { target: './src/shared', from: './src/features' },
            { target: './src/shared', from: './src/app' },
          ],
        },
      ],
    },
  }
);
